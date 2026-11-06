import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Play,
  Plus,
  Upload,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Clock,
  Shuffle,
  FileText,
  Trash2,
  Eye,
  BookOpen,
  Award,
  Check
} from 'lucide-react';
import {
  DictionaryTerm,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  UnifiedQuestionType,
  UnifiedQuizOption,
  UnifiedMatchingPair,
  QuizValidationReport,
  QuizAttemptRecord,
  QuizAttemptAnswer
} from '../types/lexicon';
import {
  BULK_QUIZ_TEXT_TEMPLATE,
  validateSingleQuizQuestion,
  parseAndValidateBulkQuestionsText,
  parseAndValidateQuestionsJsonOrCsv,
  evaluateQuizQuestionAnswer,
  buildQuizAttemptRecord
} from '../services/quizEngineService';
import { extractLinkedTermsFromText } from '../engine/knowledgeLinker';

interface QuizCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  questions: UnifiedQuizQuestion[];
  attempts: QuizAttemptRecord[];
  initialScopeType?: 'topic' | 'subject' | 'block' | 'multi-topic';
  initialBlockId?: string | null;
  initialSubjectId?: string | null;
  initialTopicId?: string | null;
  initialTab?: 'runner' | 'builder' | 'history';
  onSaveQuestions: (newQuestions: UnifiedQuizQuestion[]) => void;
  onDeleteQuestion: (questionId: string) => void;
  onSaveAttempt: (attempt: QuizAttemptRecord) => void;
  onOpenTermDetail: (termId: string) => void;
  showToast: (msg: string, type?: string) => void;
}

const QUESTION_TYPE_LABELS: Record<UnifiedQuestionType, string> = {
  single_choice: 'Single Best Answer (MCQ)',
  multiple_select: 'Multiple Select (اختيار متعدد)',
  true_false: 'True / False (صح أو خطأ)',
  matching: 'Matching (مطابقة الأزواج)',
  fill_blank: 'Fill in the Blank (أكمل الفراغ)',
  short_answer: 'Short Answer (إجابة قصيرة)',
  image_based: 'Image-Based Question (سؤال مصوّر)'
};

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const QuizCenterModal: React.FC<QuizCenterModalProps> = ({
  isOpen,
  onClose,
  blocks,
  subjects,
  topics,
  terms,
  questions,
  attempts,
  initialScopeType = 'topic',
  initialBlockId,
  initialSubjectId,
  initialTopicId,
  initialTab = 'runner',
  onSaveQuestions,
  onDeleteQuestion,
  onSaveAttempt,
  onOpenTermDetail,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'runner' | 'builder' | 'history'>(
    initialTab
  );

  // ============================================================================
  // 1. QUIZ CONFIGURATION & RUNNER STATE
  // ============================================================================
  const [scopeType, setScopeType] = useState<
    'topic' | 'subject' | 'block' | 'multi-topic' | 'mistakes-retry'
  >(initialScopeType);
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    initialBlockId || blocks[0]?.id || ''
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    initialSubjectId || subjects[0]?.id || ''
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    initialTopicId || topics[0]?.id || ''
  );
  const [multiSelectedTopicIds, setMultiSelectedTopicIds] = useState<string[]>(
    initialTopicId ? [initialTopicId] : topics.slice(0, 2).map((t) => t.id)
  );

  const [desiredCount, setDesiredCount] = useState<number>(10);
  const [randomizeQuestions, setRandomizeQuestions] = useState<boolean>(true);
  const [randomizeOptions, setRandomizeOptions] = useState<boolean>(false);
  const [gradingMode, setGradingMode] = useState<'instant' | 'exam'>('instant');
  const [timerMinutes, setTimerMinutes] = useState<number>(0); // 0 = untimed

  const [sessionState, setSessionState] = useState<'setup' | 'active' | 'finished'>(
    'setup'
  );
  const [sessionQuestions, setSessionQuestions] = useState<UnifiedQuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [userResponses, setUserResponses] = useState<
    Record<
      string,
      {
        selectedKeys: string[];
        textAnswer: string;
        matchingMap: Record<string, string>;
        revealedInstant: boolean;
      }
    >
  >({});
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [completedAttempt, setCompletedAttempt] = useState<QuizAttemptRecord | null>(
    null
  );

  const timerIntervalRef = useRef<number | null>(null);
  const fileImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialTopicId) setSelectedTopicId(initialTopicId);
    if (initialSubjectId) setSelectedSubjectId(initialSubjectId);
    if (initialBlockId) setSelectedBlockId(initialBlockId);
    if (initialScopeType) setScopeType(initialScopeType);
    if (initialTab) setActiveTab(initialTab);
  }, [initialTopicId, initialSubjectId, initialBlockId, initialScopeType, initialTab]);

  // Pool of available questions for the chosen scope
  const availableScopeQuestions = useMemo(() => {
    if (scopeType === 'topic') {
      return questions.filter((q) => q.topicId === selectedTopicId);
    }
    if (scopeType === 'subject') {
      const subjTopicIds = new Set(
        topics.filter((t) => t.subjectId === selectedSubjectId).map((t) => t.id)
      );
      return questions.filter(
        (q) => q.subjectId === selectedSubjectId || (q.topicId && subjTopicIds.has(q.topicId))
      );
    }
    if (scopeType === 'block') {
      const blkTopicIds = new Set(
        topics.filter((t) => t.blockId === selectedBlockId).map((t) => t.id)
      );
      return questions.filter(
        (q) => q.blockId === selectedBlockId || (q.topicId && blkTopicIds.has(q.topicId))
      );
    }
    if (scopeType === 'multi-topic') {
      const setIds = new Set(multiSelectedTopicIds);
      return questions.filter((q) => q.topicId && setIds.has(q.topicId));
    }
    if (scopeType === 'mistakes-retry') {
      const wrongQIds = new Set<string>();
      for (const att of attempts) {
        for (const ans of att.answers) {
          if (!ans.isCorrect) wrongQIds.add(ans.questionId);
        }
      }
      return questions.filter((q) => wrongQIds.has(q.id));
    }
    return questions;
  }, [
    questions,
    topics,
    attempts,
    scopeType,
    selectedTopicId,
    selectedSubjectId,
    selectedBlockId,
    multiSelectedTopicIds
  ]);

  // Timer effect during active session
  useEffect(() => {
    if (sessionState !== 'active') {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    timerIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        window.clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [sessionState]);

  const startQuizSession = (customQuestionList?: UnifiedQuizQuestion[]) => {
    const sourcePool = customQuestionList || availableScopeQuestions;
    if (sourcePool.length === 0) {
      showToast('لا توجد أسئلة مضافة في هذا النطاق بعد. يمكنك إضافة أو استيراد أسئلة من التبويب الثاني.', 'info');
      return;
    }

    let prepared = randomizeQuestions ? shuffleArray(sourcePool) : [...sourcePool];
    if (!customQuestionList && desiredCount > 0 && desiredCount < prepared.length) {
      prepared = prepared.slice(0, desiredCount);
    }

    if (randomizeOptions) {
      prepared = prepared.map((q) => {
        if (q.type === 'single_choice' || q.type === 'multiple_select' || q.type === 'image_based') {
          return {
            ...q,
            options: shuffleArray(q.options)
          };
        }
        return q;
      });
    }

    setSessionQuestions(prepared);
    setCurrentIdx(0);
    setUserResponses({});
    setElapsedSeconds(0);
    setRemainingSeconds(timerMinutes > 0 ? timerMinutes * 60 : null);
    setCompletedAttempt(null);
    setSessionState('active');
  };

  const finishAndGradeQuizSession = () => {
    if (sessionQuestions.length === 0) return;

    const evaluatedAnswers: QuizAttemptAnswer[] = sessionQuestions.map((q) => {
      const resp = userResponses[q.id] || {
        selectedKeys: [],
        textAnswer: '',
        matchingMap: {},
        revealedInstant: false
      };
      const isCorrect = evaluateQuizQuestionAnswer(q, resp);
      return {
        questionId: q.id,
        selectedKeys: resp.selectedKeys,
        textAnswer: resp.textAnswer,
        matchingMap: resp.matchingMap,
        isCorrect
      };
    });

    const titleLabel =
      scopeType === 'topic'
        ? topics.find((t) => t.id === selectedTopicId)?.titleEn || 'Topic Quiz'
        : scopeType === 'subject'
          ? subjects.find((s) => s.id === selectedSubjectId)?.titleEn || 'Subject Quiz'
          : scopeType === 'block'
            ? blocks.find((b) => b.id === selectedBlockId)?.titleEn || 'Block Quiz'
            : scopeType === 'mistakes-retry'
              ? 'Mistakes Retry Session'
              : `Multi-Topic Quiz (${multiSelectedTopicIds.length} Topics)`;

    const record = buildQuizAttemptRecord({
      title: titleLabel,
      scopeType,
      blockId: selectedBlockId,
      subjectId: selectedSubjectId,
      topicIds:
        scopeType === 'multi-topic'
          ? multiSelectedTopicIds
          : selectedTopicId
            ? [selectedTopicId]
            : [],
      mode: gradingMode,
      questions: sessionQuestions,
      answers: evaluatedAnswers,
      durationSeconds: elapsedSeconds
    });

    onSaveAttempt(record);
    setCompletedAttempt(record);
    setSessionState('finished');
    showToast(`اكتمل الاختبار! النتيجة: ${record.scorePercent}% (${record.correctCount}/${record.totalQuestions})`);
  };

  useEffect(() => {
    if (sessionState === 'active' && remainingSeconds === 0) {
      finishAndGradeQuizSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSeconds, sessionState]);

  // ============================================================================
  // 2. QUESTION BUILDER & IMPORTER STATE (Manual / Bulk Text / JSON File)
  // ============================================================================
  const [inputMode, setInputMode] = useState<'manual' | 'paste_text' | 'file_import'>(
    'manual'
  );
  const [targetBlockId, setTargetBlockId] = useState<string>(
    initialBlockId || blocks[0]?.id || ''
  );
  const [targetSubjectId, setTargetSubjectId] = useState<string>(
    initialSubjectId || subjects[0]?.id || ''
  );
  const [targetTopicId, setTargetTopicId] = useState<string>(
    initialTopicId || topics[0]?.id || ''
  );

  // Manual Question Draft
  const [manualType, setManualType] = useState<UnifiedQuestionType>('single_choice');
  const [manualQuestionEn, setManualQuestionEn] = useState<string>('');
  const [manualQuestionAr, setManualQuestionAr] = useState<string>('');
  const [manualImageUrl, setManualImageUrl] = useState<string>('');
  const [manualOptions, setManualOptions] = useState<UnifiedQuizOption[]>([
    { key: 'A', textEn: '' },
    { key: 'B', textEn: '' },
    { key: 'C', textEn: '' },
    { key: 'D', textEn: '' }
  ]);
  const [manualCorrectKeys, setManualCorrectKeys] = useState<string[]>(['A']);
  const [manualAcceptableText, setManualAcceptableText] = useState<string>('');
  const [manualMatchingPairs, setManualMatchingPairs] = useState<UnifiedMatchingPair[]>([
    { id: 'p-1', leftEn: '', rightEn: '' },
    { id: 'p-2', leftEn: '', rightEn: '' }
  ]);
  const [manualExplanationEn, setManualExplanationEn] = useState<string>('');
  const [manualExplanationAr, setManualExplanationAr] = useState<string>('');

  // Bulk Paste & File Import State + Validation Preview
  const [bulkPasteText, setBulkPasteText] = useState<string>(BULK_QUIZ_TEXT_TEMPLATE);
  const [validationReport, setValidationReport] = useState<QuizValidationReport | null>(
    null
  );
  const [stagedPreviewQuestions, setStagedPreviewQuestions] = useState<
    UnifiedQuizQuestion[]
  >([]);

  const handleSaveManualQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    const linkedIds = extractLinkedTermsFromText(
      `${manualQuestionEn} ${manualOptions.map((o) => o.textEn).join(' ')} ${manualExplanationEn}`,
      terms
    );

    const check = validateSingleQuizQuestion(
      {
        type: manualType,
        questionEn: manualQuestionEn,
        questionAr: manualQuestionAr || undefined,
        imageUrl: manualImageUrl || undefined,
        options: manualOptions,
        correctOptionKeys: manualCorrectKeys,
        acceptableAnswers: manualAcceptableText
          .split(/[|,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        matchingPairs: manualMatchingPairs,
        explanationEn: manualExplanationEn,
        explanationAr: manualExplanationAr || undefined,
        blockId: targetBlockId,
        subjectId: targetSubjectId,
        topicId: targetTopicId,
        linkedTermIds: linkedIds
      },
      1
    );

    if (!check.valid || !check.normalized) {
      const firstErr = check.issues[0]?.messageAr || 'يرجى التحقق من اكتمال حقول السؤال';
      showToast(firstErr, 'info');
      setValidationReport({
        valid: false,
        questions: [],
        issues: check.issues
      });
      return;
    }

    onSaveQuestions([check.normalized]);
    setManualQuestionEn('');
    setManualQuestionAr('');
    setManualExplanationEn('');
    setManualExplanationAr('');
    setManualAcceptableText('');
    setValidationReport(null);
    showToast('تم التحقق من السؤال وحفظه في بنك الاختبارات بنجاح');
  };

  const handleValidateBulkText = () => {
    const report = parseAndValidateBulkQuestionsText(bulkPasteText, {
      blockId: targetBlockId,
      subjectId: targetSubjectId,
      topicId: targetTopicId,
      terms
    });
    setValidationReport(report);
    setStagedPreviewQuestions(report.questions);
    if (report.valid) {
      showToast(`تم فحص النص بنجاح: ${report.questions.length} سؤال جاهز للمعاينة والحفظ`);
    } else {
      showToast(
        `تم اكتشاف ${report.issues.filter((i) => i.severity === 'error').length} أخطاء تحتاج للتصحيح قبل الحفظ`,
        'info'
      );
    }
  };

  const handleImportQuestionsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      const report = parseAndValidateQuestionsJsonOrCsv(content, file.name, {
        blockId: targetBlockId,
        subjectId: targetSubjectId,
        topicId: targetTopicId,
        terms
      });
      setValidationReport(report);
      setStagedPreviewQuestions(report.questions);
      if (report.valid) {
        showToast(
          `تم تحليل الملف "${file.name}": ${report.questions.length} سؤال جاهز للمعاينة`
        );
      } else {
        showToast(`يوجد أخطاء في الملف "${file.name}"، راجع التقرير أدناه`, 'info');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCommitStagedQuestions = () => {
    if (stagedPreviewQuestions.length === 0) {
      showToast('لا توجد أسئلة صالحة للحفظ', 'info');
      return;
    }
    onSaveQuestions(stagedPreviewQuestions);
    showToast(`تم حفظ ${stagedPreviewQuestions.length} سؤال في قاعدة البيانات بنجاح`);
    setStagedPreviewQuestions([]);
    setValidationReport(null);
    setActiveTab('runner');
  };

  if (!isOpen) return null;

  const currentQuestion = sessionQuestions[currentIdx] || null;
  const currentUserResp = currentQuestion
    ? userResponses[currentQuestion.id] || {
        selectedKeys: [],
        textAnswer: '',
        matchingMap: {},
        revealedInstant: false
      }
    : null;

  const isCurrentQuestionRevealed =
    Boolean(currentQuestion && currentUserResp) &&
    (gradingMode === 'instant' && Boolean(currentUserResp?.revealedInstant));

  const isCurrentQuestionCorrect =
    currentQuestion && currentUserResp
      ? evaluateQuizQuestionAnswer(currentQuestion, currentUserResp)
      : false;

  const termByIdMap = new Map<string, DictionaryTerm>(terms.map((t) => [t.id, t]));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-4 sm:p-6 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 space-y-5 shadow-2xl"
      >
        <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              منظومة الاختبارات الطبية التفاعلية (Unified Assessment Engine)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {questions.length} سؤال تفاعلي · {attempts.length} اختبار مكتمل · يدعم 7 أنماط أسئلة مع التصحيح والتفسير الفوري
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Control Tabs */}
        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('runner')}
            className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap truncate ${
              activeTab === 'runner'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            بدء اختبار تفاعلي
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('builder')}
            className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap truncate ${
              activeTab === 'builder'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            إضافة / استيراد أسئلة
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold transition-colors whitespace-nowrap truncate ${
              activeTab === 'history'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            النتائج ومراجعة الأخطاء ({attempts.length})
          </button>
        </div>

        {/* ====================================================================
            TAB 1: INTERACTIVE TEST RUNNER
           ==================================================================== */}
        {activeTab === 'runner' && (
          <div className="space-y-5">
            {sessionState === 'setup' && (
              <div className="space-y-4">
                {/* Scope Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    1. اختر نطاق الاختبار:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {(
                      [
                        { key: 'topic', label: 'موضوع واحد' },
                        { key: 'subject', label: 'مادة كاملة' },
                        { key: 'block', label: 'بلوك كامل' },
                        { key: 'multi-topic', label: 'عدة مواضيع' },
                        { key: 'mistakes-retry', label: 'إعادة الأخطاء' }
                      ] as const
                    ).map((sc) => (
                      <button
                        key={sc.key}
                        type="button"
                        onClick={() => setScopeType(sc.key)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                          scopeType === sc.key
                            ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target Dropdown or Multi-Topic Checkboxes */}
                {scopeType === 'topic' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      الموضوع المحدد:
                    </label>
                    <select
                      value={selectedTopicId}
                      onChange={(e) => setSelectedTopicId(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      {topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.titleEn || t.title} — {t.titleAr || t.subtitle}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {scopeType === 'subject' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      المادة الدراسية (Subject):
                    </label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.titleEn} — {s.titleAr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {scopeType === 'block' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      البلوك الطبي (Block):
                    </label>
                    <select
                      value={selectedBlockId}
                      onChange={(e) => setSelectedBlockId(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      {blocks.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.titleEn} — {b.titleAr}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {scopeType === 'multi-topic' && (
                  <div className="space-y-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 max-h-52 overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">
                        اختر المواضيع المراد دمجها في اختبار واحد ({multiSelectedTopicIds.length}):
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setMultiSelectedTopicIds(
                            multiSelectedTopicIds.length === topics.length
                              ? []
                              : topics.map((t) => t.id)
                          )
                        }
                        className="text-xs text-emerald-600 dark:text-emerald-400 font-bold"
                      >
                        {multiSelectedTopicIds.length === topics.length
                          ? 'إلغاء تحديد الكل'
                          : 'تحديد الكل'}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {topics.map((t) => {
                        const checked = multiSelectedTopicIds.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setMultiSelectedTopicIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== t.id)
                                  : [...prev, t.id]
                              )
                            }
                            className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-right text-xs flex items-center justify-between ${
                              checked
                                ? 'bg-emerald-500/10 border-emerald-500 font-bold'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <span dir="ltr" className="truncate text-left">
                              {t.titleEn || t.title}
                            </span>
                            {checked && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Quiz Settings Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block">
                      عدد الأسئلة (المتوفر: {availableScopeQuestions.length})
                    </label>
                    <select
                      value={desiredCount}
                      onChange={(e) => setDesiredCount(Number(e.target.value))}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      <option value={5}>5 أسئلة</option>
                      <option value={10}>10 أسئلة</option>
                      <option value={15}>15 سؤال</option>
                      <option value={25}>25 سؤال</option>
                      <option value={999}>كل الأسئلة ({availableScopeQuestions.length})</option>
                    </select>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block">
                      نظام التصحيح
                    </label>
                    <select
                      value={gradingMode}
                      onChange={(e) =>
                        setGradingMode(e.target.value as 'instant' | 'exam')
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      <option value="instant">تصحيح فوري بعد كل سؤال</option>
                      <option value="exam">تصحيح في نهاية الاختبار (Exam Mode)</option>
                    </select>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block">
                      المؤقت الزمني (اختياري)
                    </label>
                    <select
                      value={timerMinutes}
                      onChange={(e) => setTimerMinutes(Number(e.target.value))}
                      className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      <option value={0}>بدون مؤقت (مفتوح)</option>
                      <option value={5}>5 دقائق</option>
                      <option value={10}>10 دقائق</option>
                      <option value={20}>20 دقيقة</option>
                      <option value={35}>35 دقيقة</option>
                    </select>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 flex flex-col justify-center">
                    <button
                      type="button"
                      onClick={() => setRandomizeQuestions((v) => !v)}
                      className="flex items-center justify-between text-xs font-bold"
                    >
                      <span className="flex items-center gap-1.5">
                        <Shuffle className="w-3.5 h-3.5 text-emerald-500" />
                        <span>ترتيب عشوائي للأسئلة</span>
                      </span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {randomizeQuestions ? 'مفعّل' : 'إيقاف'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRandomizeOptions((v) => !v)}
                      className="flex items-center justify-between text-xs font-bold"
                    >
                      <span>خلط الخيارات</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400">
                        {randomizeOptions ? 'مفعّل' : 'إيقاف'}
                      </span>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => startQuizSession()}
                  className="w-full min-h-[48px] py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-sm font-extrabold flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  <span>
                    بدء الاختبار الآن ({Math.min(desiredCount, availableScopeQuestions.length)} سؤال)
                  </span>
                </button>
              </div>
            )}

            {/* ACTIVE QUIZ SESSION */}
            {sessionState === 'active' && currentQuestion && currentUserResp && (
              <div className="space-y-4">
                {/* Progress & Timer Bar */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                  <div className="font-extrabold">
                    <span>
                      السؤال {currentIdx + 1} من {sessionQuestions.length}
                    </span>
                    <span className="mx-2 text-slate-400">·</span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {QUESTION_TYPE_LABELS[currentQuestion.type]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-emerald-500" />
                      {remainingSeconds !== null
                        ? `المتبقي: ${Math.floor(remainingSeconds / 60)}:${String(
                            remainingSeconds % 60
                          ).padStart(2, '0')}`
                        : `${Math.floor(elapsedSeconds / 60)}:${String(
                            elapsedSeconds % 60
                          ).padStart(2, '0')}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSessionState('setup')}
                      className="text-rose-500 font-sans font-bold hover:underline"
                    >
                      إنهاء
                    </button>
                  </div>
                </div>

                {/* Question Stem & Image */}
                <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                  <p
                    dir="ltr"
                    className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-relaxed text-left"
                  >
                    {currentQuestion.questionEn}
                  </p>
                  {currentQuestion.questionAr && (
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {currentQuestion.questionAr}
                    </p>
                  )}

                  {currentQuestion.imageUrl && (
                    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
                      <img
                        src={currentQuestion.imageUrl}
                        alt={currentQuestion.imageCaption || 'Question medical diagram'}
                        referrerPolicy="no-referrer"
                        className="w-full max-h-72 object-contain mx-auto"
                      />
                      {currentQuestion.imageCaption && (
                        <p className="p-2.5 text-center text-[11px] text-slate-300 bg-slate-950/90">
                          {currentQuestion.imageCaption}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Options for Single Choice / Multiple Select / True-False / Image-Based */}
                  {(currentQuestion.type === 'single_choice' ||
                    currentQuestion.type === 'multiple_select' ||
                    currentQuestion.type === 'true_false' ||
                    currentQuestion.type === 'image_based') && (
                    <div className="space-y-2 pt-2">
                      {currentQuestion.options.map((opt) => {
                        const isSelected = currentUserResp.selectedKeys.includes(opt.key);
                        const isCorrectOption = currentQuestion.correctOptionKeys.includes(
                          opt.key
                        );

                        let borderStyle =
                          'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800';
                        if (isCurrentQuestionRevealed) {
                          if (isCorrectOption) {
                            borderStyle =
                              'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                          } else if (isSelected && !isCorrectOption) {
                            borderStyle =
                              'bg-rose-500/15 border-rose-500 text-rose-900 dark:text-rose-200';
                          }
                        } else if (isSelected) {
                          borderStyle =
                            'bg-emerald-500/10 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                        }

                        return (
                          <button
                            key={opt.key}
                            type="button"
                            disabled={isCurrentQuestionRevealed}
                            onClick={() => {
                              const isMulti = currentQuestion.type === 'multiple_select';
                              const nextKeys = isMulti
                                ? isSelected
                                  ? currentUserResp.selectedKeys.filter((k) => k !== opt.key)
                                  : [...currentUserResp.selectedKeys, opt.key]
                                : [opt.key];

                              setUserResponses((prev) => ({
                                ...prev,
                                [currentQuestion.id]: {
                                  ...currentUserResp,
                                  selectedKeys: nextKeys,
                                  revealedInstant:
                                    gradingMode === 'instant' && !isMulti
                                      ? true
                                      : currentUserResp.revealedInstant
                                }
                              }));
                            }}
                            className={`w-full min-h-[48px] p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition-colors ${borderStyle}`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
                                {opt.key}
                              </span>
                              <div className="min-w-0">
                                <p
                                  dir="ltr"
                                  className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
                                >
                                  {opt.textEn}
                                </p>
                                {opt.textAr && (
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {opt.textAr}
                                  </p>
                                )}
                              </div>
                            </div>
                            {isCurrentQuestionRevealed && isCorrectOption && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            )}
                            {isCurrentQuestionRevealed && isSelected && !isCorrectOption && (
                              <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Fill in the Blank & Short Answer */}
                  {(currentQuestion.type === 'fill_blank' ||
                    currentQuestion.type === 'short_answer') && (
                    <div className="space-y-2 pt-2">
                      <input
                        type="text"
                        dir="auto"
                        disabled={isCurrentQuestionRevealed}
                        value={currentUserResp.textAnswer}
                        onChange={(e) =>
                          setUserResponses((prev) => ({
                            ...prev,
                            [currentQuestion.id]: {
                              ...currentUserResp,
                              textAnswer: e.target.value
                            }
                          }))
                        }
                        placeholder="اكتب إجابتك العلمية هنا (بالإنجليزية أو العربية)..."
                        className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-bold focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  {/* Matching Question Type */}
                  {currentQuestion.type === 'matching' &&
                    currentQuestion.matchingPairs && (
                      <div className="space-y-2.5 pt-2">
                        {currentQuestion.matchingPairs.map((pair) => {
                          const allRightChoices = currentQuestion.matchingPairs!.map(
                            (p) => p.rightEn
                          );
                          const selectedRight =
                            currentUserResp.matchingMap[pair.id] || '';
                          return (
                            <div
                              key={pair.id}
                              className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 items-center"
                            >
                              <div>
                                <p
                                  dir="ltr"
                                  className="text-xs font-extrabold text-slate-900 dark:text-white text-left"
                                >
                                  {pair.leftEn}
                                </p>
                                {pair.leftAr && (
                                  <p className="text-[11px] text-slate-500">{pair.leftAr}</p>
                                )}
                              </div>
                              <select
                                disabled={isCurrentQuestionRevealed}
                                value={selectedRight}
                                onChange={(e) =>
                                  setUserResponses((prev) => ({
                                    ...prev,
                                    [currentQuestion.id]: {
                                      ...currentUserResp,
                                      matchingMap: {
                                        ...currentUserResp.matchingMap,
                                        [pair.id]: e.target.value
                                      }
                                    }
                                  }))
                                }
                                className="w-full min-h-[42px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                              >
                                <option value="">-- اختر المطابقة الصحيحة --</option>
                                {allRightChoices.map((rc) => (
                                  <option key={rc} value={rc}>
                                    {rc}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {/* Check Answer Button for Multiple Select / Fill Blank / Short Answer / Matching in Instant Mode */}
                  {gradingMode === 'instant' &&
                    !currentUserResp.revealedInstant &&
                    currentQuestion.type !== 'single_choice' &&
                    currentQuestion.type !== 'true_false' &&
                    currentQuestion.type !== 'image_based' && (
                      <button
                        type="button"
                        onClick={() =>
                          setUserResponses((prev) => ({
                            ...prev,
                            [currentQuestion.id]: {
                              ...currentUserResp,
                              revealedInstant: true
                            }
                          }))
                        }
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
                      >
                        تحقق من الإجابة الآن
                      </button>
                    )}

                  {/* Instant Explanation & Linked Dictionary Terms */}
                  {isCurrentQuestionRevealed && (
                    <div
                      className={`p-4 rounded-2xl border space-y-2 mt-3 ${
                        isCurrentQuestionCorrect
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-rose-500/10 border-rose-500/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-extrabold">
                        {isCurrentQuestionCorrect ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span className="text-emerald-800 dark:text-emerald-300">
                              إجابة صحيحة!
                            </span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 text-rose-500" />
                            <span className="text-rose-800 dark:text-rose-300">
                              إجابة غير صحيحة — الإجابة النموذجية:{' '}
                              {currentQuestion.correctOptionKeys?.length
                                ? currentQuestion.correctOptionKeys.join(', ')
                                : (currentQuestion.acceptableAnswers || []).join(' / ')}
                            </span>
                          </>
                        )}
                      </div>
                      <p
                        dir="ltr"
                        className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed text-left"
                      >
                        {currentQuestion.explanationEn}
                      </p>
                      {currentQuestion.explanationAr &&
                        currentQuestion.explanationAr !== currentQuestion.explanationEn && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {currentQuestion.explanationAr}
                          </p>
                        )}

                      {currentQuestion.linkedTermIds &&
                        currentQuestion.linkedTermIds.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center flex-wrap gap-1.5">
                            <span className="text-[11px] text-slate-500">
                              المصطلحات المرتبطة بالسؤال:
                            </span>
                            {currentQuestion.linkedTermIds.map((tid) => {
                              const tObj = termByIdMap.get(tid);
                              if (!tObj) return null;
                              return (
                                <button
                                  key={tid}
                                  type="button"
                                  onClick={() => onOpenTermDetail(tid)}
                                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 hover:border-emerald-500"
                                >
                                  {tObj.term} ({tObj.translation})
                                </button>
                              );
                            })}
                          </div>
                        )}
                    </div>
                  )}
                </div>

                {/* Navigation Controls */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    disabled={currentIdx === 0}
                    onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-xs font-bold"
                  >
                    السؤال السابق
                  </button>

                  {currentIdx < sessionQuestions.length - 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentIdx((i) => Math.min(sessionQuestions.length - 1, i + 1))
                      }
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-950 text-xs font-extrabold"
                    >
                      السؤال التالي
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={finishAndGradeQuizSession}
                      className="min-h-[44px] px-6 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
                    >
                      إنهاء الاختبار وعرض النتيجة
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* FINISHED QUIZ SUMMARY & MISTAKE REVIEW */}
            {sessionState === 'finished' && completedAttempt && (
              <div className="space-y-4">
                <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-3">
                  <Award className="w-10 h-10 text-emerald-500 mx-auto" />
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    النتيجة النهائية: {completedAttempt.scorePercent}%
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                    إجابات صحيحة: {completedAttempt.correctCount} · إجابات خاطئة:{' '}
                    {completedAttempt.wrongCount} · المدة:{' '}
                    {completedAttempt.durationSeconds} ثانية
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => startQuizSession()}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>إعادة الاختبار</span>
                    </button>

                    {completedAttempt.wrongCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const failedIds = new Set(
                            completedAttempt.answers
                              .filter((a) => !a.isCorrect)
                              .map((a) => a.questionId)
                          );
                          const failedQs = sessionQuestions.filter((q) =>
                            failedIds.has(q.id)
                          );
                          startQuizSession(failedQs);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-extrabold flex items-center gap-1.5"
                      >
                        <span>إعادة الأسئلة الخاطئة فقط ({completedAttempt.wrongCount})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSessionState('setup')}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-bold"
                    >
                      اختبار جديد
                    </button>
                  </div>
                </div>

                {/* Detailed Review of All Questions in Session */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                    مراجعة الإجابات والتفسير العلمي:
                  </h4>
                  {sessionQuestions.map((q, idx) => {
                    const ans = completedAttempt.answers.find(
                      (a) => a.questionId === q.id
                    );
                    const ok = Boolean(ans?.isCorrect);
                    return (
                      <div
                        key={q.id}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p
                            dir="ltr"
                            className="text-xs font-extrabold text-slate-900 dark:text-white text-left"
                          >
                            {idx + 1}. {q.questionEn}
                          </p>
                          <span
                            className={`text-[11px] font-bold shrink-0 ${
                              ok
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {ok ? 'صحيحة' : 'خاطئة'}
                          </span>
                        </div>
                        <p
                          dir="ltr"
                          className="text-xs text-emerald-700 dark:text-emerald-300 font-mono text-left"
                        >
                          Correct:{' '}
                          {q.correctOptionKeys?.length
                            ? q.correctOptionKeys.join(', ')
                            : (q.acceptableAnswers || []).join(' | ')}
                        </p>
                        <p
                          dir="ltr"
                          className="text-xs text-slate-600 dark:text-slate-400 text-left"
                        >
                          {q.explanationEn}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 2: QUESTION BUILDER & IMPORTER (MANUAL / BULK TEXT / JSON FILE)
           ==================================================================== */}
        {activeTab === 'builder' && (
          <div className="space-y-5">
            {/* Target Hierarchy Assignment */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">
                  البلوك المرتبط (Block):
                </label>
                <select
                  value={targetBlockId}
                  onChange={(e) => setTargetBlockId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                >
                  {blocks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.titleEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">
                  المادة المرتبطة (Subject):
                </label>
                <select
                  value={targetSubjectId}
                  onChange={(e) => setTargetSubjectId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.titleEn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 block">
                  الموضوع المرتبط (Topic):
                </label>
                <select
                  value={targetTopicId}
                  onChange={(e) => setTargetTopicId(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.titleEn || t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* 3 Input Method Sub-Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setInputMode('manual')}
                className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  inputMode === 'manual'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>1. إدخال يدوي سؤالاً بسؤال</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('paste_text')}
                className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  inputMode === 'paste_text'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>2. لصق مجموعة أسئلة كنص (مع قالب جاهز)</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('file_import')}
                className={`min-h-[42px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                  inputMode === 'file_import'
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>3. استيراد ملف (JSON صيغة أساسية / CSV / TXT)</span>
              </button>
            </div>

            {/* MODE 1: MANUAL BUILDER */}
            {inputMode === 'manual' && (
              <form
                onSubmit={handleSaveManualQuestion}
                className="p-4 sm:p-5 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold block">نوع السؤال:</label>
                    <select
                      value={manualType}
                      onChange={(e) => {
                        const nextType = e.target.value as UnifiedQuestionType;
                        setManualType(nextType);
                        if (nextType === 'true_false') {
                          setManualCorrectKeys(['T']);
                        } else if (nextType === 'single_choice') {
                          setManualCorrectKeys(['A']);
                        }
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    >
                      {(Object.keys(QUESTION_TYPE_LABELS) as UnifiedQuestionType[]).map(
                        (qt) => (
                          <option key={qt} value={qt}>
                            {QUESTION_TYPE_LABELS[qt]}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {manualType === 'image_based' && (
                    <div className="space-y-1">
                      <label className="text-xs font-bold block">رابط الصورة التشخيصية:</label>
                      <input
                        type="text"
                        dir="ltr"
                        value={manualImageUrl}
                        onChange={(e) => setManualImageUrl(e.target.value)}
                        placeholder="https://... or data:image/..."
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold block">
                      نص السؤال بالإنجليزية (Academic English Question):
                    </label>
                    <textarea
                      rows={3}
                      dir="ltr"
                      required
                      value={manualQuestionEn}
                      onChange={(e) => setManualQuestionEn(e.target.value)}
                      placeholder="Write the clinical question stem in English..."
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold block">
                      ترجمة السؤال بالعربية (اختياري):
                    </label>
                    <textarea
                      rows={3}
                      value={manualQuestionAr}
                      onChange={(e) => setManualQuestionAr(e.target.value)}
                      placeholder="ترجمة السؤال بالعربية..."
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                </div>

                {/* Options editor for MCQ / Multi-select / Image-based */}
                {(manualType === 'single_choice' ||
                  manualType === 'multiple_select' ||
                  manualType === 'image_based') && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold block">
                      الخيارات (حدد الخيار أو الخيارات الصحيحة):
                    </label>
                    {manualOptions.map((opt, idx) => {
                      const isChecked = manualCorrectKeys.includes(opt.key);
                      return (
                        <div key={opt.key} className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (manualType === 'multiple_select') {
                                setManualCorrectKeys((prev) =>
                                  isChecked
                                    ? prev.filter((k) => k !== opt.key)
                                    : [...prev, opt.key]
                                );
                              } else {
                                setManualCorrectKeys([opt.key]);
                              }
                            }}
                            className={`min-h-[40px] min-w-[40px] rounded-xl font-mono text-xs font-extrabold border ${
                              isChecked
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {opt.key}
                          </button>
                          <input
                            type="text"
                            dir="ltr"
                            value={opt.textEn}
                            onChange={(e) => {
                              const val = e.target.value;
                              setManualOptions((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, textEn: val } : item
                                )
                              );
                            }}
                            placeholder={`Option ${opt.key} in English...`}
                            className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {manualType === 'true_false' && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold">الإجابة الصحيحة:</span>
                    <button
                      type="button"
                      onClick={() => setManualCorrectKeys(['T'])}
                      className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold border ${
                        manualCorrectKeys.includes('T')
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      True (صحيح)
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualCorrectKeys(['F'])}
                      className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-bold border ${
                        manualCorrectKeys.includes('F')
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      False (خطأ)
                    </button>
                  </div>
                )}

                {(manualType === 'fill_blank' || manualType === 'short_answer') && (
                  <div className="space-y-1">
                    <label className="text-xs font-bold block">
                      الإجابات المقبولة (افصل بين المرادفات بعلامة | ):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={manualAcceptableText}
                      onChange={(e) => setManualAcceptableText(e.target.value)}
                      placeholder="e.g., von Willebrand factor | vWF"
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                )}

                {manualType === 'matching' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold">أزواج المطابقة (Matching Pairs):</label>
                      <button
                        type="button"
                        onClick={() =>
                          setManualMatchingPairs((prev) => [
                            ...prev,
                            { id: `p-${Date.now()}`, leftEn: '', rightEn: '' }
                          ])
                        }
                        className="text-xs text-emerald-600 font-bold"
                      >
                        + إضافة زوج
                      </button>
                    </div>
                    {manualMatchingPairs.map((pair, pIdx) => (
                      <div key={pair.id} className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          dir="ltr"
                          value={pair.leftEn}
                          onChange={(e) => {
                            const val = e.target.value;
                            setManualMatchingPairs((prev) =>
                              prev.map((item, i) =>
                                i === pIdx ? { ...item, leftEn: val } : item
                              )
                            );
                          }}
                          placeholder="العنصر الأول (Left)..."
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                        />
                        <input
                          type="text"
                          dir="ltr"
                          value={pair.rightEn}
                          onChange={(e) => {
                            const val = e.target.value;
                            setManualMatchingPairs((prev) =>
                              prev.map((item, i) =>
                                i === pIdx ? { ...item, rightEn: val } : item
                              )
                            );
                          }}
                          placeholder="المطابقة الصحيحة (Right)..."
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold block">
                      التفسير العلمي (Explanation in English):
                    </label>
                    <textarea
                      rows={2}
                      dir="ltr"
                      value={manualExplanationEn}
                      onChange={(e) => setManualExplanationEn(e.target.value)}
                      placeholder="Explain why the answer is correct..."
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold block">
                      التفسير بالعربية (اختياري):
                    </label>
                    <textarea
                      rows={2}
                      value={manualExplanationAr}
                      onChange={(e) => setManualExplanationAr(e.target.value)}
                      placeholder="شرح سبب الإجابة بالعربية..."
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="min-h-[46px] px-6 py-2.5 rounded-2xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
                >
                  فحص وحفظ السؤال في بنك الاختبارات
                </button>
              </form>
            )}

            {/* MODE 2: BULK PASTE TEXT */}
            {inputMode === 'paste_text' && (
              <div className="p-4 sm:p-5 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    الصق مجموعة أسئلة دفعة واحدة وفق القالب القياسي (أو صيغة Q01. ... Answer: B)، ثم اضغط على فحص ومعاينة قبل الحفظ:
                  </p>
                  <button
                    type="button"
                    onClick={() => setBulkPasteText(BULK_QUIZ_TEXT_TEMPLATE)}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400"
                  >
                    استعادة القالب التوضيحي
                  </button>
                </div>

                <textarea
                  rows={10}
                  dir="ltr"
                  value={bulkPasteText}
                  onChange={(e) => setBulkPasteText(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono leading-relaxed text-left"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleValidateBulkText}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    <span>فحص صحة الأسئلة وعرض المعاينة</span>
                  </button>
                </div>
              </div>
            )}

            {/* MODE 3: FILE IMPORT (JSON Primary + CSV/TXT) */}
            {inputMode === 'file_import' && (
              <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold">
                    استيراد ملف أسئلة (JSON كصيغة أساسية، أو TXT / CSV)
                  </h4>
                  <p className="text-xs text-slate-500">
                    سيقوم النظام بفحص جميع الأسئلة والخيارات والإجابات تلقائياً وعرض تقرير الأخطاء والمعاينة قبل إضافتها لقاعدة البيانات.
                  </p>
                </div>

                <input
                  ref={fileImportInputRef}
                  type="file"
                  accept=".json,.txt,.csv"
                  onChange={handleImportQuestionsFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileImportInputRef.current?.click()}
                  className="min-h-[48px] px-5 py-3 rounded-2xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>اختيار ملف أسئلة من الجهاز (.json / .txt / .csv)</span>
                </button>
              </div>
            )}

            {/* VALIDATION REPORT & INTERACTIVE LIVE PREVIEW BEFORE SAVING */}
            {validationReport && (
              <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-xs font-extrabold flex items-center gap-2">
                    {validationReport.valid ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    )}
                    <span>
                      تقرير الفحص والمعاينة قبل الحفظ ({stagedPreviewQuestions.length} سؤال صالح ·{' '}
                      {validationReport.issues.length} تنبيه/خطأ)
                    </span>
                  </h4>

                  {stagedPreviewQuestions.length > 0 && (
                    <button
                      type="button"
                      onClick={handleCommitStagedQuestions}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
                    >
                      تأكيد وحفظ الأسئلة ({stagedPreviewQuestions.length})
                    </button>
                  )}
                </div>

                {validationReport.issues.length > 0 && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto">
                    {validationReport.issues.map((iss, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl text-xs border ${
                          iss.severity === 'error'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                            : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        <p className="font-bold">{iss.messageAr}</p>
                        {iss.rawSnippet && (
                          <p dir="ltr" className="text-[11px] font-mono opacity-80 mt-0.5">
                            {iss.rawSnippet}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {stagedPreviewQuestions.length > 0 && (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                    {stagedPreviewQuestions.map((sq, sIdx) => (
                      <div
                        key={sq.id}
                        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                            سؤال #{sIdx + 1} · {QUESTION_TYPE_LABELS[sq.type]}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setStagedPreviewQuestions((prev) =>
                                prev.filter((_, i) => i !== sIdx)
                              )
                            }
                            className="text-rose-500 text-xs font-bold"
                          >
                            استبعاد
                          </button>
                        </div>
                        <input
                          type="text"
                          dir="ltr"
                          value={sq.questionEn}
                          onChange={(e) => {
                            const val = e.target.value;
                            setStagedPreviewQuestions((prev) =>
                              prev.map((item, i) =>
                                i === sIdx ? { ...item, questionEn: val } : item
                              )
                            );
                          }}
                          className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                        />
                        <div className="text-[11px] font-mono text-slate-500" dir="ltr">
                          Correct:{' '}
                          {sq.correctOptionKeys?.length
                            ? sq.correctOptionKeys.join(', ')
                            : (sq.acceptableAnswers || []).join(' | ')}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ====================================================================
            TAB 3: ATTEMPT HISTORY & QUESTION BANK MANAGEMENT
           ==================================================================== */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            {attempts.length === 0 ? (
              <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  لم تقم بإجراء أي اختبار بعد. ابدأ اختباراً جديداً ليتم حفظ نتيجتك وسجل تقدمك هنا.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                  سجل نتائج الاختبارات السابقة ({attempts.length}):
                </h3>
                {attempts.map((att) => (
                  <div
                    key={att.id}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap"
                  >
                    <div>
                      <h4 dir="ltr" className="text-xs font-extrabold text-left">
                        {att.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                        الدرجة: {att.scorePercent}% ({att.correctCount}/{att.totalQuestions}) ·
                        الأخطاء: {att.wrongCount} · {att.completedAt.slice(0, 10)}
                      </p>
                    </div>
                    {att.wrongCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const wrongIds = new Set(
                            att.answers.filter((a) => !a.isCorrect).map((a) => a.questionId)
                          );
                          const retryPool = questions.filter((q) => wrongIds.has(q.id));
                          setActiveTab('runner');
                          startQuizSession(retryPool);
                        }}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs font-bold"
                      >
                        إعادة الأسئلة الخاطئة ({att.wrongCount})
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Question Bank Browser with Delete option */}
            <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                بنك الأسئلة المحفوظ حالياً ({questions.length} سؤال):
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {questions.slice(0, 40).map((q) => (
                  <div
                    key={q.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p dir="ltr" className="text-xs font-bold truncate text-left">
                        {q.questionEn}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {QUESTION_TYPE_LABELS[q.type]} · الإجابة:{' '}
                        {q.correctOptionKeys?.length
                          ? q.correctOptionKeys.join(', ')
                          : (q.acceptableAnswers || []).join(' | ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteQuestion(q.id)}
                      className="min-h-[36px] min-w-[36px] rounded-xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center shrink-0"
                      title="حذف السؤال"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
