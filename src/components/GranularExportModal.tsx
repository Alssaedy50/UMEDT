import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  Share2,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  FileSpreadsheet
} from 'lucide-react';
import {
  DictionaryTerm,
  TopicArticle,
  MedicalBlock,
  MedicalSubject,
  UnifiedQuizQuestion,
  QuizAttemptRecord
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

interface GranularExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  blocks: MedicalBlock[];
  subjects: MedicalSubject[];
  topics: TopicArticle[];
  terms: DictionaryTerm[];
  questions: UnifiedQuizQuestion[];
  attempts: QuizAttemptRecord[];
  defaultTopicId?: string | null;
  defaultSubjectId?: string | null;
  defaultBlockId?: string | null;
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
  defaultTopicId,
  defaultSubjectId,
  defaultBlockId,
  showToast
}) => {
  const [scope, setScope] = useState<ExportScopeOption>(
    defaultTopicId ? 'single_topic' : 'all_terms'
  );
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [selectedBlockId, setSelectedBlockId] = useState<string>(
    defaultBlockId || blocks[0]?.id || ''
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(
    defaultSubjectId || subjects[0]?.id || ''
  );
  const [selectedTopicId, setSelectedTopicId] = useState<string>(
    defaultTopicId || topics[0]?.id || ''
  );
  const [termFilterTarget, setTermFilterTarget] = useState<'subject' | 'block'>('subject');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [lastExportResult, setLastExportResult] = useState<VerifiedExportResult | null>(
    null
  );

  const supportsCsv =
    scope === 'all_terms' ||
    scope === 'subject_or_block_terms' ||
    scope === 'tests_and_results';

  const effectiveFormat: 'json' | 'csv' = supportsCsv ? format : 'json';

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

  const handleRunExport = async (deliveryMode: 'download' | 'share') => {
    setIsExporting(true);
    setLastExportResult(null);

    try {
      let fileName = `UMEDT_Export_${Date.now()}.${effectiveFormat}`;
      let content = '';
      let recordsCount = 0;
      let titleAr = 'تصدير بيانات UMEDT';

      if (scope === 'all_terms') {
        titleAr = 'جميع مصطلحات قاموس UMEDT';
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
        const built = buildSingleTopicExportBundle(
          activeTopic,
          terms,
          questions,
          topicBlock,
          topicSubject
        );
        titleAr = `موضوع: ${activeTopic.titleEn || activeTopic.title}`;
        recordsCount = built.recordsCount;
        const safeSlug = activeTopic.id.replace(/[^a-zA-Z0-9_-]/g, '_');
        fileName = `UMEDT_Topic_${safeSlug}.json`;
        content = built.jsonText;
      } else if (scope === 'complete_subject' && activeSubject) {
        const subjBlock = blocks.find((b) => b.id === activeSubject.blockId);
        const built = buildSubjectExportBundle(
          activeSubject,
          topics,
          terms,
          questions,
          subjBlock
        );
        titleAr = `مادة كاملة: ${activeSubject.titleEn}`;
        recordsCount = built.recordsCount;
        fileName = `UMEDT_Subject_${activeSubject.code || activeSubject.id}.json`;
        content = built.jsonText;
      } else if (scope === 'complete_block' && activeBlock) {
        const built = buildBlockExportBundle(
          activeBlock,
          subjects,
          topics,
          terms,
          questions
        );
        titleAr = `بلوك كامل: ${activeBlock.titleEn}`;
        recordsCount = built.recordsCount;
        fileName = `UMEDT_Block_${activeBlock.code || activeBlock.id}.json`;
        content = built.jsonText;
      } else if (scope === 'tests_and_results') {
        titleAr = 'بنك الاختبارات التفاعلية وسجل النتائج';
        recordsCount = questions.length + attempts.length;
        fileName = `UMEDT_Tests_And_Results_${questions.length}Q.${effectiveFormat}`;
        content =
          effectiveFormat === 'csv'
            ? buildQuestionsAndResultsCsvContent(questions, attempts)
            : JSON.stringify(
                {
                  exportType: 'UMEDT_QUIZ_BANK_AND_RESULTS',
                  exportedAt: new Date().toISOString(),
                  counts: {
                    questions: questions.length,
                    attempts: attempts.length
                  },
                  questions,
                  attempts
                },
                null,
                2
              );
      }

      const result = await executeVerifiedExportDownload({
        fileName,
        content,
        format: effectiveFormat,
        recordsCount,
        deliveryMode,
        titleAr
      });

      setLastExportResult(result);
      showToast(result.messageAr, result.success ? 'success' : 'info');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-6 space-y-5 shadow-2xl"
      >
        <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto sm:hidden" />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              مركز التنزيل والتصدير المخصص (Android & Web)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              صدّر أي جزء من المحتوى بشكل مستقل بصيغة JSON أو CSV مع التحقق الفعلي من تكوين الملف
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
            1. اختر نطاق المحتوى المراد تنزيله:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
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
                  key: 'single_topic',
                  labelAr: 'موضوع واحد كامل مع وسائطه وأسئلته',
                  sub: 'حزمة موضوع مستقلة · JSON'
                },
                {
                  key: 'complete_subject',
                  labelAr: 'مادة دراسية كاملة (Subject)',
                  sub: 'المواضيع + المصطلحات + الأسئلة · JSON'
                },
                {
                  key: 'complete_block',
                  labelAr: 'بلوك طبي كامل (Block)',
                  sub: 'المواد + المواضيع + المصطلحات + الأسئلة · JSON'
                },
                {
                  key: 'tests_and_results',
                  labelAr: 'بنك الاختبارات ونتائج المحاولات',
                  sub: `${questions.length} سؤال · ${attempts.length} نتيجة · JSON / CSV`
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
              اختر الموضوع المطلوب تنزيله:
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

        {/* 3. Format Selector (JSON vs CSV) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            2. صيغة الملف:
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFormat('json')}
              className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                effectiveFormat === 'json'
                  ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
              }`}
            >
              <FileJson className="w-4 h-4" />
              <span>JSON (حفظ واستعادة كاملة)</span>
            </button>
            <button
              type="button"
              disabled={!supportsCsv}
              onClick={() => setFormat('csv')}
              className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
                !supportsCsv
                  ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  : effectiveFormat === 'csv'
                    ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>CSV (جداول Excel للمصطلحات والنتائج)</span>
            </button>
          </div>
        </div>

        {/* 4. Action Buttons (Direct Download + Native Android Share) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => void handleRunExport('download')}
            className="min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل مباشر إلى الجهاز ({effectiveFormat.toUpperCase()})</span>
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => void handleRunExport('share')}
            className="min-h-[48px] px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>مشاركة وحفظ الملف على أندرويد</span>
          </button>
        </div>

        {/* Verified Export Status Banner */}
        {lastExportResult && (
          <div
            className={`p-3.5 rounded-2xl border flex items-start gap-2.5 text-xs ${
              lastExportResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
            }`}
          >
            {lastExportResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <p className="font-bold">{lastExportResult.messageAr}</p>
              {lastExportResult.success && (
                <p className="text-[11px] opacity-80 font-mono tabular-nums" dir="ltr">
                  {lastExportResult.fileName} · {lastExportResult.recordsCount} records ·{' '}
                  {Math.max(1, Math.round(lastExportResult.byteSize / 1024))} KB
                </p>
              )}
            </div>
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
