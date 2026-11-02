import React, { useMemo, useRef, useState } from 'react';
import {
  Star,
  Brain,
  Volume2,
  FolderSync,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  ChevronDown,
  BookOpen,
  FileText,
  Database,
  Layers,
  Share2,
  History,
  KeyRound,
  Check,
  CloudDownload,
  RefreshCw,
  ShieldCheck,
  Lock,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import {
  DictionaryTerm,
  LinkedSentence,
  SpacedRepetitionData,
  TopicArticle,
  DataBackupRecord,
  VersionMetadata,
  OnlineUpdateConfig,
  OnlineUpdateStatus
} from '../types/lexicon';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../services/dataPlatformService';
import { isTrustedPublicKeyLockedByBuild } from '../services/storageService';

interface LibraryViewProps {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
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
  dbMetrics: {
    totalTerms: number;
    localLoadedTerms: number;
    totalSentences: number;
    totalGraphEdges: number;
    actualSizeKb: number;
  };
  versionMetadata: VersionMetadata;
  onlineUpdateConfig: OnlineUpdateConfig;
  onlineUpdateStatus: OnlineUpdateStatus;
  onUpdateOnlineConfig: (nextConfig: OnlineUpdateConfig) => void;
  onCheckForUpdates: (options?: { isStartup?: boolean; forceInstall?: boolean }) => Promise<void>;
  onRunLiveServerOtaTest: () => Promise<void>;
  onRollbackToPreviousVersion: () => Promise<void>;
  backupHistory: DataBackupRecord[];
  onCreateManualBackup: () => void;
  onRestoreBackupById: (backupId: string) => void;
  onDeleteBackupById: (backupId: string) => void;
  onExportBackup: () => void;
  onExportZipPackage: () => void;
  onImportPackageFile: (file: File) => void;
  onShareDataFile: () => void;
  onResetDefaults: () => void;
  lastBackupTime: string;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  terms,
  sentences,
  topics,
  activeCollection,
  onOpenCollectionsMenu,
  onRecordSm2Review,
  onOpenTermDetail,
  onToggleFavoriteTerm,
  onToggleFavoriteSentence,
  onTriggerTTS,
  dbMetrics,
  versionMetadata,
  onlineUpdateConfig,
  onlineUpdateStatus,
  onUpdateOnlineConfig,
  onCheckForUpdates,
  onRunLiveServerOtaTest,
  onRollbackToPreviousVersion,
  backupHistory,
  onCreateManualBackup,
  onRestoreBackupById,
  onDeleteBackupById,
  onExportBackup,
  onExportZipPackage,
  onImportPackageFile,
  onShareDataFile,
  onResetDefaults,
  lastBackupTime
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [favoritesTab, setFavoritesTab] = useState<'terms' | 'sentences'>('terms');
  const [flashcardIdx, setFlashcardIdx] = useState<number>(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState<boolean>(false);
  const [showOtaConfigPanel, setShowOtaConfigPanel] = useState<boolean>(false);
  const [isRunningLiveOtaTest, setIsRunningLiveOtaTest] = useState<boolean>(false);

  const publicKeyLockedByBuild = isTrustedPublicKeyLockedByBuild();

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportPackageFile(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full overflow-x-clip box-border">
      {/* ====================================================================
          1. CLEAN 4-METRIC SUMMARY GRID (Terms, Sentences, Topics, Size KB)
         ==================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              المصطلحات
            </span>
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {terms.length.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              الجمل السياقية
            </span>
            <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {sentences.length.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              المواضيع
            </span>
            <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
            {topics.length.toLocaleString()}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs flex flex-col justify-between gap-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              حجم التخزين
            </span>
            <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span
            dir="ltr"
            className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums text-right"
          >
            {dbMetrics.actualSizeKb.toLocaleString()} KB
          </span>
        </div>
      </div>

      {/* ====================================================================
          1.5 STAGE 5 & STAGE 7: CLOUD DATA OTA STATUS, CHECK & DOWNLOAD
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CloudDownload className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                التحديث السحابي للبيانات الطبية (Cloud Data OTA)
              </h2>
              <span
                dir="ltr"
                className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[11px] font-mono font-bold"
              >
                APK v{APP_VERSION} · Schema v{DB_SCHEMA_VERSION}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              فحص وتنزيل حزم البيانات الطبية الموقعة رقمياً (ECDSA-P256-SHA256) دون الحاجة لإعادة تثبيت التطبيق
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowOtaConfigPanel((prev) => !prev)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
          >
            <span>إعدادات مستودع التحديث</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${
                showOtaConfigPanel ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Version & Live Status Bar */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-500 font-semibold">إصدار البيانات المثبت:</span>
              <span
                dir="ltr"
                className="font-mono font-extrabold text-slate-900 dark:text-white"
              >
                {versionMetadata.dataVersion}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-500 font-semibold">الإصدار السحابي المتاح:</span>
              <span
                dir="ltr"
                className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400"
              >
                {onlineUpdateStatus.availableDataVersion || '—'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-500 font-semibold">حالة التحديث:</span>
              <span
                className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                  onlineUpdateStatus.phase === 'update-available'
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : onlineUpdateStatus.phase === 'completed' ||
                        onlineUpdateStatus.phase === 'up-to-date'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : onlineUpdateStatus.phase === 'error' ||
                          onlineUpdateStatus.phase === 'incompatible'
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {onlineUpdateStatus.phase === 'idle' && 'جاهز للفحص'}
                {onlineUpdateStatus.phase === 'unconfigured' && 'محلي (غير مرتبط بمستودع)'}
                {onlineUpdateStatus.phase === 'checking' && 'جاري فحص المستودع...'}
                {onlineUpdateStatus.phase === 'update-available' && 'تحديث جديد متاح'}
                {onlineUpdateStatus.phase === 'downloading' && 'جاري التنزيل...'}
                {onlineUpdateStatus.phase === 'verifying' && 'جاري التحقق الرقمي...'}
                {onlineUpdateStatus.phase === 'installing' && 'جاري التثبيت الذري...'}
                {onlineUpdateStatus.phase === 'completed' && 'اكتمل التحديث بنجاح'}
                {onlineUpdateStatus.phase === 'up-to-date' && 'محدّث لآخر إصدار'}
                {onlineUpdateStatus.phase === 'incompatible' && 'إصدار غير متوافق'}
                {onlineUpdateStatus.phase === 'offline' && 'وضع عدم الاتصال (Offline)'}
                {onlineUpdateStatus.phase === 'error' && 'تنبيه في التحديث'}
              </span>
            </div>
          </div>

          <div className="flex items-start justify-between gap-2 flex-wrap text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
              {onlineUpdateStatus.phase === 'error' ||
              onlineUpdateStatus.phase === 'incompatible' ? (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <span>{onlineUpdateStatus.message}</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {onlineUpdateStatus.checksumVerified && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold">
                  SHA-256 ✓
                </span>
              )}
              {onlineUpdateStatus.signatureVerified && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold">
                  ECDSA-P256 ✓
                </span>
              )}
            </div>
          </div>

          {typeof onlineUpdateStatus.progressPercent === 'number' && (
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{
                  width: `${Math.min(100, Math.max(5, onlineUpdateStatus.progressPercent))}%`
                }}
              />
            </div>
          )}
        </div>

        {/* Action Buttons: Check, Download & Install, Live Server OTA Test, Rollback */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            disabled={
              onlineUpdateStatus.phase === 'checking' ||
              onlineUpdateStatus.phase === 'downloading' ||
              onlineUpdateStatus.phase === 'verifying' ||
              onlineUpdateStatus.phase === 'installing'
            }
            onClick={() => void onCheckForUpdates({ forceInstall: false })}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 shrink-0 ${
                onlineUpdateStatus.phase === 'checking' ? 'animate-spin' : ''
              }`}
            />
            <span>فحص التحديثات الآن</span>
          </button>

          <button
            type="button"
            disabled={
              !onlineUpdateConfig.manifestUrl.trim() ||
              onlineUpdateStatus.phase === 'checking' ||
              onlineUpdateStatus.phase === 'downloading' ||
              onlineUpdateStatus.phase === 'verifying' ||
              onlineUpdateStatus.phase === 'installing'
            }
            onClick={() => void onCheckForUpdates({ forceInstall: true })}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <CloudDownload className="w-4 h-4 shrink-0" />
            <span>تنزيل وتثبيت التحديث</span>
          </button>

          <button
            type="button"
            disabled={isRunningLiveOtaTest}
            onClick={async () => {
              setIsRunningLiveOtaTest(true);
              try {
                await onRunLiveServerOtaTest();
              } finally {
                setIsRunningLiveOtaTest(false);
              }
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              {isRunningLiveOtaTest
                ? 'جاري الاختبار الحي...'
                : 'اختبار محلي تجريبي (Dev OTA)'}
            </span>
          </button>

          <button
            type="button"
            disabled={backupHistory.length === 0}
            onClick={() => void onRollbackToPreviousVersion()}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <RotateCcw className="w-4 h-4 shrink-0 text-amber-500" />
            <span>التراجع للإصدار السابق</span>
          </button>
        </div>

        {/* Collapsible Repository & Public Key Configuration */}
        {showOtaConfigPanel && (
          <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>منظومة التحديث السحابي الإنتاجية (Cloudflare R2 Production OTA):</span>
              </div>
              <p>
                يتم تنزيل حزم البيانات الطبية مباشرة عبر HTTPS من مستودع Cloudflare R2 العام دون الحاجة إلى خادم Node.js محلي أو إعادة بناء ملف APK. الحزم غير قابلة للتعديل (Immutable) وموقعة رقمياً بمفتاح ECDSA-P256 الدائم.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  رابط ملف البيان السحابي (Manifest URL — Cloudflare R2 / CDN)
                </label>
                <input
                  type="url"
                  dir="ltr"
                  value={onlineUpdateConfig.manifestUrl}
                  onChange={(e) =>
                    onUpdateOnlineConfig({
                      ...onlineUpdateConfig,
                      manifestUrl: e.target.value
                    })
                  }
                  placeholder="https://data.umed2.org/stable/manifest.json"
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-left focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  قناة الإصدار (Channel)
                </label>
                <select
                  value={onlineUpdateConfig.channel || 'stable'}
                  onChange={(e) =>
                    onUpdateOnlineConfig({
                      ...onlineUpdateConfig,
                      channel: e.target.value as 'stable' | 'beta'
                    })
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold focus:outline-none focus:border-emerald-500"
                >
                  <option value="stable">مستقرة (Stable — إنتاجية معتمدة)</option>
                  <option value="beta">تجريبية (Beta — إصدارات مبكرة)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                سياسة التحديث الهوائي (Auto-Update Policy)
              </label>
              <select
                value={onlineUpdateConfig.autoUpdatePolicy}
                onChange={(e) =>
                  onUpdateOnlineConfig({
                    ...onlineUpdateConfig,
                    autoUpdatePolicy: e.target.value as OnlineUpdateConfig['autoUpdatePolicy']
                  })
                }
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold focus:outline-none focus:border-emerald-500"
              >
                <option value="notify-only">
                  إشعار فقط مع التنزيل عند الطلب (Notify-Only — افتراضي آمن)
                </option>
                <option value="auto-install">
                  تنزيل وتثبيت ذري تلقائي عند توفر إصدار موقع (Auto-Install)
                </option>
                <option value="manual">فحص وتنزيل يدوي فقط (Manual)</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    المفتاح العام الموثوق للتحقق من التوقيع الرقمي (ECDSA-P256-SHA256 SPKI PEM)
                  </span>
                </label>
                {publicKeyLockedByBuild && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                    مقفل ومؤمّن من بناء التطبيق (VITE_UMED_PUBLIC_KEY_PEM)
                  </span>
                )}
              </div>
              <textarea
                rows={3}
                dir="ltr"
                readOnly={publicKeyLockedByBuild}
                value={onlineUpdateConfig.publicKeyPem}
                onChange={(e) => {
                  if (publicKeyLockedByBuild) return;
                  onUpdateOnlineConfig({
                    ...onlineUpdateConfig,
                    publicKeyPem: e.target.value,
                    requireSignature: Boolean(e.target.value.trim())
                  });
                }}
                placeholder="-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----"
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-left focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        )}
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

      {/* ====================================================================
          4. BACKUP EXPORT & RESTORE (JSON / ZIP + Local Snapshots)
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
              <FolderSync className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>النسخ الاحتياطي والاستعادة</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تصدير واستيراد بياناتك ومفضلتك بصيغة JSON أو حزمة ZIP، أو استعادتها من النقاط المحفوظة محلياً
            </p>
          </div>

          <span className="text-[11px] font-mono text-slate-400">
            آخر حفظ: {lastBackupTime}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.json"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={onExportBackup}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>تصدير نسخة JSON</span>
          </button>

          <button
            type="button"
            onClick={onExportZipPackage}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>تصدير حزمة ZIP</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>استعادة من ملف (JSON / ZIP)</span>
          </button>

          <button
            type="button"
            onClick={onShareDataFile}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Share2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>مشاركة ملف البيانات</span>
          </button>
        </div>

        {/* Local Restore Snapshots */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>نقاط الاستعادة المحفوظة ({backupHistory.length})</span>
            </span>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={onCreateManualBackup}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold"
              >
                + حفظ نقطة استعادة الآن
              </button>

              <button
                type="button"
                onClick={onResetDefaults}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>استعادة الضبط الافتراضي</span>
              </button>
            </div>
          </div>

          {backupHistory.length > 0 && (
            <div className="space-y-2">
              {backupHistory.map((item) => (
                <div
                  key={item.backupId}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {item.label || `نسخة ${item.versionMetadata.dataVersion}`}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(item.createdAt).toLocaleString('ar-SA')} ·{' '}
                      {item.manifest.counts.terms.toLocaleString()} مصطلح ·{' '}
                      {item.manifest.counts.sentences.toLocaleString()} جملة
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onRestoreBackupById(item.backupId)}
                      className="min-h-[34px] px-3 py-1 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-bold"
                    >
                      استعادة
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBackupById(item.backupId)}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      title="حذف النقطة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
