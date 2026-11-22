import React, { useEffect, useRef, useState } from 'react';
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
  RefreshCw,
  Smartphone,
  Copy,
  Check,
  Layers,
  X,
  Send,
  Type,
  Palette,
} from 'lucide-react';
import {
  DataBackupRecord,
  VersionMetadata,
  OnlineUpdateConfig,
  OnlineUpdateStatus,
  AppFontFamily,
  AppFontSizeScale,
  AppColorTheme
} from '../types/lexicon';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';
import { ImportGroupsPanel } from './ImportGroupsPanel';
import {
  TelegramBackupConfig,
  TelegramBackupSchedule,
  TelegramBackupMode,
  TelegramBackupFileFormat,
  ConciseDataSummary,
  SCHEDULE_LABELS_AR,
  BACKUP_MODE_LABELS_AR,
  loadTelegramBackupConfig,
  saveTelegramBackupConfig,
  testTelegramConnection,
  uploadPendingMediaToTelegramChannel
} from '../services/telegramBackupService';
import {
  LocalDownloadRecord,
  verifyLocalStoragePersistence,
  getDownloadedFilesHistory,
  openSavedDownloadFile,
  shareSavedDownloadFile
} from '../utils/downloadHelper';

interface SettingsViewProps {
  isDark: boolean;
  onToggleDark: (nextDark: boolean) => void;
  fontFamily: AppFontFamily;
  onChangeFontFamily: (next: AppFontFamily) => void;
  fontSizeScale: AppFontSizeScale;
  onChangeFontSizeScale: (next: AppFontSizeScale) => void;
  fontScalePercent?: number;
  onChangeFontScalePercent?: (nextPercent: number) => void;
  colorTheme: AppColorTheme;
  onChangeColorTheme: (next: AppColorTheme) => void;
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
  onTriggerTelegramBackupNow?: (overrideConfig?: TelegramBackupConfig) => Promise<{
    ok: boolean;
    message: string;
    summary?: ConciseDataSummary;
  }>;
  onRestoreFromTelegramNow?: (overrideConfig?: TelegramBackupConfig) => Promise<{
    ok: boolean;
    message: string;
  }>;
  currentDataSummary?: ConciseDataSummary;
  lastImportedOrCopiedSummary?: ConciseDataSummary | null;
}

type SettingsModalType =
  | null
  | 'typography'
  | 'theme'
  | 'conflict'
  | 'backup'
  | 'telegram'
  | 'reset';

const FONT_FAMILY_OPTIONS: Array<{
  id: AppFontFamily;
  label: string;
  preview: string;
  cssFamily: string;
}> = [
  {
    id: 'cairo',
    label: 'Cairo',
    preview: 'خط القاهرة الطبي',
    cssFamily: "'Cairo', 'Inter', system-ui, sans-serif"
  },
  {
    id: 'tajawal',
    label: 'Tajawal',
    preview: 'خط تجوال الحديث',
    cssFamily: "'Tajawal', 'Cairo', system-ui, sans-serif"
  },
  {
    id: 'ibm',
    label: 'IBM Plex',
    preview: 'خط أكاديمي هندسي',
    cssFamily: "'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif"
  },
  {
    id: 'almarai',
    label: 'Almarai',
    preview: 'خط المراعي الواضح',
    cssFamily: "'Almarai', 'Cairo', system-ui, sans-serif"
  },
  {
    id: 'readex',
    label: 'Readex Pro',
    preview: 'خط القراءة السريعة',
    cssFamily: "'Readex Pro', 'Inter', system-ui, sans-serif"
  },
  {
    id: 'kufi',
    label: 'Noto Kufi',
    preview: 'خط نوتو الكوفي',
    cssFamily: "'Noto Kufi Arabic', 'Inter', system-ui, sans-serif"
  },
  {
    id: 'changa',
    label: 'Changa',
    preview: 'خط تشانجا العريض',
    cssFamily: "'Changa', 'Cairo', system-ui, sans-serif"
  },
  {
    id: 'amiri',
    label: 'Amiri',
    preview: 'خط أميري الكلاسيكي',
    cssFamily: "'Amiri', Georgia, serif"
  },
  {
    id: 'system',
    label: 'النظام',
    preview: 'خط الجهاز الافتراضي',
    cssFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  }
];

const FONT_SIZE_OPTIONS: Array<{
  id: AppFontSizeScale;
  label: string;
  percent: number;
  pxLabel: string;
}> = [
  { id: 'auto', label: 'تلقائي', percent: 85, pxLabel: 'خط الهاتف' },
  { id: 'sm', label: 'صغير', percent: 75, pxLabel: '75%' },
  { id: 'md', label: 'متوسط', percent: 85, pxLabel: '85%' },
  { id: 'lg', label: 'مريح', percent: 95, pxLabel: '95%' },
  { id: 'xl', label: 'كامل', percent: 100, pxLabel: '100%' }
];

const COLOR_THEME_OPTIONS: Array<{
  id: AppColorTheme;
  label: string;
  swatchClass: string;
  surfacePreviewClass: string;
}> = [
  {
    id: 'emerald',
    label: 'زمردي',
    swatchClass: 'bg-emerald-500',
    surfacePreviewClass: 'bg-[#0c211b] border-emerald-500/40'
  },
  {
    id: 'blue',
    label: 'أزرق',
    swatchClass: 'bg-blue-500',
    surfacePreviewClass: 'bg-[#0b192e] border-blue-500/40'
  },
  {
    id: 'indigo',
    label: 'نيلي',
    swatchClass: 'bg-indigo-500',
    surfacePreviewClass: 'bg-[#12132e] border-indigo-500/40'
  },
  {
    id: 'teal',
    label: 'تركوازي',
    swatchClass: 'bg-teal-500',
    surfacePreviewClass: 'bg-[#0a2124] border-teal-500/40'
  },
  {
    id: 'violet',
    label: 'بنفسجي',
    swatchClass: 'bg-violet-500',
    surfacePreviewClass: 'bg-[#1a112e] border-violet-500/40'
  },
  {
    id: 'amber',
    label: 'كهرماني',
    swatchClass: 'bg-amber-500',
    surfacePreviewClass: 'bg-[#241a0b] border-amber-500/40'
  },
  {
    id: 'rose',
    label: 'وردي',
    swatchClass: 'bg-rose-500',
    surfacePreviewClass: 'bg-[#260e16] border-rose-500/40'
  }
];

const CONFLICT_LABELS: Record<'merge' | 'overwrite' | 'ignore', string> = {
  merge: 'دمج',
  overwrite: 'استبدال',
  ignore: 'تجاهل'
};

export const SettingsView: React.FC<SettingsViewProps> = ({
  isDark,
  onToggleDark,
  fontFamily,
  onChangeFontFamily,
  fontSizeScale,
  onChangeFontSizeScale,
  fontScalePercent,
  onChangeFontScalePercent,
  colorTheme,
  onChangeColorTheme,
  conflictPolicy,
  onChangeConflictPolicy,
  simulatedOffline,
  onToggleSimulatedOffline,
  recentTermsCount,
  onClearRecentTerms,
  dbMetrics,
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
  onRestoreFromTelegramNow,
  currentDataSummary,
  lastImportedOrCopiedSummary
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const botTokenInputRef = useRef<HTMLInputElement | null>(null);
  const chatIdInputRef = useRef<HTMLInputElement | null>(null);
  const [activeModal, setActiveModal] = useState<SettingsModalType>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState<boolean>(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);
  const [isSyncingTelegramMedia, setIsSyncingTelegramMedia] = useState<boolean>(false);
  const [isRestoringTelegram, setIsRestoringTelegram] = useState<boolean>(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const [draftBotToken, setDraftBotToken] = useState<string>(
    () => telegramConfig?.botToken || loadTelegramBackupConfig().botToken || ''
  );
  const [draftChatId, setDraftChatId] = useState<string>(
    () => telegramConfig?.chatId || loadTelegramBackupConfig().chatId || ''
  );
  const [showBotTokenPlain, setShowBotTokenPlain] = useState<boolean>(false);
  const [localVerifyFeedback, setLocalVerifyFeedback] = useState<string | null>(null);
  const [downloadedFilesList, setDownloadedFilesList] = useState<LocalDownloadRecord[]>(
    () => getDownloadedFilesHistory()
  );
  const [previewDownloadedFile, setPreviewDownloadedFile] =
    useState<LocalDownloadRecord | null>(null);

  const isAutoFontScale = fontSizeScale === 'auto';
  const effectiveScalePercent = Math.max(
    75,
    Math.min(
      100,
      typeof fontScalePercent === 'number'
        ? fontScalePercent
        : FONT_SIZE_OPTIONS.find((s) => s.id === fontSizeScale)?.percent || 85
    )
  );

  const applyDynamicScalePercent = (nextPct: number) => {
    const clamped = Math.max(75, Math.min(100, Math.round(nextPct)));
    onChangeFontScalePercent?.(clamped);
    if (clamped <= 78) {
      onChangeFontSizeScale('sm');
    } else if (clamped <= 89) {
      onChangeFontSizeScale('md');
    } else if (clamped <= 97) {
      onChangeFontSizeScale('lg');
    } else {
      onChangeFontSizeScale('xl');
    }
  };

  useEffect(() => {
    const refreshDownloads = () => {
      setDownloadedFilesList(getDownloadedFilesHistory());
    };
    window.addEventListener('umed:download-recorded', refreshDownloads);
    return () => window.removeEventListener('umed:download-recorded', refreshDownloads);
  }, []);

  // Sync draft credentials from persisted config only if draft is empty and persisted has values
  useEffect(() => {
    const stored = loadTelegramBackupConfig();
    const incomingToken = telegramConfig?.botToken || stored.botToken || '';
    const incomingChatId = telegramConfig?.chatId || stored.chatId || '';
    if (incomingToken && !draftBotToken) {
      setDraftBotToken(incomingToken);
    }
    if (incomingChatId && !draftChatId) {
      setDraftChatId(incomingChatId);
    }
  }, [telegramConfig?.botToken, telegramConfig?.chatId, draftBotToken, draftChatId]);

  const syncAndPersistTelegramDraft = (overrides?: Partial<TelegramBackupConfig>): TelegramBackupConfig => {
    const stored = loadTelegramBackupConfig();
    const base = telegramConfig || stored;
    const liveToken =
      overrides?.botToken !== undefined
        ? overrides.botToken
        : botTokenInputRef.current?.value ?? draftBotToken ?? base.botToken ?? '';
    const liveChatId =
      overrides?.chatId !== undefined
        ? overrides.chatId
        : chatIdInputRef.current?.value ?? draftChatId ?? base.chatId ?? '';
    const nextSchedule = overrides?.schedule ?? base.schedule ?? 'daily';
    const hasCreds = Boolean(liveToken.trim() && liveChatId.trim());

    const nextCfg: TelegramBackupConfig = {
      ...stored,
      ...base,
      ...overrides,
      botToken: liveToken,
      chatId: liveChatId,
      schedule: nextSchedule,
      enabled:
        nextSchedule === 'off'
          ? false
          : hasCreds
          ? true
          : Boolean(overrides?.enabled ?? base.enabled)
    };

    const saved = saveTelegramBackupConfig(nextCfg);
    onUpdateTelegramConfig?.(saved);
    return saved;
  };

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
    const currentToken = (
      botTokenInputRef.current?.value ??
      draftBotToken ??
      telegramConfig?.botToken ??
      ''
    ).trim();
    const currentChatId = (
      chatIdInputRef.current?.value ??
      draftChatId ??
      telegramConfig?.chatId ??
      ''
    ).trim();

    setDraftBotToken(currentToken);
    setDraftChatId(currentChatId);
    const savedBeforeTest = syncAndPersistTelegramDraft({
      botToken: currentToken,
      chatId: currentChatId
    });

    setIsTestingTelegram(true);
    setTelegramFeedback(null);
    const res = await testTelegramConnection(
      savedBeforeTest.botToken,
      savedBeforeTest.chatId
    );
    syncAndPersistTelegramDraft({
      botToken: currentToken,
      chatId: currentChatId
    });
    setTelegramFeedback(res);
    setIsTestingTelegram(false);
  };

  const handleSendTelegramNow = async () => {
    if (!onTriggerTelegramBackupNow) return;
    const currentToken = (
      botTokenInputRef.current?.value ??
      draftBotToken ??
      telegramConfig?.botToken ??
      ''
    ).trim();
    const currentChatId = (
      chatIdInputRef.current?.value ??
      draftChatId ??
      telegramConfig?.chatId ??
      ''
    ).trim();

    setDraftBotToken(currentToken);
    setDraftChatId(currentChatId);
    const savedCfg = syncAndPersistTelegramDraft({
      botToken: currentToken,
      chatId: currentChatId
    });

    setIsSendingTelegram(true);
    setTelegramFeedback(null);
    const res = await onTriggerTelegramBackupNow(savedCfg);
    syncAndPersistTelegramDraft({
      botToken: currentToken,
      chatId: currentChatId
    });
    setTelegramFeedback({ ok: res.ok, message: res.message });
    setIsSendingTelegram(false);
  };

  const handleSyncTelegramMediaNow = async () => {
    const currentToken = (
      botTokenInputRef.current?.value ??
      draftBotToken ??
      telegramConfig?.botToken ??
      ''
    ).trim();
    const currentChatId = (
      chatIdInputRef.current?.value ??
      draftChatId ??
      telegramConfig?.chatId ??
      ''
    ).trim();

    setDraftBotToken(currentToken);
    setDraftChatId(currentChatId);
    const savedCfg = syncAndPersistTelegramDraft({
      botToken: currentToken,
      chatId: currentChatId
    });

    setIsSyncingTelegramMedia(true);
    setTelegramFeedback(null);
    const mediaRes = await uploadPendingMediaToTelegramChannel(savedCfg, {
      skipIfSimulatedOffline: simulatedOffline
    });
    const fresh = loadTelegramBackupConfig();
    onUpdateTelegramConfig?.(fresh);
    setTelegramFeedback({ ok: mediaRes.ok, message: mediaRes.message });
    setIsSyncingTelegramMedia(false);
  };

  const handleRestoreTelegramNow = async () => {
    if (!onRestoreFromTelegramNow) return;
    const currentToken = (
      botTokenInputRef.current?.value ??
      draftBotToken ??
      telegramConfig?.botToken ??
      ''
    ).trim();
    const currentChatId = (
      chatIdInputRef.current?.value ??
      draftChatId ??
      telegramConfig?.chatId ??
      ''
    ).trim();

    setDraftBotToken(currentToken);
    setDraftChatId(currentChatId);
    const savedCfg = syncAndPersistTelegramDraft({
      botToken: currentToken,
      chatId: currentChatId
    });

    setIsRestoringTelegram(true);
    setTelegramFeedback(null);
    try {
      const res = await onRestoreFromTelegramNow(savedCfg);
      setTelegramFeedback({ ok: res.ok, message: res.message });
    } finally {
      setIsRestoringTelegram(false);
    }
  };

  const summaryToShow =
    lastImportedOrCopiedSummary ||
    telegramConfig?.lastBackupSummary ||
    currentDataSummary;

  return (
    <div className="max-w-lg mx-auto w-full pb-6 space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.zip"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Concise Data Definition Strip */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
            البيانات المحلية
          </div>
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5 leading-relaxed break-words">
            {summaryToShow
              ? summaryToShow.shortText
              : `${dbMetrics.totalTerms} مصطلح · ${dbMetrics.totalTopics || 0} موضوع · ${dbMetrics.totalSentences} جملة`}
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-600 dark:text-slate-300 shrink-0">
          {summaryToShow ? `${summaryToShow.sizeKB} KB` : `${dbMetrics.actualSizeKb} KB`}
        </span>
      </div>

      <ImportGroupsPanel />

      {/* Single Compact List Card (1-2 Word Labels) */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
        {/* 1. Dark / Light Appearance */}
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

        {/* 1b. Font Family & Dynamic Font Size */}
        <button
          type="button"
          onClick={() => setActiveModal('typography')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Type className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>حجم الخط</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 min-w-0">
            <span className="truncate font-mono">
              {FONT_FAMILY_OPTIONS.find((f) => f.id === fontFamily)?.label || 'Cairo'} ·{' '}
              {isAutoFontScale ? 'تلقائي' : `${effectiveScalePercent}%`}
            </span>
            <ChevronLeft className="w-4 h-4 shrink-0" />
          </div>
        </button>

        {/* 1c. Color Theme */}
        <button
          type="button"
          onClick={() => setActiveModal('theme')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Palette className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>الألوان</span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${
                COLOR_THEME_OPTIONS.find((t) => t.id === colorTheme)?.swatchClass || 'bg-emerald-500'
              }`}
            />
            <span>
              {COLOR_THEME_OPTIONS.find((t) => t.id === colorTheme)?.label || 'زمردي'}
            </span>
            <ChevronLeft className="w-4 h-4 shrink-0" />
          </div>
        </button>

        {/* 2. Connection Mode */}
        <div className="px-4 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            {effectiveOnline ? (
              <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            <span>الاتصال</span>
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
            {effectiveOnline ? 'متصل' : 'أوفلاين'}
          </button>
        </div>

        {/* 3. Telegram Backup */}
        <button
          type="button"
          onClick={() => {
            setTelegramFeedback(null);
            const latestCfg = telegramConfig || loadTelegramBackupConfig();
            if (latestCfg.botToken && !draftBotToken) {
              setDraftBotToken(latestCfg.botToken);
            }
            if (latestCfg.chatId && !draftChatId) {
              setDraftChatId(latestCfg.chatId);
            }
            setActiveModal('telegram');
          }}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Send className="w-4 h-4 text-sky-500 shrink-0" />
            <span>تليجرام</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span
              className={
                (telegramConfig?.botToken || draftBotToken).trim() &&
                (telegramConfig?.chatId || draftChatId).trim()
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ''
              }
            >
              {(telegramConfig?.botToken || draftBotToken).trim() &&
              (telegramConfig?.chatId || draftChatId).trim()
                ? SCHEDULE_LABELS_AR[telegramConfig?.schedule || 'daily']
                : 'إعداد'}
            </span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>

        {/* 4. Backup & Restore */}
        <button
          type="button"
          onClick={() => setActiveModal('backup')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <FolderSync className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>النسخ الاحتياطي</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{backupHistory.length}</span>
            <ChevronLeft className="w-4 h-4" />
          </div>
        </button>

        {/* 5. Duplicate Policy */}
        <button
          type="button"
          onClick={() => setActiveModal('conflict')}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-right"
        >
          <div className="flex items-center gap-2.5 text-sm font-bold text-slate-900 dark:text-white">
            <Layers className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>التكرار</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>{CONFLICT_LABELS[conflictPolicy]}</span>
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
              <span>التثبيت</span>
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

        {/* 9. Factory Reset */}
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
            {/* Modal A: Typography (Font Family & Dynamic Font Size) */}
            {activeModal === 'typography' && (
              <>
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      حجم الخط
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                 <div className="space-y-4 text-xs">
                  {/* Dynamic Font Scale Slider + Auto Phone Option */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800 dark:text-slate-100">
                        حجم النص (75% – 100%)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono font-extrabold">
                        {isAutoFontScale
                          ? 'تلقائي (خط الهاتف)'
                          : `${effectiveScalePercent}% (${Math.round((16 * effectiveScalePercent) / 100)}px)`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => applyDynamicScalePercent(effectiveScalePercent - 5)}
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-extrabold text-sm flex items-center justify-center hover:border-emerald-500"
                        aria-label="تصغير الخط"
                      >
                        A-
                      </button>

                      <input
                        type="range"
                        min={75}
                        max={100}
                        step={5}
                        value={effectiveScalePercent}
                        onChange={(e) => applyDynamicScalePercent(Number(e.target.value))}
                        className="flex-1 accent-emerald-600 cursor-pointer h-2 rounded-lg"
                      />

                      <button
                        type="button"
                        onClick={() => applyDynamicScalePercent(effectiveScalePercent + 5)}
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-extrabold text-base flex items-center justify-center hover:border-emerald-500"
                        aria-label="تكبير الخط"
                      >
                        A+
                      </button>
                    </div>

                    {/* Quick Presets including Phone Auto */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {FONT_SIZE_OPTIONS.map((sizeOpt) => {
                        const active =
                          sizeOpt.id === 'auto'
                            ? isAutoFontScale
                            : !isAutoFontScale && Math.abs(effectiveScalePercent - sizeOpt.percent) <= 2;
                        return (
                          <button
                            key={sizeOpt.id}
                            type="button"
                            onClick={() => {
                              if (sizeOpt.id === 'auto') {
                                onChangeFontSizeScale('auto');
                              } else {
                                applyDynamicScalePercent(sizeOpt.percent);
                              }
                            }}
                            className={`min-h-[38px] px-1.5 py-1.5 rounded-xl border font-bold flex flex-col items-center justify-center transition-colors ${
                              active
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="text-[11px] leading-tight">{sizeOpt.label}</span>
                            <span className="font-mono text-[9px] opacity-80">{sizeOpt.pxLabel}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Font Family (Clean Grid Without Filler Descriptions) */}
                  <div className="space-y-2">
                    <span className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      نوع الخط
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {FONT_FAMILY_OPTIONS.map((fontOpt) => {
                        const active = fontFamily === fontOpt.id;
                        return (
                          <button
                            key={fontOpt.id}
                            type="button"
                            onClick={() => onChangeFontFamily(fontOpt.id)}
                            style={{ fontFamily: fontOpt.cssFamily }}
                            className={`min-h-[40px] px-3 py-2 rounded-xl border text-right flex items-center justify-between gap-1.5 transition-colors ${
                              active
                                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200'
                            }`}
                          >
                            <span className="font-extrabold text-xs truncate">{fontOpt.label}</span>
                            {active && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Modal B: App Color Theme */}
            {activeModal === 'theme' && (
              <>
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Palette className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      ثيمات التطبيق
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  {COLOR_THEME_OPTIONS.map((themeOpt) => {
                    const active = colorTheme === themeOpt.id;
                    return (
                      <button
                        key={themeOpt.id}
                        type="button"
                        onClick={() => {
                          onChangeColorTheme(themeOpt.id);
                          setActiveModal(null);
                        }}
                        className={`min-h-[52px] px-3 py-2.5 rounded-xl border font-bold flex items-center justify-between gap-2 transition-colors ${
                          active
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 ${themeOpt.surfacePreviewClass}`}
                          >
                            <span className={`w-3 h-3 rounded-full ${themeOpt.swatchClass}`} />
                          </span>
                          <span className="truncate">{themeOpt.label}</span>
                        </div>
                        {active && <Check className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

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
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
                    <div className="flex items-center justify-between gap-2">
                      <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                        رمز البوت (Telegram Bot Token) *
                      </label>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        محمي ومشفر محلياً (Keystore)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={botTokenInputRef}
                        type={showBotTokenPlain ? 'text' : 'password'}
                        dir="ltr"
                        autoComplete="off"
                        spellCheck={false}
                        value={draftBotToken}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDraftBotToken(val);
                          syncAndPersistTelegramDraft({ botToken: val });
                        }}
                        onBlur={(e) => {
                          const val = e.currentTarget.value;
                          setDraftBotToken(val);
                          syncAndPersistTelegramDraft({ botToken: val });
                        }}
                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        className="flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-left focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBotTokenPlain((prev) => !prev)}
                        className="min-h-[40px] px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0"
                      >
                        {showBotTokenPlain ? 'إخفاء' : 'إظهار'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      معرف المحادثة أو القناة (Chat ID) *
                    </label>
                    <input
                      ref={chatIdInputRef}
                      type="text"
                      dir="ltr"
                      autoComplete="off"
                      spellCheck={false}
                      value={draftChatId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftChatId(val);
                        syncAndPersistTelegramDraft({ chatId: val });
                      }}
                      onBlur={(e) => {
                        const val = e.currentTarget.value;
                        setDraftChatId(val);
                        syncAndPersistTelegramDraft({ chatId: val });
                      }}
                      placeholder="e.g., 987654321 or -100123456789"
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-left focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* Backup Mode Selection (Clean, Single-Line, Zero Duplicates) */}
                  <div className="space-y-1.5">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      طريقة النسخ:
                    </label>
                    <div className="space-y-1.5">
                      {(
                        [
                          'single_complete_file',
                          'notes_and_scheduled_full',
                          'with_separate_media'
                        ] as TelegramBackupMode[]
                      ).map((modeKey) => {
                        const activeMode =
                          (telegramConfig.backupMode || 'single_complete_file') === modeKey;
                        const info = BACKUP_MODE_LABELS_AR[modeKey];
                        return (
                          <button
                            key={modeKey}
                            type="button"
                            onClick={() =>
                              syncAndPersistTelegramDraft({
                                backupMode: modeKey,
                                sendInstantChangeNotes: modeKey === 'notes_and_scheduled_full',
                                includeMediaFilesOnSync: modeKey === 'with_separate_media',
                                includeDictionaryAndTerms: true,
                                includeTopicsAndHierarchy: true
                              })
                            }
                            className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-right transition-colors flex items-center justify-between gap-2 ${
                              activeMode
                                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            <span className="font-extrabold text-xs">{info.title}</span>
                            {activeMode && (
                              <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Backup File Format */}
                  <div className="space-y-1.5">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      صيغة النسخة:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: 'json', label: 'JSON' },
                          { key: 'zip', label: 'ZIP' }
                        ] as Array<{ key: TelegramBackupFileFormat; label: string }>
                      ).map((fmt) => {
                        const activeFmt =
                          (telegramConfig.backupFileFormat || 'json') === fmt.key;
                        return (
                          <button
                            key={fmt.key}
                            type="button"
                            onClick={() =>
                              syncAndPersistTelegramDraft({ backupFileFormat: fmt.key })
                            }
                            className={`min-h-[40px] px-3 py-2 rounded-xl border font-bold text-center transition-colors ${
                              activeFmt
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {fmt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Periodic Schedule Selector */}
                  <div className="space-y-1.5">
                    <label className="font-extrabold text-slate-700 dark:text-slate-200 block">
                      الجدولة الدورية:
                    </label>
                    <select
                      value={telegramConfig.schedule}
                      onChange={(e) => {
                        const nextSched = e.target.value as TelegramBackupSchedule;
                        syncAndPersistTelegramDraft({
                          schedule: nextSched,
                          enabled: nextSched !== 'off'
                        });
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-bold"
                    >
                      {(Object.keys(SCHEDULE_LABELS_AR) as TelegramBackupSchedule[]).map(
                        (schedKey) => (
                          <option key={schedKey} value={schedKey}>
                            {SCHEDULE_LABELS_AR[schedKey]}
                          </option>
                        )
                      )}
                    </select>

                    {telegramConfig.schedule === 'custom_hours' && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0">
                          الفاصل الزمني (بالساعات):
                        </span>
                        <input
                          type="number"
                          min={0.5}
                          max={720}
                          step={0.5}
                          dir="ltr"
                          value={telegramConfig.customIntervalHours ?? 4}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (!Number.isNaN(v)) {
                              syncAndPersistTelegramDraft({
                                customIntervalHours: Math.max(0.25, Math.min(720, v))
                              });
                            }
                          }}
                          className="w-24 min-h-[38px] px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-center font-bold"
                        />
                        <span className="text-[11px] text-slate-500">ساعة</span>
                      </div>
                    )}
                  </div>

                  {telegramFeedback && (
                    <div
                      className={`p-3 rounded-xl border font-bold leading-relaxed ${
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
                      disabled={
                        isTestingTelegram ||
                        isSendingTelegram ||
                        isSyncingTelegramMedia ||
                        isRestoringTelegram
                      }
                      onClick={() => void handleTestTelegram()}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isTestingTelegram ? 'animate-spin' : ''}`}
                      />
                      <span>فحص الاتصال</span>
                    </button>

                    <button
                      type="button"
                      disabled={
                        isSendingTelegram ||
                        isTestingTelegram ||
                        isSyncingTelegramMedia ||
                        isRestoringTelegram
                      }
                      onClick={() => void handleSendTelegramNow()}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingTelegram ? 'جاري الإرسال...' : 'نسخ الآن لتليجرام'}</span>
                    </button>
                  </div>

                  {onRestoreFromTelegramNow && (
                    <button
                      type="button"
                      disabled={
                        isRestoringTelegram ||
                        isSendingTelegram ||
                        isTestingTelegram ||
                        isSyncingTelegramMedia
                      }
                      onClick={() => void handleRestoreTelegramNow()}
                      className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Download
                        className={`w-3.5 h-3.5 ${isRestoringTelegram ? 'animate-bounce' : ''}`}
                      />
                      <span>
                        {isRestoringTelegram
                          ? 'جاري الجلب والدمج من تليجرام...'
                          : 'استيراد ودمج آخر نسخة من تليجرام مباشرة'}
                      </span>
                    </button>
                  )}

                  {telegramConfig.backupMode === 'with_separate_media' && (
                    <button
                      type="button"
                      disabled={
                        isSyncingTelegramMedia ||
                        isSendingTelegram ||
                        isTestingTelegram ||
                        isRestoringTelegram
                      }
                      onClick={() => void handleSyncTelegramMediaNow()}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Upload
                        className={`w-3.5 h-3.5 ${isSyncingTelegramMedia ? 'animate-pulse' : ''}`}
                      />
                      <span>
                        {isSyncingTelegramMedia
                          ? 'جاري مزامنة الوسائط...'
                          : 'مزامنة الوسائط المحلية منفصلة الآن'}
                      </span>
                    </button>
                  )}
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
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
                      setTimeout(() => {
                        const check = verifyLocalStoragePersistence();
                        const dl = check.lastDownload;
                        setDownloadedFilesList(getDownloadedFilesHistory());
                        if (dl && dl.verified) {
                          setLocalVerifyFeedback(
                            dl.verifiedOnDisk
                              ? `تم التحقق وحفظ ملف JSON فعلياً في: ${dl.savedPath} (${dl.sizeKB} KB)`
                              : `تم إرسال ملف JSON (${dl.sizeKB} KB) إلى تنزيلات المتصفح — تحقق من مجلد التنزيلات في جهازك.`
                          );
                        }
                      }, 300);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onExportZipPackage();
                      setTimeout(() => {
                        const check = verifyLocalStoragePersistence();
                        const dl = check.lastDownload;
                        setDownloadedFilesList(getDownloadedFilesHistory());
                        if (dl && dl.verified) {
                          setLocalVerifyFeedback(
                            dl.verifiedOnDisk
                              ? `تم التحقق وحفظ حزمة ZIP فعلياً في: ${dl.savedPath} (${dl.sizeKB} KB)`
                              : `تم إرسال حزمة ZIP (${dl.sizeKB} KB) إلى تنزيلات المتصفح — تحقق من مجلد التنزيلات في جهازك.`
                          );
                        }
                      }, 300);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير ZIP</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-500" />
                    <span>استيراد بيانات أوفلاين</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onShareDataFile();
                      setTimeout(() => {
                        setDownloadedFilesList(getDownloadedFilesHistory());
                      }, 300);
                    }}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>مشاركة النسخة</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onCreateManualBackup();
                    const check = verifyLocalStoragePersistence();
                    setDownloadedFilesList(getDownloadedFilesHistory());
                    const dlText =
                      check.lastDownload && check.lastDownload.verified
                        ? check.lastDownload.verifiedOnDisk
                          ? ` · آخر ملف محفوظ فعلياً: ${check.lastDownload.savedPath} (${check.lastDownload.sizeKB} KB)`
                          : ` · آخر ملف أُرسل للتنزيل: ${check.lastDownload.filename} (${check.lastDownload.sizeKB} KB)`
                        : '';
                    setLocalVerifyFeedback(
                      check.ok
                        ? `التخزين المحلي يعمل بكفاءة (${check.usedKB} KB محفوظة في ${check.keysCount} سجل محلي)${dlText}`
                        : 'تعذر الوصول إلى التخزين المحلي في المتصفح.'
                    );
                  }}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>تأكيد وفحص التحميل والتخزين المحلي</span>
                </button>

                {localVerifyFeedback && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 text-xs font-bold leading-relaxed break-words">
                    {localVerifyFeedback}
                  </div>
                )}

                {/* Saved Files in Download/UMEDT with Open & Share Actions */}
                {downloadedFilesList.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-slate-700 dark:text-slate-200">
                        سجل التنزيلات (Download/UMEDT)
                      </span>
                      <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                        {downloadedFilesList.length} ملف
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                      {downloadedFilesList.slice(0, 6).map((fileRec) => (
                        <div
                          key={fileRec.id || fileRec.filename}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div
                              dir="ltr"
                              className="font-mono font-extrabold text-slate-900 dark:text-white text-left break-all text-[11px]"
                            >
                              {fileRec.verifiedOnDisk
                                ? fileRec.savedPath
                                : fileRec.filename}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {fileRec.sizeKB} KB ·{' '}
                              {fileRec.verifiedOnDisk
                                ? 'تم التأكد من الحفظ في Download/UMEDT'
                                : 'أُرسل لتنزيلات المتصفح'}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const openRes = openSavedDownloadFile(fileRec);
                                if (!openRes.openedNatively) {
                                  setPreviewDownloadedFile(fileRec);
                                }
                                setLocalVerifyFeedback(openRes.messageAr);
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold text-[11px]"
                            >
                              فتح
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void shareSavedDownloadFile(fileRec).then((sh) => {
                                  setLocalVerifyFeedback(sh.messageAr);
                                });
                              }}
                              className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-200/80 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-[11px]"
                            >
                              مشاركة
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {previewDownloadedFile && (
                      <div className="p-3 rounded-xl bg-slate-900 text-slate-100 border border-slate-700 space-y-2 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                          <span
                            dir="ltr"
                            className="font-mono font-bold text-emerald-400 break-all text-[11px]"
                          >
                            {previewDownloadedFile.savedPath} ({previewDownloadedFile.sizeKB} KB)
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewDownloadedFile(null)}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-[11px]"
                          >
                            إغلاق
                          </button>
                        </div>
                        <pre
                          dir="ltr"
                          className="max-h-36 overflow-auto text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-slate-200"
                        >
                          {previewDownloadedFile.previewText || 'تم حفظ الملف بنجاح.'}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">
                      نقاط الاستعادة المحفوظة محلياً ({backupHistory.length})
                    </span>
                    <button
                      type="button"
                      onClick={onCreateManualBackup}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold"
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
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs"
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
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  onRestoreBackupById(item.backupId);
                                  setActiveModal(null);
                                }}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-bold"
                              >
                                استعادة
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteBackupById(item.backupId)}
                                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/10"
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
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
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
