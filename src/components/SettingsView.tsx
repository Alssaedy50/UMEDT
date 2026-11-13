import React, { useRef, useState } from 'react';
import {
  Sun,
  Moon,
  Wifi,
  WifiOff,
  FolderSync,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  ChevronLeft,
  Share2,
  CloudDownload,
  RefreshCw,
  Smartphone,
  Copy,
  Check,
  Layers,
  X,
  Send
} from 'lucide-react';
import {
  DataBackupRecord,
  VersionMetadata,
  OnlineUpdateConfig,
  OnlineUpdateStatus
} from '../types/lexicon';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import {
  TelegramBackupConfig,
  TelegramBackupSchedule,
  ConciseDataSummary,
  SCHEDULE_LABELS_AR,
  testTelegramConnection
} from '../services/telegramBackupService';

interface SettingsViewProps {
  isDark: boolean;
  onToggleDark: (nextDark: boolean) => void;
  conflictPolicy: 'ignore' | 'overwrite' | 'merge';
  onChangeConflictPolicy: (nextPolicy: 'ignore' | 'overwrite' | 'merge') => void;
  simulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  recentTermsCount: number;
  onClearRecentTerms: () => void;
  dbMetrics: {
    totalTerms: number;
    localLoadedTerms: number;
    totalSentences: number;
    totalTopics?: number;
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
  telegramConfig?: TelegramBackupConfig;
  onUpdateTelegramConfig?: (nextConfig: TelegramBackupConfig) => void;
  onTriggerTelegramBackupNow?: () => Promise<{
    ok: boolean;
    message: string;
    summary?: ConciseDataSummary;
  }>;
  currentDataSummary?: ConciseDataSummary;
  lastImportedOrCopiedSummary?: ConciseDataSummary | null;
}

type SettingsModalType = null | 'conflict' | 'updates' | 'backup' | 'telegram' | 'reset';

const CONFLICT_LABELS: Record<'merge' | 'overwrite' | 'ignore', string> = {
  merge: 'دمج',
  overwrite: 'استبدال',
  ignore: 'تجاهل'
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDark,
  onToggleDark,
  conflictPolicy,
  onChangeConflictPolicy,
  simulatedOffline,
  onToggleSimulatedOffline,
  recentTermsCount,
  onClearRecentTerms,
  dbMetrics,
  versionMetadata,
  onlineUpdateConfig,
  onlineUpdateStatus,
  onUpdateOnlineConfig,
  onCheckForUpdates,
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
  telegramConfig,
  onUpdateTelegramConfig,
  onTriggerTelegramBackupNow,
  currentDataSummary,
  lastImportedOrCopiedSummary
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeModal, setActiveModal] = useState<SettingsModalType>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const { isInstallable, isCapacitorNative, install } = usePWAInstall();
  const browserOnline = useOnlineStatus();
  const effectiveOnline = browserOnline && !simulatedOffline;

  const shareableAppUrl =
    typeof window !== 'undefined'
      ? window.location.origin.replace('//ais-dev-', '//ais-pre-')
      : '';

  const handleCopyAppUrl = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareableAppUrl);
      } else {
        const area = document.createElement('textarea');
        area.value = shareableAppUrl;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // ignore
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportPackageFile(file);
    e.target.value = '';
    setActiveModal(null);
  };

  const handleTestTelegram = async () => {
    if (!telegramConfig) return;
    setIsTestingTelegram(true);
    setTelegramFeedback(null);
    const res = await testTelegramConnection(
      telegramConfig.botToken,
      telegramConfig.chatId
    );
    setTelegramFeedback(res);
    setIsTestingTelegram(false);
  };

  const handleSendTelegramNow = async () => {
    if (!onTriggerTelegramBackupNow) return;
    setIsSendingTelegram(true);
    setTelegramFeedback(null);
    const res = await onTriggerTelegramBackupNow();
    setTelegramFeedback({ ok: res.ok, message: res.message });
    setIsSendingTelegram(false);
  };

  const isBusyUpdating =
    onlineUpdateStatus.phase === 'checking' ||
    onlineUpdateStatus.phase === 'downloading' ||
    onlineUpdateStatus.phase === 'verifying' ||
    onlineUpdateStatus.phase === 'installing';

  const summaryToShow =
    lastImportedOrCopiedSummary ||
    telegramConfig?.lastBackupSummary ||
    currentDataSummary;

  return (
    <div className="max-w-lg mx-auto w-full pb-6 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,.json,.umedpack,.csv,.txt"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Concise Data Definition Strip (تعريف البيانات الحالية أو المستوردة باختصار) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
            {summaryToShow?.sourceLabel || 'تعريف بيانات التطبيق الحالية'}
          </div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5 truncate">
            {summaryToShow
              ? summaryToShow.shortText
              : `${dbMetrics.totalTerms} مصطلح · ${dbMetrics.totalTopics || 0} موضوع · ${dbMetrics.totalSentences} جملة`}
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
          {summaryToShow ? `${summaryToShow.sizeKB} KB` : `${dbMetrics.actualSizeKb} KB`}
        </span>
      </div>

      {/* Single Compact List Card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
        {/* 1. Theme */}
        <div className="px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            {isDark ? (
              <Moon className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span>المظهر</span>
          </div>

          <button
            type="button"
            onClick={() => onToggleDark(!isDark)}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors"
          >
            {isDark ? 'ليلي' : 'نهاري'}
          </button>
        </div>

        {/* 2. Connection Mode */}
        <div className="px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            {effectiveOnline ? (
              <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span>وضع الاتصال</span>
          </div>

          <button
            type="button"
            onClick={onToggleSimulatedOffline}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              effectiveOnline
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }`}
          >
            {effectiveOnline ? 'متصل' : 'دون إنترنت'}
          </button>
        </div>

        {/* 3. Telegram Backup & Periodic Schedule (Opens Modal) */}
        <button
          type="button"
          onClick={() => {
            setTelegramFeedback(null);
            setActiveModal('telegram');
          }}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Send className="w-4 h-4 text-sky-500 shrink-0" />
            <span>النسخ الاحتياطي إلى تليجرام</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span
              className={
                telegramConfig?.enabled && telegramConfig?.botToken
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ''
              }
            >
              {telegramConfig?.enabled && telegramConfig?.botToken
                ? SCHEDULE_LABELS_AR[telegramConfig.schedule]
                : 'إعداد'}
            </span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>

        {/* 4. Backup & Restore Offline (Opens Modal) */}
        <button
          type="button"
          onClick={() => setActiveModal('backup')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <FolderSync className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>النسخ الاحتياطي والاستعادة أوفلاين</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{backupHistory.length} نقطة</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>

        {/* 5. Duplicate Policy (Opens Modal) */}
        <button
          type="button"
          onClick={() => setActiveModal('conflict')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Layers className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>تكرار المصطلحات</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{CONFLICT_LABELS[conflictPolicy]}</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>

        {/* 6. Cloud Updates (Opens Modal) */}
        <button
          type="button"
          onClick={() => setActiveModal('updates')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <CloudDownload className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>التحديثات</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span dir="ltr">{versionMetadata.dataVersion}</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>

        {/* 7. Search History */}
        <div className="px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Trash2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span>سجل البحث</span>
          </div>

          <button
            type="button"
            disabled={recentTermsCount === 0}
            onClick={onClearRecentTerms}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors"
          >
            مسح ({recentTermsCount})
          </button>
        </div>

        {/* 8. App Install / Link */}
        {!isCapacitorNative && (
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
              <Smartphone className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>تثبيت التطبيق</span>
            </div>

            <div className="flex items-center gap-1.5">
              {isInstallable && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-bold"
                >
                  تثبيت
                </button>
              )}
              <button
                type="button"
                onClick={handleCopyAppUrl}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>تم</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>الرابط</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* 9. Factory Reset (Opens Modal) */}
        <button
          type="button"
          onClick={() => setActiveModal('reset')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-rose-500/5 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-rose-600 dark:text-rose-400">
            <RotateCcw className="w-4 h-4 shrink-0" />
            <span>إعادة الضبط</span>
          </div>

          <ChevronLeft className="w-4 h-4 text-rose-400" />
        </button>
      </div>

      {/* ====================================================================
          POP-UP MODALS FOR MULTI-OPTION SETTINGS
         ==================================================================== */}
      {activeModal && (
        <div
          onClick={() => setActiveModal(null)}
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl max-h-[86dvh] overflow-y-auto"
          >
            {/* Modal 0: Telegram Backup & Periodic Schedule */}
            {activeModal === 'telegram' && telegramConfig && onUpdateTelegramConfig && (
              <>
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-sky-500" />
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      النسخ الاحتياطي إلى تليجرام
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Concise Data Summary Box */}
                {currentDataSummary && (
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold text-emerald-600 dark:text-emerald-400">
                      <span>تعريف البيانات المشمولة بالنسخ:</span>
                      <span className="font-mono">{currentDataSummary.sizeKB} KB</span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-bold">
                      {currentDataSummary.shortText} · المفضلة: {currentDataSummary.favoritesCount}
                    </div>
                    {telegramConfig.lastBackupAt && (
                      <div className="text-[11px] text-slate-400">
                        آخر نسخ لتليجرام: {new Date(telegramConfig.lastBackupAt).toLocaleString('ar-SA')}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      رمز البوت (Telegram Bot Token) *
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={telegramConfig.botToken}
                      onChange={(e) =>
                        onUpdateTelegramConfig({
                          ...telegramConfig,
                          botToken: e.target.value
                        })
                      }
                      placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-left focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      معرف المحادثة أو القناة (Chat ID) *
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={telegramConfig.chatId}
                      onChange={(e) =>
                        onUpdateTelegramConfig({
                          ...telegramConfig,
                          chatId: e.target.value
                        })
                      }
                      placeholder="e.g., 987654321 or -100123456789"
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-left focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Periodic Schedule Selector */}
                  <div className="space-y-1.5">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      جدولة النسخ الاحتياطي الدوري:
                    </label>
                    <select
                      value={telegramConfig.schedule}
                      onChange={(e) => {
                        const nextSched = e.target.value as TelegramBackupSchedule;
                        onUpdateTelegramConfig({
                          ...telegramConfig,
                          schedule: nextSched,
                          enabled: nextSched !== 'off'
                        });
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold"
                    >
                      {(Object.keys(SCHEDULE_LABELS_AR) as TelegramBackupSchedule[]).map(
                        (schedKey) => (
                          <option key={schedKey} value={schedKey}>
                            {SCHEDULE_LABELS_AR[schedKey]}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* Scope Checkboxes */}
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={telegramConfig.includeDictionaryAndTerms}
                        onChange={(e) =>
                          onUpdateTelegramConfig({
                            ...telegramConfig,
                            includeDictionaryAndTerms: e.target.checked
                          })
                        }
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span>تضمين المصطلحات والجمل والمفضلة</span>
                    </label>

                    <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={telegramConfig.includeTopicsAndHierarchy}
                        onChange={(e) =>
                          onUpdateTelegramConfig({
                            ...telegramConfig,
                            includeTopicsAndHierarchy: e.target.checked
                          })
                        }
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span>تضمين المواضيع والبلوكات والمواد والاختبارات</span>
                    </label>
                  </div>

                  {telegramFeedback && (
                    <div
                      className={`p-3 rounded-xl border font-bold ${
                        telegramFeedback.ok
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {telegramFeedback.message}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isTestingTelegram || isSendingTelegram}
                      onClick={() => void handleTestTelegram()}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isTestingTelegram ? 'animate-spin' : ''}`}
                      />
                      <span>فحص الاتصال</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSendingTelegram || isTestingTelegram}
                      onClick={() => void handleSendTelegramNow()}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingTelegram ? 'جاري الإرسال...' : 'نسخ الآن لتليجرام'}</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Modal 1: Conflict Policy */}
            {activeModal === 'conflict' && (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    تكرار المصطلحات عند الاستيراد
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {(['merge', 'overwrite', 'ignore'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        onChangeConflictPolicy(opt);
                        setActiveModal(null);
                      }}
                      className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between border ${
                        conflictPolicy === opt
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{CONFLICT_LABELS[opt]}</span>
                      {conflictPolicy === opt && (
                        <Check className="w-4 h-4 text-emerald-500" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Modal 2: Cloud Updates */}
            {activeModal === 'updates' && (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    التحديثات
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-slate-500 font-bold">الإصدار الحالي</span>
                    <span dir="ltr" className="font-mono font-extrabold">
                      {versionMetadata.dataVersion}
                    </span>
                  </div>

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
                    placeholder="Manifest URL (GitHub)"
                    className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-left focus:outline-none focus:border-emerald-500"
                  />

                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] text-slate-400">مستودع التحديثات:</span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateOnlineConfig({
                          ...onlineUpdateConfig,
                          manifestUrl:
                            'https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/manifest.json'
                        })
                      }
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                    >
                      تعيين الرابط الرسمي لـ UMEDT
                    </button>
                  </div>

                  {onlineUpdateStatus.message && (
                    <div
                      className={`p-3 rounded-2xl border text-xs space-y-2 transition-all ${
                        onlineUpdateStatus.phase === 'completed'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                          : onlineUpdateStatus.phase === 'error' ||
                            onlineUpdateStatus.phase === 'incompatible'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
                          : onlineUpdateStatus.phase === 'update-available'
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300'
                          : isBusyUpdating
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-bold">
                          {isBusyUpdating && (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
                          )}
                          {onlineUpdateStatus.phase === 'completed' && (
                            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )}
                          <span className="leading-snug">{onlineUpdateStatus.message}</span>
                        </div>
                        {onlineUpdateStatus.progressPercent !== null && (
                          <span className="font-mono text-[11px] font-extrabold shrink-0">
                            {onlineUpdateStatus.progressPercent}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isBusyUpdating}
                      onClick={() => void onCheckForUpdates({ forceInstall: false })}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isBusyUpdating ? 'animate-spin' : ''}`}
                      />
                      <span>فحص</span>
                    </button>

                    <button
                      type="button"
                      disabled={!onlineUpdateConfig.manifestUrl.trim() || isBusyUpdating}
                      onClick={() => void onCheckForUpdates({ forceInstall: true })}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <CloudDownload className="w-3.5 h-3.5" />
                      <span>تثبيت التحديث</span>
                    </button>
                  </div>

                  {backupHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void onRollbackToPreviousVersion()}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                      <span>تراجع للإصدار السابق</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Modal 3: Backup & Restore Offline */}
            {activeModal === 'backup' && (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                    النسخ الاحتياطي والاستعادة أوفلاين
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Concise Data Summary inside Backup Modal */}
                {currentDataSummary && (
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold text-emerald-600 dark:text-emerald-400">
                      <span>تعريف البيانات الحالية:</span>
                      <span className="font-mono">{currentDataSummary.sizeKB} KB</span>
                    </div>
                    <div className="text-slate-700 dark:text-slate-300 font-bold">
                      {currentDataSummary.shortText}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onExportBackup();
                      setActiveModal(null);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onExportZipPackage();
                      setActiveModal(null);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير ZIP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-500" />
                    <span>استيراد بيانات أوفلاين</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onShareDataFile();
                      setActiveModal(null);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>مشاركة النسخة</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      نقاط الاستعادة المحفوظة محلياً ({backupHistory.length})
                    </span>
                    <button
                      type="button"
                      onClick={onCreateManualBackup}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
                    >
                      + حفظ نقطة الآن
                    </button>
                  </div>

                  {backupHistory.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {backupHistory.map((item) => {
                        const formattedDate = (() => {
                          try {
                            return new Date(item.createdAt).toLocaleString('ar-EG', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          } catch {
                            return '';
                          }
                        })();
                        const termCount =
                          item.manifest?.counts?.terms ?? item.payload?.terms?.length ?? 0;
                        const topicCount =
                          item.manifest?.counts?.topics ?? item.payload?.topics?.length ?? 0;
                        const sentCount =
                          item.manifest?.counts?.sentences ??
                          item.payload?.sentences?.length ??
                          0;
                        const triggerBadge =
                          item.trigger === 'manual' ? 'يدوي' : 'تلقائي';

                        return (
                          <div
                            key={item.backupId}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span
                                  dir="ltr"
                                  className="font-mono font-extrabold text-slate-900 dark:text-white truncate"
                                >
                                  {item.versionMetadata.dataVersion}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold shrink-0">
                                  {triggerBadge}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5 truncate">
                                <span>
                                  {termCount} مصطلح · {topicCount} موضوع · {sentCount} جملة
                                </span>
                                {formattedDate && (
                                  <>
                                    <span>·</span>
                                    <span>{formattedDate}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onRestoreBackupById(item.backupId);
                                  setActiveModal(null);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-bold"
                              >
                                استعادة
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteBackupById(item.backupId)}
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10"
                                title="حذف نقطة الاستعادة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Modal 4: Reset Confirmation */}
            {activeModal === 'reset' && (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm font-extrabold text-rose-600 dark:text-rose-400">
                    إعادة الضبط للمصنع
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onResetDefaults();
                      setActiveModal(null);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-600 text-white font-extrabold"
                  >
                    تأكيد الضبط
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold"
                  >
                    إلغاء
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
