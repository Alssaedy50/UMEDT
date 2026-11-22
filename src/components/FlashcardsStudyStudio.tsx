import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Volume2,
  RotateCcw,
  Check,
  X,
  HelpCircle,
  Shuffle,
  Star,
  BookOpen,
  Layers,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Keyboard,
  ListChecks,
  ArrowLeftRight
} from 'lucide-react';
import { DictionaryTerm, SpacedRepetitionData } from '../types/lexicon';
import { normalizeMedicalTermKey } from '../utils/termIdentity';
import { MobileSafeInput } from './MobileSafeInput';

export type MemorizationMode = 'flashcards' | 'mcq' | 'spelling';
export type MemorizationScope = 'due' | 'favorites' | 'all';
export type MemorizationDirection = 'en-ar' | 'ar-en';
export type Sm2RatingGrade = 'again' | 'hard' | 'mastered';

interface FlashcardsStudyStudioProps {
  terms: DictionaryTerm[];
  onBack: () => void;
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
  onRecordSm2Review: (
    kind: 'term' | 'sentence',
    id: string,
    updatedSrs: SpacedRepetitionData,
    knewIt: boolean
  ) => void;
  onToggleFavoriteTerm: (termId: string, e?: React.MouseEvent) => void;
  onOpenTermDetail: (termId: string) => void;
}

export function computeNextSm2Rated(
  current: SpacedRepetitionData | undefined,
  grade: Sm2RatingGrade
): SpacedRepetitionData {
  const prevInterval = Math.max(1, current?.interval ?? 1);
  const prevEase = current?.easeFactor ?? 2.5;
  const prevReps = current?.repetitions ?? 0;

  if (grade === 'again') {
    return {
      interval: 1,
      easeFactor: Math.max(1.3, Number((prevEase - 0.2).toFixed(2))),
      repetitions: 0,
      nextReviewAt: Date.now() + 10 * 60 * 1000
    };
  }

  if (grade === 'hard') {
    const nextInterval = prevReps === 0 ? 1 : Math.max(1, Math.round(prevInterval * 1.25));
    return {
      interval: nextInterval,
      easeFactor: Math.max(1.3, Number((prevEase - 0.1).toFixed(2))),
      repetitions: Math.max(1, prevReps),
      nextReviewAt: Date.now() + nextInterval * 24 * 60 * 60 * 1000
    };
  }

  // mastered
  const nextReps = prevReps + 1;
  let nextInterval = 1;
  if (nextReps === 1) nextInterval = 2;
  else if (nextReps === 2) nextInterval = 6;
  else nextInterval = Math.max(3, Math.round(prevInterval * prevEase));

  const nextEase = Math.min(2.8, Number((prevEase + 0.1).toFixed(2)));
  return {
    interval: nextInterval,
    easeFactor: nextEase,
    repetitions: nextReps,
    nextReviewAt: Date.now() + nextInterval * 24 * 60 * 60 * 1000
  };
}

function formatNextIntervalAr(srs: SpacedRepetitionData, grade: Sm2RatingGrade): string {
  if (grade === 'again') return 'خلال 10 د';
  const days = srs.interval;
  if (days <= 1) return 'غداً';
  if (days === 2) return 'بعد يومين';
  if (days <= 10) return `بعد ${days} أيام`;
  return `بعد ${days} يوماً`;
}

function shuffleCopy<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildSmartDistractors(
  target: DictionaryTerm,
  allTerms: DictionaryTerm[],
  direction: MemorizationDirection
): DictionaryTerm[] {
  const targetKey = normalizeMedicalTermKey(target.term);
  const targetTrans = (target.translation || '').trim().toLowerCase();
  const targetLen =
    direction === 'en-ar' ? target.translation.length : target.term.length;

  const candidates = allTerms.filter((t) => {
    if (t.id === target.id) return false;
    if (!t.term?.trim() || !t.translation?.trim()) return false;
    if (normalizeMedicalTermKey(t.term) === targetKey) return false;
    if (t.translation.trim().toLowerCase() === targetTrans) return false;
    return true;
  });

  // Prefer same category & comparable length for realistic medical challenge
  const sameCategory = candidates.filter((t) => t.category === target.category);
  const poolPrimary = sameCategory.length >= 6 ? sameCategory : candidates;

  const scored = poolPrimary
    .map((t) => {
      const len = direction === 'en-ar' ? t.translation.length : t.term.length;
      const lenDiff = Math.abs(len - targetLen);
      return { t, jitter: lenDiff + Math.random() * 14 };
    })
    .sort((a, b) => a.jitter - b.jitter)
    .slice(0, 12)
    .map((x) => x.t);

  const picked: DictionaryTerm[] = [];
  const usedDisplay = new Set<string>([
    direction === 'en-ar' ? targetTrans : targetKey
  ]);

  for (const cand of shuffleCopy(scored.length >= 3 ? scored : candidates)) {
    const dispKey =
      direction === 'en-ar'
        ? cand.translation.trim().toLowerCase()
        : normalizeMedicalTermKey(cand.term);
    if (usedDisplay.has(dispKey)) continue;
    usedDisplay.add(dispKey);
    picked.push(cand);
    if (picked.length === 3) break;
  }

  return shuffleCopy([target, ...picked]);
}

function buildSpellingHint(term: string, level: number): string {
  const clean = term.trim();
  if (!clean) return '';
  if (level <= 0) return '';
  const words = clean.split(/\s+/);
  if (level === 1) {
    return words
      .map((w) => {
        if (w.length <= 2) return `${w[0]}_`;
        return `${w[0]}${'_'.repeat(Math.min(10, w.length - 1))} (${w.length})`;
      })
      .join('  ');
  }
  return words
    .map((w) => {
      if (w.length <= 3) return w;
      const prefix = w.slice(0, Math.ceil(w.length * 0.45));
      const suffix = w.slice(-1);
      const mid = '_'.repeat(Math.max(1, w.length - prefix.length - 1));
      return `${prefix}${mid}${suffix}`;
    })
    .join('  ');
}

export const FlashcardsStudyStudio: React.FC<FlashcardsStudyStudioProps> = ({
  terms,
  onBack,
  onTriggerTTS,
  onRecordSm2Review,
  onToggleFavoriteTerm,
  onOpenTermDetail
}) => {
  const [studyMode, setStudyMode] = useState<MemorizationMode>('flashcards');
  const [studyScope, setStudyScope] = useState<MemorizationScope>('due');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');
  const [sessionSize, setSessionSize] = useState<15 | 35 | 50>(15);
  const [direction, setDirection] = useState<MemorizationDirection>('en-ar');

  // Active session queue (IDs) so "again" cards can be requeued inside the same session
  const [sessionQueueIds, setSessionQueueIds] = useState<string[]>([]);
  const [queueCursor, setQueueCursor] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);

  // MCQ state
  const [selectedMcqId, setSelectedMcqId] = useState<string | null>(null);

  // Spelling state
  const [spellingInput, setSpellingInput] = useState<string>('');
  const [spellingResult, setSpellingResult] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [hintLevel, setHintLevel] = useState<number>(0);
  const spellingInputRef = useRef<HTMLInputElement | null>(null);

  // Session progress stats
  const [sessionStats, setSessionStats] = useState<{
    mastered: number;
    hard: number;
    again: number;
    mistakeIds: string[];
  }>({
    mastered: 0,
    hard: 0,
    again: 0,
    mistakeIds: []
  });

  const termById = useMemo(() => {
    const map = new Map<string, DictionaryTerm>();
    for (const t of terms) map.set(t.id, t);
    return map;
  }, [terms]);

  const validStudyTerms = useMemo(
    () => terms.filter((t) => Boolean(t.term?.trim() && t.translation?.trim())),
    [terms]
  );

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    for (const t of validStudyTerms) {
      if (t.category?.trim()) set.add(t.category.trim());
    }
    return ['الكل', ...Array.from(set).sort()];
  }, [validStudyTerms]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    return validStudyTerms.filter(
      (t) => t.srsData && (t.srsData.nextReviewAt ?? 0) <= now
    ).length;
  }, [validStudyTerms]);

  const favCount = useMemo(
    () => validStudyTerms.filter((t) => t.favorite).length,
    [validStudyTerms]
  );

  const buildFreshQueue = (
    scopeOverride?: MemorizationScope,
    catOverride?: string,
    sizeOverride?: 15 | 35 | 50,
    explicitIds?: string[]
  ) => {
    if (explicitIds && explicitIds.length > 0) {
      setSessionQueueIds(Array.from(new Set(explicitIds)));
      setQueueCursor(0);
      setIsFlipped(false);
      setSelectedMcqId(null);
      setSpellingInput('');
      setSpellingResult('idle');
      setHintLevel(0);
      setSessionStats({ mastered: 0, hard: 0, again: 0, mistakeIds: [] });
      return;
    }

    const activeScope = scopeOverride ?? studyScope;
    const activeCat = catOverride ?? selectedCategory;
    const activeSize = sizeOverride ?? sessionSize;
    const now = Date.now();

    let pool = validStudyTerms;
    if (activeCat !== 'الكل') {
      pool = pool.filter((t) => t.category === activeCat);
    }

    if (activeScope === 'favorites') {
      pool = pool.filter((t) => t.favorite);
    } else if (activeScope === 'due') {
      // Priority: due SM-2 cards first, then unstudied favorites, then unstudied terms
      const due = pool.filter((t) => t.srsData && (t.srsData.nextReviewAt ?? 0) <= now);
      const rest = pool.filter((t) => !t.srsData || (t.srsData.nextReviewAt ?? 0) > now);
      due.sort((a, b) => (a.srsData?.nextReviewAt ?? 0) - (b.srsData?.nextReviewAt ?? 0));
      const favRest = rest.filter((t) => t.favorite);
      const otherRest = shuffleCopy(rest.filter((t) => !t.favorite));
      pool = [...due, ...favRest, ...otherRest];
    } else {
      pool = shuffleCopy(pool);
    }

    const ids = pool.slice(0, activeSize).map((t) => t.id);
    setSessionQueueIds(ids);
    setQueueCursor(0);
    setIsFlipped(false);
    setSelectedMcqId(null);
    setSpellingInput('');
    setSpellingResult('idle');
    setHintLevel(0);
    setSessionStats({ mastered: 0, hard: 0, again: 0, mistakeIds: [] });
  };

  // Initialize queue when filter settings change or on first load
  useEffect(() => {
    buildFreshQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyScope, selectedCategory, sessionSize]);

  // Reset card-local interaction states when switching mode or advancing
  useEffect(() => {
    setIsFlipped(false);
    setSelectedMcqId(null);
    setSpellingInput('');
    setSpellingResult('idle');
    setHintLevel(0);
  }, [queueCursor, studyMode, direction]);

  const isSessionComplete =
    sessionQueueIds.length > 0 && queueCursor >= sessionQueueIds.length;

  const currentCard: DictionaryTerm | null = useMemo(() => {
    if (isSessionComplete || sessionQueueIds.length === 0) return null;
    const id = sessionQueueIds[queueCursor];
    return termById.get(id) || null;
  }, [isSessionComplete, sessionQueueIds, queueCursor, termById]);

  const mcqOptions = useMemo(() => {
    if (studyMode !== 'mcq' || !currentCard) return [];
    return buildSmartDistractors(currentCard, validStudyTerms, direction);
    // Re-roll only when card or direction changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyMode, currentCard?.id, queueCursor, direction]);

  const ratingPreviews = useMemo(() => {
    if (!currentCard) return null;
    return {
      again: formatNextIntervalAr(computeNextSm2Rated(currentCard.srsData, 'again'), 'again'),
      hard: formatNextIntervalAr(computeNextSm2Rated(currentCard.srsData, 'hard'), 'hard'),
      mastered: formatNextIntervalAr(
        computeNextSm2Rated(currentCard.srsData, 'mastered'),
        'mastered'
      )
    };
  }, [currentCard]);

  const advanceWithGrade = (grade: Sm2RatingGrade) => {
    if (!currentCard) return;
    const nextSrs = computeNextSm2Rated(currentCard.srsData, grade);
    onRecordSm2Review('term', currentCard.id, nextSrs, grade !== 'again');

    setSessionStats((prev) => ({
      mastered: grade === 'mastered' ? prev.mastered + 1 : prev.mastered,
      hard: grade === 'hard' ? prev.hard + 1 : prev.hard,
      again: grade === 'again' ? prev.again + 1 : prev.again,
      mistakeIds:
        grade === 'again' && !prev.mistakeIds.includes(currentCard.id)
          ? [...prev.mistakeIds, currentCard.id]
          : prev.mistakeIds
    }));

    // Requeue 'again' card later in the same session (max 1 extra pass per card to avoid infinite loop)
    if (grade === 'again') {
      const appearancesSoFar = sessionQueueIds.filter((id) => id === currentCard.id).length;
      if (appearancesSoFar < 2) {
        setSessionQueueIds((prev) => [...prev, currentCard.id]);
      }
    }

    setQueueCursor((prev) => prev + 1);
  };

  const handleSelectMcqOption = (chosen: DictionaryTerm) => {
    if (!currentCard || selectedMcqId !== null) return;
    setSelectedMcqId(chosen.id);
    const isCorrect = chosen.id === currentCard.id;
    const grade: Sm2RatingGrade = isCorrect ? 'mastered' : 'again';
    const nextSrs = computeNextSm2Rated(currentCard.srsData, grade);
    onRecordSm2Review('term', currentCard.id, nextSrs, isCorrect);

    setSessionStats((prev) => ({
      mastered: isCorrect ? prev.mastered + 1 : prev.mastered,
      hard: prev.hard,
      again: !isCorrect ? prev.again + 1 : prev.again,
      mistakeIds:
        !isCorrect && !prev.mistakeIds.includes(currentCard.id)
          ? [...prev.mistakeIds, currentCard.id]
          : prev.mistakeIds
    }));

    if (!isCorrect) {
      const appearancesSoFar = sessionQueueIds.filter((id) => id === currentCard.id).length;
      if (appearancesSoFar < 2) {
        setSessionQueueIds((prev) => [...prev, currentCard.id]);
      }
    }
  };

  const handleCheckSpelling = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentCard || spellingResult !== 'idle') return;
    const rawUser = (spellingInputRef.current?.value ?? spellingInput).trim();
    if (!rawUser) return;

    const normalizedUser = normalizeMedicalTermKey(rawUser);
    const normalizedExpected = normalizeMedicalTermKey(currentCard.term);
    const isCorrect =
      Boolean(normalizedExpected) && normalizedUser === normalizedExpected;

    setSpellingResult(isCorrect ? 'correct' : 'wrong');

    const grade: Sm2RatingGrade = isCorrect
      ? hintLevel > 0
        ? 'hard'
        : 'mastered'
      : 'again';
    const nextSrs = computeNextSm2Rated(currentCard.srsData, grade);
    onRecordSm2Review('term', currentCard.id, nextSrs, isCorrect);

    setSessionStats((prev) => ({
      mastered: grade === 'mastered' ? prev.mastered + 1 : prev.mastered,
      hard: grade === 'hard' ? prev.hard + 1 : prev.hard,
      again: grade === 'again' ? prev.again + 1 : prev.again,
      mistakeIds:
        !isCorrect && !prev.mistakeIds.includes(currentCard.id)
          ? [...prev.mistakeIds, currentCard.id]
          : prev.mistakeIds
    }));

    if (!isCorrect) {
      const appearancesSoFar = sessionQueueIds.filter((id) => id === currentCard.id).length;
      if (appearancesSoFar < 2) {
        setSessionQueueIds((prev) => [...prev, currentCard.id]);
      }
    }
  };

  const totalAnswered =
    sessionStats.mastered + sessionStats.hard + sessionStats.again;
  const accuracyPercent =
    totalAnswered > 0
      ? Math.round(((sessionStats.mastered + sessionStats.hard) / totalAnswered) * 100)
      : 0;
  const progressPercent =
    sessionQueueIds.length > 0
      ? Math.min(100, Math.round((queueCursor / sessionQueueIds.length) * 100))
      : 0;

  return (
    <div className="space-y-3.5 max-w-2xl mx-auto">
      {/* Compact Top Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-3.5 sm:p-4 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
              <span>رجوع</span>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                المراجعة واختبار الحفظ
              </h2>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums flex items-center gap-1.5">
                <span>
                  {sessionQueueIds.length > 0
                    ? `${Math.min(queueCursor + 1, sessionQueueIds.length)} / ${sessionQueueIds.length}`
                    : '0 / 0'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-sans">
                  {validStudyTerms.length.toLocaleString()} مصطلح
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {studyMode !== 'spelling' && (
              <button
                type="button"
                onClick={() =>
                  setDirection((prev) => (prev === 'en-ar' ? 'ar-en' : 'en-ar'))
                }
                title="تبديل اتجاه الاختبار"
                className="min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-extrabold text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{direction === 'en-ar' ? 'EN ← AR' : 'AR ← EN'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => buildFreshQueue()}
              title="خلط وبدء جلسة جديدة"
              aria-label="بدء جلسة جديدة"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <Shuffle className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Mode Segmented Control */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/90">
          <button
            type="button"
            onClick={() => setStudyMode('flashcards')}
            className={`min-h-[40px] px-2 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              studyMode === 'flashcards'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span>بطاقات SM-2</span>
          </button>
          <button
            type="button"
            onClick={() => setStudyMode('mcq')}
            className={`min-h-[40px] px-2 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              studyMode === 'mcq'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ListChecks className="w-3.5 h-3.5 shrink-0" />
            <span>اختيار متعدد</span>
          </button>
          <button
            type="button"
            onClick={() => setStudyMode('spelling')}
            className={`min-h-[40px] px-2 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors ${
              studyMode === 'spelling'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5 shrink-0" />
            <span>تحدي الكتابة</span>
          </button>
        </div>

        {/* Compact Scope, Category & Size Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1 flex-wrap">
            {(
              [
                { key: 'due', label: dueCount > 0 ? `المستحقة (${dueCount})` : 'ذكي (SM-2)' },
                { key: 'favorites', label: `المفضلة (${favCount})` },
                { key: 'all', label: 'الكل' }
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setStudyScope(item.key)}
                className={`min-h-[34px] px-2.5 py-1 rounded-xl text-[11px] font-bold transition-colors whitespace-nowrap ${
                  studyScope === item.key
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {availableCategories.length > 2 && (
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="تصفية التصنيف"
                className="min-h-[34px] px-2 py-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            )}
            <select
              value={sessionSize}
              onChange={(e) => setSessionSize(Number(e.target.value) as 15 | 35 | 50)}
              aria-label="عدد بطاقات الجلسة"
              className="min-h-[34px] px-2 py-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-bold font-mono text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
            >
              <option value={15}>15 بطاقة</option>
              <option value={35}>35 بطاقة</option>
              <option value={50}>50 بطاقة</option>
            </select>
          </div>
        </div>

        {/* Hairline Session Progress Bar */}
        {sessionQueueIds.length > 0 && (
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* ====================================================================
          SESSION COMPLETE SUMMARY
         ==================================================================== */}
      {isSessionComplete ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/90 dark:border-slate-800 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
              أحسنت! اكتملت جلسة المراجعة
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تم تحديث جدول التكرار المتباعد (SM-2) لجميع المصطلحات تلقائياً.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 max-w-md mx-auto pt-1">
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xl font-extrabold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {accuracyPercent}%
              </div>
              <div className="text-[11px] font-bold text-slate-500 mt-0.5">دقة الإجابات</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                {sessionStats.mastered + sessionStats.hard}
              </div>
              <div className="text-[11px] font-bold text-slate-500 mt-0.5">تم إتقانها</div>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xl font-extrabold font-mono tabular-nums text-rose-600 dark:text-rose-400">
                {sessionStats.mistakeIds.length}
              </div>
              <div className="text-[11px] font-bold text-slate-500 mt-0.5">تحتاج تثبيت</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            {sessionStats.mistakeIds.length > 0 && (
              <button
                type="button"
                onClick={() => buildFreshQueue(undefined, undefined, undefined, sessionStats.mistakeIds)}
                className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>مراجعة الأخطاء فقط ({sessionStats.mistakeIds.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => buildFreshQueue()}
              className="min-h-[46px] px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-colors"
            >
              <Shuffle className="w-4 h-4" />
              <span>بدء جلسة جديدة</span>
            </button>
          </div>
        </div>
      ) : !currentCard ? (
        /* ====================================================================
           EMPTY SCOPE STATE
           ==================================================================== */
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200/80 dark:border-slate-800 text-center space-y-3">
          <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
            {studyScope === 'favorites'
              ? 'لا توجد مصطلحات في المفضلة حالياً.'
              : 'لا توجد مصطلحات مطابقة لهذا التصنيف.'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            يمكنك تبديل النطاق إلى «الكل» أو «ذكي (SM-2)» للبدء فوراً.
          </p>
          <button
            type="button"
            onClick={() => {
              setStudyScope('all');
              setSelectedCategory('الكل');
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold transition-colors"
          >
            التدريب على جميع المصطلحات
          </button>
        </div>
      ) : studyMode === 'flashcards' ? (
        /* ====================================================================
           MODE 1: SMART SM-2 FLASHCARDS (3-LEVEL RATING)
           ==================================================================== */
        <div className="space-y-3">
          <div
            onClick={() => setIsFlipped((prev) => !prev)}
            className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-9 border border-slate-200/90 dark:border-slate-800 shadow-sm min-h-[280px] flex flex-col items-center justify-center text-center cursor-pointer select-none transition-colors hover:border-emerald-500/40 relative"
          >
            {/* Quiet Unboxed Top Metadata */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="font-mono">{currentCard.category}</span>
                <span aria-hidden="true">·</span>
                <span>{isFlipped ? 'الإجابة' : 'السؤال'}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavoriteTerm(currentCard.id, e);
                  }}
                  aria-label="إضافة للمفضلة"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-500 transition-colors"
                >
                  <Star
                    className={`w-4 h-4 ${
                      currentCard.favorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTermDetail(currentCard.id);
                  }}
                  title="عرض التفاصيل الكاملة"
                  aria-label="عرض تفاصيل المصطلح"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-emerald-600 transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              </div>
            </div>

            {!isFlipped ? (
              <div className="space-y-3 my-8 max-w-md">
                {direction === 'en-ar' ? (
                  <>
                    <h3
                      dir="ltr"
                      className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 dark:text-white tracking-tight break-words"
                    >
                      {currentCard.term}
                    </h3>
                    {currentCard.phonetic && (
                      <p dir="ltr" className="text-sm font-mono text-slate-400">
                        {currentCard.phonetic}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerTTS(currentCard.term, `fc-tts-${currentCard.id}`, 'en-US');
                      }}
                      className="mt-1 inline-flex items-center gap-1.5 min-h-[40px] px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>نطق المصطلح</span>
                    </button>
                  </>
                ) : (
                  <>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 break-words">
                      {currentCard.translation}
                    </h3>
                    {currentCard.definitionAr && (
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {currentCard.definitionAr}
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3 my-8 max-w-md w-full">
                {direction === 'en-ar' ? (
                  <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 break-words">
                    {currentCard.translation}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div
                      dir="ltr"
                      className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 dark:text-white break-words"
                    >
                      {currentCard.term}
                    </div>
                    {currentCard.phonetic && (
                      <p dir="ltr" className="text-xs font-mono text-slate-400">
                        {currentCard.phonetic}
                      </p>
                    )}
                  </div>
                )}

                {currentCard.definitionAr && (
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {currentCard.definitionAr}
                  </p>
                )}

                {Array.isArray(currentCard.examples) && currentCard.examples[0]?.en && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="pt-2.5 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-right"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        dir="ltr"
                        className="text-xs text-slate-600 dark:text-slate-300 text-left flex-1 leading-relaxed"
                      >
                        {currentCard.examples[0].en}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          onTriggerTTS(
                            currentCard.examples[0].en,
                            `fc-ex-${currentCard.id}`,
                            'en-US'
                          )
                        }
                        aria-label="نطق المثال"
                        className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shrink-0"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {currentCard.examples[0].ar && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {currentCard.examples[0].ar}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="absolute bottom-3.5 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isFlipped ? 'العودة للسؤال' : 'قلب البطاقة'}</span>
            </div>
          </div>

          {/* 3-Level Smart SM-2 Rating Controls (Thumb Zone) */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => advanceWithGrade('again')}
              className="min-h-[54px] py-2 px-2 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 flex flex-col items-center justify-center gap-0.5 hover:bg-rose-100 dark:hover:bg-rose-950/70 transition-colors"
            >
              <span className="text-xs sm:text-sm font-extrabold flex items-center gap-1">
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>أعدها قريباً</span>
              </span>
              <span className="text-[10px] opacity-80 font-mono tabular-nums">
                {ratingPreviews?.again}
              </span>
            </button>

            <button
              type="button"
              onClick={() => advanceWithGrade('hard')}
              className="min-h-[54px] py-2 px-2 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 flex flex-col items-center justify-center gap-0.5 hover:bg-amber-100 dark:hover:bg-amber-950/70 transition-colors"
            >
              <span className="text-xs sm:text-sm font-extrabold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>صعبة</span>
              </span>
              <span className="text-[10px] opacity-80 font-mono tabular-nums">
                {ratingPreviews?.hard}
              </span>
            </button>

            <button
              type="button"
              onClick={() => advanceWithGrade('mastered')}
              className="min-h-[54px] py-2 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white flex flex-col items-center justify-center gap-0.5 shadow-xs transition-colors"
            >
              <span className="text-xs sm:text-sm font-extrabold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>أتقنتها</span>
              </span>
              <span className="text-[10px] opacity-90 font-mono tabular-nums">
                {ratingPreviews?.mastered}
              </span>
            </button>
          </div>
        </div>
      ) : studyMode === 'mcq' ? (
        /* ====================================================================
           MODE 2: SMART 4-CHOICE MULTIPLE-CHOICE QUIZ
           ==================================================================== */
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/90 dark:border-slate-800 text-center space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">{currentCard.category}</span>
              <span>اختر الإجابة الصحيحة</span>
            </div>

            {direction === 'en-ar' ? (
              <div className="space-y-2 py-2">
                <h3
                  dir="ltr"
                  className="text-2xl sm:text-3xl font-mono font-extrabold text-slate-900 dark:text-white break-words"
                >
                  {currentCard.term}
                </h3>
                {currentCard.phonetic && (
                  <p dir="ltr" className="text-xs font-mono text-slate-400">
                    {currentCard.phonetic}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onTriggerTTS(currentCard.term, `mcq-tts-${currentCard.id}`, 'en-US')
                  }
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:text-emerald-600 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>نطق</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                <h3 className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-400 break-words">
                  {currentCard.translation}
                </h3>
                {currentCard.definitionAr && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto line-clamp-2">
                    {currentCard.definitionAr}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-right">
              {mcqOptions.map((opt) => {
                const isSelected = selectedMcqId === opt.id;
                const isAnswer = opt.id === currentCard.id;
                const answered = selectedMcqId !== null;

                let stateClasses =
                  'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 hover:border-emerald-500/60';
                if (answered && isAnswer) {
                  stateClasses =
                    'bg-emerald-500/15 border-emerald-500 text-emerald-800 dark:text-emerald-200';
                } else if (answered && isSelected && !isAnswer) {
                  stateClasses =
                    'bg-rose-500/15 border-rose-500 text-rose-800 dark:text-rose-200';
                } else if (answered) {
                  stateClasses =
                    'bg-slate-50/50 dark:bg-slate-950/40 border-slate-200/60 dark:border-slate-800/60 text-slate-400';
                }

                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={answered}
                    onClick={() => handleSelectMcqOption(opt)}
                    dir={direction === 'en-ar' ? 'rtl' : 'ltr'}
                    className={`min-h-[54px] px-4 py-3 rounded-2xl border text-xs sm:text-sm font-extrabold flex items-center justify-between gap-2 transition-colors ${stateClasses}`}
                  >
                    <span className="break-words text-start flex-1">
                      {direction === 'en-ar' ? opt.translation : opt.term}
                    </span>
                    {answered && isAnswer && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    {answered && isSelected && !isAnswer && (
                      <X className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedMcqId !== null && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-extrabold flex items-center gap-1.5 ${
                      selectedMcqId === currentCard.id
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {selectedMcqId === currentCard.id ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>إجابة صحيحة — تم تعزيز الحفظ</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        <span>
                          الإجابة الصحيحة:{' '}
                          {direction === 'en-ar' ? currentCard.translation : currentCard.term}
                        </span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenTermDetail(currentCard.id)}
                    className="text-[11px] font-bold text-slate-500 hover:text-emerald-600 whitespace-nowrap"
                  >
                    التفاصيل
                  </button>
                </div>

                {currentCard.definitionAr && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 text-right leading-relaxed">
                    {currentCard.definitionAr}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => setQueueCursor((prev) => prev + 1)}
                  className="w-full min-h-[48px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold transition-colors"
                >
                  السؤال التالي
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ====================================================================
           MODE 3: TERM SPELLING & ACTIVE RECALL CHALLENGE
           ==================================================================== */
        <div className="space-y-3">
          <form
            onSubmit={handleCheckSpelling}
            className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-7 border border-slate-200/90 dark:border-slate-800 space-y-4"
          >
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-mono">{currentCard.category}</span>
              <span>اكتب المصطلح الطبي بالإنجليزية</span>
            </div>

            <div className="text-center space-y-2 py-1">
              <h3 className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 break-words">
                {currentCard.translation}
              </h3>
              {currentCard.definitionAr && (
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
                  {currentCard.definitionAr}
                </p>
              )}

              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() =>
                    onTriggerTTS(currentCard.term, `spell-tts-${currentCard.id}`, 'en-US')
                  }
                  className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:text-emerald-600 transition-colors"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>استماع للنطق</span>
                </button>
                {spellingResult === 'idle' && hintLevel < 2 && (
                  <button
                    type="button"
                    onClick={() => setHintLevel((prev) => Math.min(2, prev + 1))}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>{hintLevel === 0 ? 'تلميح' : 'تلميح إضافي'}</span>
                  </button>
                )}
              </div>

              {hintLevel > 0 && spellingResult === 'idle' && (
                <div
                  dir="ltr"
                  className="font-mono text-sm font-bold tracking-widest text-amber-700 dark:text-amber-300 pt-1"
                >
                  {buildSpellingHint(currentCard.term, hintLevel)}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <MobileSafeInput
                ref={spellingInputRef}
                type="text"
                dir="ltr"
                value={spellingInput}
                disabled={spellingResult !== 'idle'}
                onValueChange={setSpellingInput}
                placeholder="Type medical term in English..."
                className="w-full min-h-[50px] px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 text-base font-mono font-bold text-slate-900 dark:text-white outline-none text-left [user-select:text]"
              />

              {spellingResult === 'idle' ? (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSpellingResult('wrong');
                      const nextSrs = computeNextSm2Rated(currentCard.srsData, 'again');
                      onRecordSm2Review('term', currentCard.id, nextSrs, false);
                      setSessionStats((prev) => ({
                        ...prev,
                        again: prev.again + 1,
                        mistakeIds: prev.mistakeIds.includes(currentCard.id)
                          ? prev.mistakeIds
                          : [...prev.mistakeIds, currentCard.id]
                      }));
                    }}
                    className="min-h-[48px] px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-extrabold text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    كشف الإجابة
                  </button>
                  <button
                    type="submit"
                    disabled={!spellingInput.trim()}
                    className="col-span-2 min-h-[48px] px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white text-sm font-extrabold transition-colors"
                  >
                    تحقق من الإجابة
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div
                    className={`p-3.5 rounded-2xl border text-xs sm:text-sm space-y-1 ${
                      spellingResult === 'correct'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    <div className="font-extrabold flex items-center gap-1.5">
                      {spellingResult === 'correct' ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>
                            إجابة صحيحة! {hintLevel > 0 ? '(باستخدام تلميح)' : ''}
                          </span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>المصطلح الصحيح هو:</span>
                        </>
                      )}
                    </div>
                    <div
                      dir="ltr"
                      className="text-lg font-mono font-extrabold text-slate-900 dark:text-white text-left"
                    >
                      {currentCard.term}
                      {currentCard.phonetic ? (
                        <span className="text-xs font-normal text-slate-500 ml-2">
                          {currentCard.phonetic}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setQueueCursor((prev) => prev + 1)}
                    className="w-full min-h-[48px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold transition-colors"
                  >
                    المصطلح التالي
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
