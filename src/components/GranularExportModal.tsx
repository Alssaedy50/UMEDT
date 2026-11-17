import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  Share2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  Globe,
  Archive,
  Send
} from 'lucide-react';
import {
  DictionaryTerm,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  QuizAttemptRecord,
  AcademicExamPackage
} from '../types/lexicon';
import {
  GITHUB_DIRECT_RELEASE_LINKS,
  VerifiedExportResult,
  buildTermsCsvContent,
  buildQuestionsAndResultsCsvContent,
  resolveTermsForTopics,
  buildSingleTopicExportBundle,
  buildSubjectExportBundle,
  buildBlockExportBundle,
  executeVerifiedExportDownload
} from '../services/exportDownloadService';
import {
  generateStandaloneHtmlDocument,
  generateStandaloneZipArchiveBytes,
  generateStandaloneExamHtmlDocument,
  generateStandaloneExamZipArchiveBytes
} from '../services/standaloneExportService';
import { sendInteractiveFileToTelegram } from '../services/telegramBackupService';
import {
  loadAcademicBooks,
  loadAcademicExams,
  loadMediaAssetsIndex,
  loadUserStudyNotes
} from '../services/learningHierarchyService';
import {
  LocalDownloadRecord,
  getDownloadedFilesHistory,
  openSavedDownloadFile,
  shareSavedDownloadFile
} from '../utils/downloadHelper';

interface GranularExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  questions: UnifiedQuizQuestion[];
  attempts: QuizAttemptRecord[];
  exams?: AcademicExamPackage[];
  defaultTopicId?: string | null;
  defaultSubjectId?: string | null;
  defaultBlockId?: string | null;
  defaultExamId?: string | null;
  showToast: (msg: string, type?: string) => void;
}

type ExportScopeOption =
  | 'all_terms'
  | 'subject_or_block_terms'
  | 'single_topic'
  | 'complete_subject'
  | 'complete_block'
  | 'tests_and_results';

export const GranularExportModal: React.FC<GranularExportModalProps> = ({
  isOpen,
  onClose,
  blocks,
  subjects,
  topics,
  terms,
  questions,
  attempts,
  exams,
  defaultTopicId,
  defaultSubjectId,
  defaultBlockId,
  defaultExamId,
  showToast
}) => {
  const availableExams = useMemo(() => exams ?? loadAcademicExams(), [exams]);
  const [scope, setScope] = useState<ExportScopeOption>(
    defaultExamId
      ? 'tests_and_results'
      : defaultTopicId
        ? 'single_topic'
        : defaultBlockId
          ? 'complete_block'
          : defaultSubjectId
            ? 'complete_subject'
            : 'all_terms'
  );
  const [format, setFormat] = useState<'json' | 'csv' | 'html' | 'zip'>(
    defaultTopicId || defaultBlockId || defaultSubjectId || defaultExamId ? 'html' : 'json'
  );
  const [includeLocalMedia, setIncludeLocalMedia] = useState<boolean>(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    defaultBlockId || blocks[0]?.id || ''
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    defaultSubjectId || subjects[0]?.id || ''
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    defaultTopicId || topics[0]?.id || ''
  );
  const [selectedExamId, setSelectedExamId] = useState<string>(
    defaultExamId || 'ALL'
  );
  const [termFilterTarget, setTermFilterTarget] = useState<'subject' | 'block'>('subject');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [telegramSendFeedback, setTelegramSendFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [lastExportResult, setLastExportResult] = useState<VerifiedExportResult | null>(
    null
  );
  const [downloadedHistory, setDownloadedHistory] = useState<LocalDownloadRecord[]>(
    () => getDownloadedFilesHistory()
  );
  const [previewRecord, setPreviewRecord] = useState<LocalDownloadRecord | null>(
    null
  );

  const supportsCsv =
    scope === 'all_terms' ||
    scope === 'subject_or_block_terms' ||
    scope === 'tests_and_results';

  const supportsStandaloneHtmlZip =
    scope === 'single_topic' ||
    scope === 'complete_subject' ||
    scope === 'complete_block' ||
    scope === 'tests_and_results';

  const effectiveFormat: 'json' | 'csv' | 'html' | 'zip' = useMemo(() => {
    if (format === 'csv' && supportsCsv) return 'csv';
    if ((format === 'html' || format === 'zip') && supportsStandaloneHtmlZip) {
      return format;
    }
    return 'json';
  }, [format, supportsCsv, supportsStandaloneHtmlZip]);

  const activeBlock = useMemo(
    () => blocks.find((b) => b.id === selectedBlockId) || blocks[0],
    [blocks, selectedBlockId]
  );

  const activeSubject = useMemo(
    () => subjects.find((s) => s.id === selectedSubjectId) || subjects[0],
    [subjects, selectedSubjectId]
  );

  const activeTopic = useMemo(
    () => topics.find((t) => t.id === selectedTopicId) || topics[0],
    [topics, selectedTopicId]
  );

  const buildCurrentExportPayload = async (): Promise<{
    fileName: string;
    content: string | Uint8Array;
    recordsCount: number;
    titleAr: string;
    scopeLabel: string;
    mimeType: string;
  }> => {
    let fileName = `UMEDT_Export_${Date.now()}.${effectiveFormat}`;
    let content: string | Uint8Array = '';
    let recordsCount = 0;
    let titleAr = 'تصدير بيانات UMEDT';
    let scopeLabel = 'حزمة بيانات UMEDT';

    if (scope === 'all_terms') {
      titleAr = 'جميع مصطلحات قاموس UMEDT';
      scopeLabel = 'قاموس المصطلحات الطبي';
      recordsCount = terms.length;
      fileName = `UMEDT_All_Terms_${terms.length}.${effectiveFormat}`;
      content =
        effectiveFormat === 'csv'
          ? buildTermsCsvContent(terms)
          : JSON.stringify(
              {
                exportType: 'UMEDT_ALL_TERMS',
                exportedAt: new Date().toISOString(),
                count: terms.length,
                terms
              },
              null,
              2
            );
    } else if (scope === 'subject_or_block_terms') {
      const targetTopics =
        termFilterTarget === 'subject'
          ? topics.filter((t) => t.subjectId === selectedSubjectId)
          : topics.filter((t) => t.blockId === selectedBlockId);

      const matchedTerms = resolveTermsForTopics(targetTopics, terms);
      const targetCode =
        termFilterTarget === 'subject'
          ? activeSubject?.code || 'SUBJ'
          : activeBlock?.code || 'BLOCK';

      titleAr =
        termFilterTarget === 'subject'
          ? `مصطلحات مادة ${activeSubject?.titleEn || ''}`
          : `مصطلحات بلوك ${activeBlock?.titleEn || ''}`;
      scopeLabel =
        termFilterTarget === 'subject' ? 'مصطلحات مادة دراسية' : 'مصطلحات بلوك طبي';
      recordsCount = matchedTerms.length;
      fileName = `UMEDT_Terms_${targetCode}_${matchedTerms.length}.${effectiveFormat}`;
      content =
        effectiveFormat === 'csv'
          ? buildTermsCsvContent(matchedTerms)
          : JSON.stringify(
              {
                exportType: 'UMEDT_FILTERED_TERMS',
                filterType: termFilterTarget,
                targetId:
                  termFilterTarget === 'subject' ? selectedSubjectId : selectedBlockId,
                exportedAt: new Date().toISOString(),
                count: matchedTerms.length,
                terms: matchedTerms
              },
              null,
              2
            );
    } else if (scope === 'single_topic' && activeTopic) {
      const topicBlock = blocks.find((b) => b.id === activeTopic.blockId);
      const topicSubject = subjects.find((s) => s.id === activeTopic.subjectId);
      titleAr = `موضوع: ${activeTopic.titleEn || activeTopic.title}`;
      scopeLabel = `موضوع تفاعلي (${effectiveFormat.toUpperCase()})`;
      const safeSlug = activeTopic.id.replace(/[^a-zA-Z0-9_-]/g, '_');

      if (effectiveFormat === 'html') {
        const builtHtml = await generateStandaloneHtmlDocument({
          scope: 'topic',
          titleEn: activeTopic.titleEn || activeTopic.title,
          titleAr: activeTopic.titleAr || activeTopic.subtitle || activeTopic.title,
          block: topicBlock,
          subjects: topicSubject ? [topicSubject] : [],
          topics: [activeTopic],
          allTerms: terms,
          allQuestions: questions,
          books: loadAcademicBooks(),
          exams: availableExams,
          mediaAssets: loadMediaAssetsIndex(),
          userNotes: loadUserStudyNotes(),
          includeLocalMedia
        });
        fileName = `UMEDT_Topic_${safeSlug}_Standalone.html`;
        content = builtHtml.htmlText;
        recordsCount = builtHtml.recordsCount;
      } else if (effectiveFormat === 'zip') {
        const builtZip = await generateStandaloneZipArchiveBytes({
          scope: 'topic',
          titleEn: activeTopic.titleEn || activeTopic.title,
          titleAr: activeTopic.titleAr || activeTopic.subtitle || activeTopic.title,
          block: topicBlock,
          subjects: topicSubject ? [topicSubject] : [],
          topics: [activeTopic],
          allTerms: terms,
          allQuestions: questions,
          books: loadAcademicBooks(),
          exams: availableExams,
          mediaAssets: loadMediaAssetsIndex(),
          userNotes: loadUserStudyNotes(),
          includeLocalMedia
        });
        fileName = `UMEDT_Topic_${safeSlug}_Standalone.zip`;
        content = builtZip.zipBytes;
        recordsCount = builtZip.recordsCount;
      } else {
        const built = buildSingleTopicExportBundle(
          activeTopic,
          terms,
          questions,
          topicBlock,
          topicSubject
        );
        recordsCount = built.recordsCount;
        fileName = `UMEDT_Topic_${safeSlug}.json`;
        content = built.jsonText;
      }
    } else if (scope === 'complete_subject' && activeSubject) {
      const subjBlock = blocks.find((b) => b.id === activeSubject.blockId);
      const subjectTopics = topics.filter((t) => t.subjectId === activeSubject.id);
      titleAr = `مادة كاملة: ${activeSubject.titleEn}`;
      scopeLabel = `مادة دراسية تفاعلية (${effectiveFormat.toUpperCase()})`;
      const safeCode = (activeSubject.code || activeSubject.id).replace(/[^a-zA-Z0-9_-]/g, '_');

      if (effectiveFormat === 'html') {
        const builtHtml = await generateStandaloneHtmlDocument({
          scope: 'subject',
          titleEn: activeSubject.titleEn,
          titleAr: activeSubject.titleAr,
          block: subjBlock,
          subjects: [activeSubject],
          topics: subjectTopics,
          allTerms: terms,
          allQuestions: questions,
          books: loadAcademicBooks(),
          exams: availableExams,
          mediaAssets: loadMediaAssetsIndex(),
          userNotes: loadUserStudyNotes(),
          includeLocalMedia
        });
        fileName = `UMEDT_Subject_${safeCode}_Standalone.html`;
        content = builtHtml.htmlText;
        recordsCount = builtHtml.recordsCount;
      } else if (effectiveFormat === 'zip') {
        const builtZip = await generateStandaloneZipArchiveBytes({
          scope: 'subject',
          titleEn: activeSubject.titleEn,
          titleAr: activeSubject.titleAr,
          block: subjBlock,
          subjects: [activeSubject],
          topics: subjectTopics,
          allTerms: terms,
          allQuestions: questions,
          books: loadAcademicBooks(),
          exams: availableExams,
          mediaAssets: loadMediaAssetsIndex(),
          userNotes: loadUserStudyNotes(),
          includeLocalMedia
        });
        fileName = `UMEDT_Subject_${safeCode}_Standalone.zip`;
        content = builtZip.zipBytes;
        recordsCount = builtZip.recordsCount;
      } else {
        const built = buildSubjectExportBundle(
          activeSubject,
          topics,
          terms,
          questions,
          subjBlock
        );
        recordsCount = built.recordsCount;
        fileName = `UMEDT_Subject_${safeCode}.json`;
        content = built.jsonText;
      }
    } else if (scope === 'complete_block' && activeBlock) {
      const blockSubjects = subjects.filter((s) => s.blockId === activeBlock.id);
      const subjIds = new Set(blockSubjects.map((s) => s.id));
      const blockTopics = topics.filter(
        (t) => t.blockId === activeBlock.id || (t.subjectId && subjIds.has(t.subjectId))
      );
      titleAr = `بلوك كامل: ${activeBlock.titleEn}`;
      scopeLabel = `بلوك طبي متكامل (${effectiveFormat.toUpperCase()})`;
      const safeCode = (activeBlock.code || activeBlock.id).replace(/[^a-zA-Z0-9_-]/g, '_');

      if (effectiveFormat === 'html') {
        const builtHtml = await generateStandaloneHtmlDocument({
          scope: 'block',
          titleEn: activeBlock.titleEn,
          titleAr: activeBlock.titleAr,
          block: activeBlock,
          subjects: blockSubjects,
          topics: blockTopics,
          allTerms: terms,
          allQuestions: questions,
          books: loadAcademicBooks(),
          exams: availableExams,
          mediaAssets: loadMediaAssetsIndex(),
          userNotes: loadUserStudyNotes(),
          includeLocalMedia
        });
        fileName = `UMEDT_Block_${safeCode}_Standalone.html`;
        content = builtHtml.htmlText;
        recordsCount = builtHtml.recordsCount;
      } else if (effectiveFormat === 'zip') {
        const builtZip = await generateStandaloneZipArchiveBytes({
          scope: 'block',
          titleEn: activeBlock.titleEn,
          titleAr: activeBlock.titleAr,
          block: activeBlock,
          subjects: blockSubjects,
          topics: blockTopics,
          allTerms: terms,
          allQuestions: questions,
          books: loadAcademicBooks(),
          exams: availableExams,
          mediaAssets: loadMediaAssetsIndex(),
          userNotes: loadUserStudyNotes(),
          includeLocalMedia
        });
        fileName = `UMEDT_Block_${safeCode}_Standalone.zip`;
        content = builtZip.zipBytes;
        recordsCount = builtZip.recordsCount;
      } else {
        const built = buildBlockExportBundle(
          activeBlock,
          subjects,
          topics,
          terms,
          questions
        );
        recordsCount = built.recordsCount;
        fileName = `UMEDT_Block_${safeCode}.json`;
        content = built.jsonText;
      }
    } else if (scope === 'tests_and_results') {
      const selectedExam =
        selectedExamId !== 'ALL'
          ? availableExams.find((ex) => ex.id === selectedExamId) || null
          : null;

      let targetQuestions = questions;
      if (selectedExam) {
        const qById = new Map(questions.map((q) => [q.id, q]));
        if (selectedExam.questions && selectedExam.questions.length > 0) {
          targetQuestions = selectedExam.questions;
        } else if (selectedExam.questionIds && selectedExam.questionIds.length > 0) {
          targetQuestions = selectedExam.questionIds
            .map((id) => qById.get(id))
            .filter((q): q is UnifiedQuizQuestion => Boolean(q));
        } else {
          targetQuestions = questions.filter(
            (q) =>
              (selectedExam.subjectId && q.subjectId === selectedExam.subjectId) ||
              (selectedExam.blockId && q.blockId === selectedExam.blockId) ||
              (selectedExam.topicIds && q.topicId && selectedExam.topicIds.includes(q.topicId))
          );
        }
      }

      titleAr = selectedExam
        ? `اختبار: ${selectedExam.titleAr || selectedExam.titleEn}`
        : 'بنك الاختبارات التفاعلية وسجل النتائج';
      scopeLabel = `اختبار تفاعلي (${effectiveFormat.toUpperCase()})`;
      const safeSlug = (selectedExam?.id || 'Bank').replace(/[^a-zA-Z0-9_-]/g, '_');

      if (effectiveFormat === 'html') {
        const builtExamHtml = generateStandaloneExamHtmlDocument({
          titleAr,
          titleEn: selectedExam?.titleEn || 'UMEDT Interactive Medical Exam',
          exam: selectedExam,
          questions: targetQuestions,
          attempts,
          terms
        });
        fileName = `UMEDT_Exam_${safeSlug}_Standalone.html`;
        content = builtExamHtml.htmlText;
        recordsCount = builtExamHtml.recordsCount;
      } else if (effectiveFormat === 'zip') {
        const builtExamZip = generateStandaloneExamZipArchiveBytes({
          titleAr,
          titleEn: selectedExam?.titleEn || 'UMEDT Interactive Medical Exam',
          exam: selectedExam,
          questions: targetQuestions,
          attempts,
          terms
        });
        fileName = `UMEDT_Exam_${safeSlug}_Standalone.zip`;
        content = builtExamZip.zipBytes;
        recordsCount = builtExamZip.recordsCount;
      } else if (effectiveFormat === 'csv') {
        recordsCount = targetQuestions.length + attempts.length;
        fileName = `UMEDT_Exam_${safeSlug}_${targetQuestions.length}Q.csv`;
        content = buildQuestionsAndResultsCsvContent(targetQuestions, attempts);
      } else {
        recordsCount = targetQuestions.length + attempts.length;
        fileName = `UMEDT_Exam_${safeSlug}_${targetQuestions.length}Q.json`;
        content = JSON.stringify(
          {
            exportType: 'UMEDT_QUIZ_BANK_AND_RESULTS',
            exportedAt: new Date().toISOString(),
            exam: selectedExam || undefined,
            counts: {
              questions: targetQuestions.length,
              attempts: attempts.length
            },
            questions: targetQuestions,
            attempts
          },
          null,
          2
        );
      }
    }

    const mimeType =
      effectiveFormat === 'html'
        ? 'text/html;charset=utf-8'
        : effectiveFormat === 'zip'
          ? 'application/zip'
          : effectiveFormat === 'csv'
            ? 'text/csv;charset=utf-8'
            : 'application/json;charset=utf-8';

    return {
      fileName,
      content,
      recordsCount,
      titleAr,
      scopeLabel,
      mimeType
    };
  };

  const handleRunExport = async (deliveryMode: 'download' | 'share') => {
    setIsExporting(true);
    setLastExportResult(null);
    setTelegramSendFeedback(null);

    try {
      const built = await buildCurrentExportPayload();
      const result = await executeVerifiedExportDownload({
        fileName: built.fileName,
        content: built.content,
        format: effectiveFormat,
        recordsCount: built.recordsCount,
        deliveryMode,
        titleAr: built.titleAr
      });

      setLastExportResult(result);
      setDownloadedHistory(getDownloadedFilesHistory());
      showToast(result.messageAr, result.success ? 'success' : 'info');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSendInteractiveToTelegram = async () => {
    setIsSendingTelegram(true);
    setTelegramSendFeedback(null);
    try {
      const built = await buildCurrentExportPayload();
      const tgRes = await sendInteractiveFileToTelegram({
        fileName: built.fileName,
        content: built.content,
        mimeType: built.mimeType,
        titleAr: built.titleAr,
        scopeLabel: built.scopeLabel,
        recordsCount: built.recordsCount
      });
      setTelegramSendFeedback({ ok: tgRes.ok, message: tgRes.message });
      showToast(tgRes.message, tgRes.ok ? 'success' : 'info');
    } finally {
      setIsSendingTelegram(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[88dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-2xl"
      >

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              مركز المشاركة والتصدير المستقل (HTML / ZIP / JSON / CSV)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              شارك موضوعاً كاملاً أو بلوكاً كاملاً كصفحة تفاعلية مستقلة (HTML) أو أرشيف (ZIP) يعمل خارج التطبيق
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

        {/* 1. Scope Selector */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            1. اختر نطاق المحتوى المراد تنزيله أو مشاركته:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                {
                  key: 'single_topic',
                  labelAr: 'موضوع واحد كامل (Topic)',
                  sub: 'مستقل خارج التطبيق · HTML / ZIP / JSON'
                },
                {
                  key: 'complete_block',
                  labelAr: 'بلوك طبي كامل (Block)',
                  sub: 'المواد + المواضيع + الأسئلة · HTML / ZIP / JSON'
                },
                {
                  key: 'complete_subject',
                  labelAr: 'مادة دراسية كاملة (Subject)',
                  sub: 'المواضيع + المصطلحات + الأسئلة · HTML / ZIP / JSON'
                },
                {
                  key: 'all_terms',
                  labelAr: 'جميع المصطلحات في القاموس',
                  sub: `${terms.length} مصطلح · JSON / CSV`
                },
                {
                  key: 'subject_or_block_terms',
                  labelAr: 'مصطلحات مادة أو بلوك محدد',
                  sub: 'فلترة حسب المادة أو البلوك · JSON / CSV'
                },
                {
                  key: 'tests_and_results',
                  labelAr: 'اختبار تفاعلي / بنك الأسئلة والنتائج',
                  sub: `${questions.length} سؤال · ${attempts.length} نتيجة · HTML / ZIP / JSON / CSV`
                }
              ] as const
            ).map((opt) => {
              const active = scope === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setScope(opt.key)}
                  className={`min-h-[54px] p-3 rounded-2xl border text-right transition-colors flex flex-col justify-center ${
                    active
                      ? 'bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="text-xs font-extrabold">{opt.labelAr}</span>
                  <span className="text-[11px] text-slate-500 mt-0.5">{opt.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Contextual Target Pickers */}
        {scope === 'subject_or_block_terms' && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTermFilterTarget('subject')}
                className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold ${
                  termFilterTarget === 'subject'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                حسب المادة (Subject)
              </button>
              <button
                type="button"
                onClick={() => setTermFilterTarget('block')}
                className={`flex-1 min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold ${
                  termFilterTarget === 'block'
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                حسب البلوك (Block)
              </button>
            </div>

            {termFilterTarget === 'subject' ? (
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.titleEn} — {s.titleAr}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedBlockId}
                onChange={(e) => setSelectedBlockId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold"
              >
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.titleEn} — {b.titleAr}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {scope === 'single_topic' && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              اختر الموضوع المطلوب مشاركته أو تنزيله:
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

        {scope === 'complete_subject' && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              اختر المادة الدراسية الكاملة (Subject):
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

        {scope === 'complete_block' && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              اختر البلوك الطبي الكامل (Block):
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

        {scope === 'tests_and_results' && availableExams.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
              نطاق الاختبار التفاعلي المصدّر:
            </label>
            <select
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
            >
              <option value="ALL">
                جميع أسئلة البنك وسجل النتائج ({questions.length} سؤال)
              </option>
              {availableExams.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.titleAr || ex.titleEn} ({ex.titleEn})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 3. Format Selector (HTML / ZIP / JSON / CSV) */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            2. صيغة الملف والتصدير المستقل:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {supportsStandaloneHtmlZip && (
              <>
                <button
                  type="button"
                  onClick={() => setFormat('html')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                    effectiveFormat === 'html'
                      ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>HTML (صفحة مستقلة تفاعلية)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('zip')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                    effectiveFormat === 'zip'
                      ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Archive className="w-4 h-4 shrink-0" />
                  <span>ZIP (أرشيف مستقل متكامل)</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                effectiveFormat === 'json'
                  ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
              }`}
            >
              <FileJson className="w-4 h-4 shrink-0" />
              <span>JSON (حزمة بيانات قياسية)</span>
            </button>

            {supportsCsv && (
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                  effectiveFormat === 'csv'
                    ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>CSV (جداول Excel)</span>
              </button>
            )}
          </div>

          {supportsStandaloneHtmlZip && (effectiveFormat === 'html' || effectiveFormat === 'zip') && (
            <label className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={includeLocalMedia}
                onChange={(e) => setIncludeLocalMedia(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-emerald-600 shrink-0"
              />
              <div className="space-y-0.5">
                <div className="font-extrabold text-slate-800 dark:text-slate-200">
                  تضمين الوسائط المحلية داخل الحزمة (اختياري)
                </div>
                <div className="text-[11px] text-slate-500">
                  الروابط الخارجية للصور والفيديو والصوت وملفات PDF تبقى محفوظة دائماً. عند تفعيل هذا الخيار تُرفق الملفات المحلية المرفوعة من الهاتف داخل ملف HTML أو مجلد media/ في أرشيف ZIP.
                </div>
              </div>
            </label>
          )}
        </div>

        {/* 4. Action Buttons (Direct Download + Native Android Share + Direct Telegram Share) */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={isExporting || isSendingTelegram}
              onClick={() => void handleRunExport('download')}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>تنزيل مباشر إلى الجهاز ({effectiveFormat.toUpperCase()})</span>
            </button>

            <button
              type="button"
              disabled={isExporting || isSendingTelegram}
              onClick={() => void handleRunExport('share')}
              className="min-h-[48px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>مشاركة وحفظ الملف على أندرويد</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isExporting || isSendingTelegram}
            onClick={() => void handleSendInteractiveToTelegram()}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>
              {isSendingTelegram
                ? 'جاري إرسال الملف التفاعلي إلى تليجرام...'
                : `إرسال مباشر إلى قناة تليجرام (${effectiveFormat.toUpperCase()})`}
            </span>
          </button>

          {telegramSendFeedback && (
            <div
              className={`p-3 rounded-2xl border text-xs font-bold leading-relaxed ${
                telegramSendFeedback.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {telegramSendFeedback.message}
            </div>
          )}
        </div>

        {/* Verified Export Status Banner with Open & Share Actions */}
        {lastExportResult && (
          <div
            className={`p-3.5 rounded-2xl border space-y-2.5 text-xs ${
              lastExportResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {lastExportResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5 min-w-0 flex-1">
                <p className="font-bold leading-relaxed break-words">
                  {lastExportResult.messageAr}
                </p>
                {lastExportResult.success && (
                  <p className="text-[11px] opacity-85 font-mono break-all" dir="ltr">
                    {lastExportResult.savedPath || `Download/UMEDT/${lastExportResult.fileName}`} ·{' '}
                    {lastExportResult.recordsCount} records ·{' '}
                    {Math.max(1, Math.round(lastExportResult.byteSize / 1024))} KB
                  </p>
                )}
              </div>
            </div>

            {lastExportResult.success && lastExportResult.record && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const rec = lastExportResult.record!;
                    const openRes = openSavedDownloadFile(rec);
                    if (!openRes.openedNatively) {
                      setPreviewRecord(rec);
                    }
                    showToast(openRes.messageAr);
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح / معاينة الملف</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const rec = lastExportResult.record!;
                    void shareSavedDownloadFile(rec).then((sh) => {
                      showToast(sh.messageAr);
                    });
                  }}
                  className="min-h-[34px] px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 font-bold flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>مشاركة الملف</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Saved Files in Download/UMEDT List */}
        {downloadedHistory.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-800 dark:text-slate-200">
                الملفات المحفوظة في الهاتف (Download/UMEDT)
              </span>
              <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                {downloadedHistory.length} ملف
              </span>
            </div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
              {downloadedHistory.slice(0, 5).map((item) => (
                <div
                  key={item.id || item.filename}
                  className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div
                      dir="ltr"
                      className="font-mono font-extrabold text-slate-900 dark:text-white text-left break-all text-[11px]"
                    >
                      {item.verifiedOnDisk
                        ? item.savedPath || `Download/UMEDT/${item.filename}`
                        : item.filename}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      الحجم: {item.sizeKB} KB ·{' '}
                      {item.verifiedOnDisk
                        ? 'تم الحفظ والتحقق في Download/UMEDT'
                        : 'أُرسل لتنزيلات المتصفح'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const openRes = openSavedDownloadFile(item);
                        if (!openRes.openedNatively) {
                          setPreviewRecord(item);
                        }
                        showToast(openRes.messageAr);
                      }}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]"
                    >
                      فتح
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void shareSavedDownloadFile(item).then((sh) => {
                          showToast(sh.messageAr);
                        });
                      }}
                      className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-[11px]"
                    >
                      مشاركة
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* In-App File Preview Popup when opened on Web/Browser */}
        {previewRecord && (
          <div className="p-3.5 rounded-2xl bg-slate-900 text-slate-100 border border-slate-700 space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span dir="ltr" className="font-mono font-bold text-emerald-400 break-all">
                {previewRecord.savedPath} ({previewRecord.sizeKB} KB)
              </span>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold"
              >
                إغلاق المعاينة
              </button>
            </div>
            <pre
              dir="ltr"
              className="max-h-40 overflow-auto text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-slate-200"
            >
              {previewRecord.previewText || 'تم حفظ الملف بنجاح.'}
            </pre>
          </div>
        )}

        {/* 5. Direct GitHub Repository & Release Links */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
          <h3 className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
            روابط التنزيل المباشرة من مستودع GitHub الرسمي (Alssaedy50/UMEDT)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href={GITHUB_DIRECT_RELEASE_LINKS.latestApkReleasePage}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between hover:border-emerald-500 transition-colors"
            >
              <span>نسخة APK الرسمية (GitHub Releases)</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </a>
            <a
              href={GITHUB_DIRECT_RELEASE_LINKS.masterTopicsJson}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between hover:border-emerald-500 transition-colors"
            >
              <span>ملف المواضيع الكامل (topics.json)</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </a>
            <a
              href={GITHUB_DIRECT_RELEASE_LINKS.masterTermsJson}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between hover:border-emerald-500 transition-colors"
            >
              <span>ملف المصطلحات الكامل (terms.json)</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </a>
            <a
              href={GITHUB_DIRECT_RELEASE_LINKS.stableManifestJson}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold flex items-center justify-between hover:border-emerald-500 transition-colors"
            >
              <span>بيان التحديث السحابي (manifest.json)</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
