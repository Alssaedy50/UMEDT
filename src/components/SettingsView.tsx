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
  ChevronDown,
  Share2,
  History,
  CloudDownload,
  RefreshCw,
  ShieldCheck,
  Lock,
  AlertCircle,
  Smartphone,
  Copy,
  Check,
  Database,
  Sliders,
  Sparkles
} from 'lucide-react';
import {
  DataBackupRecord,
  VersionMetadata,
  OnlineUpdateConfig,
  OnlineUpdateStatus
} from '../types/lexicon';
import { APP_VERSION, DB_SCHEMA_VERSION } from '../services/dataPlatformService';
import { isTrustedPublicKeyLockedByBuild } from '../services/storageService';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

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
}

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
  const [showOtaConfigPanel, setShowOtaConfigPanel] = useState<boolean>(false);
  const [isRunningLiveOtaTest, setIsRunningLiveOtaTest] = useState<boolean>(false);
  const [confirmResetDefaults, setConfirmResetDefaults] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const { isInstallable, isInstalled, isCapacitorNative, install } = usePWAInstall();
  const browserOnline = useOnlineStatus();
  const effectiveOnline = browserOnline && !simulatedOffline;

  const publicKeyLockedByBuild = isTrustedPublicKeyLockedByBuild();

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
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportPackageFile(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 w-full overflow-x-clip box-border pb-8">
      {/* Page Header */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 flex items-center justify-between flex-wrap gap-3 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-white">
              إعدادات البرنامج والنظام
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            إدارة المظهر، قواعد استيراد البيانات، التحديث السحابي، والنسخ الاحتياطي في مكان واحد
          </p>
        </div>

        <div
          dir="ltr"
          className="text-xs font-mono text-slate-500 dark:text-slate-400 flex items-center gap-2"
        >
          <span>v{APP_VERSION}</span>
          <span aria-hidden="true">·</span>
          <span>Schema v{DB_SCHEMA_VERSION}</span>
          <span aria-hidden="true">·</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
            {dbMetrics.actualSizeKb.toLocaleString()} KB
          </span>
        </div>
      </div>

      {/* ====================================================================
          1. APPEARANCE & GENERAL PREFERENCES
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-xs">
        <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
          1. المظهر وتفضيلات الاستخدام
        </h2>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {/* Theme Selection */}
          <div className="py-3.5 first:pt-0 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                مظهر الواجهة (Theme)
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                التبديل بين الوضع النهاري الفاتح والوضع الليلي المريح للعين
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => onToggleDark(false)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  !isDark
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                <span>الوضع النهاري</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleDark(true)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  isDark
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>الوضع الليلي</span>
              </button>
            </div>
          </div>

          {/* Conflict Resolution Policy */}
          <div className="py-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                معالجة المصطلحات المكررة عند الاستيراد
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تحديد كيفية تعامل النظام عند رفع ملف يحتوي على مصطلح موجود مسبقاً
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 flex-wrap">
              {[
                { id: 'merge', label: 'دمج ذكي (موصى به)' },
                { id: 'overwrite', label: 'استبدال وتحديث' },
                { id: 'ignore', label: 'تجاهل المكرر' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onChangeConflictPolicy(opt.id as 'ignore' | 'overwrite' | 'merge')
                  }
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                    conflictPolicy === opt.id
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Offline Mode Toggle */}
          <div className="py-3.5 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                وضع العمل المحلي بدون إنترنت (Offline Mode)
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يعمل القاموس والمترجم السريري والمراجعة محلياً 100%. يمكنك تفعيل العزل المحلي لإيقاف أي طلبات شبكية.
              </p>
            </div>

            <button
              type="button"
              onClick={onToggleSimulatedOffline}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 border transition-colors whitespace-nowrap shrink-0 ${
                effectiveOnline
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-800 dark:text-amber-300'
              }`}
            >
              {effectiveOnline ? (
                <>
                  <Wifi className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>متصل بالشبكة (تفعيل وضع Offline)</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>وضع Offline نشط (إعادة الاتصال)</span>
                </>
              )}
            </button>
          </div>

          {/* Clear Recent Searches */}
          <div className="py-3.5 last:pb-0 flex items-center justify-between gap-4 flex-wrap">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                سجل المصطلحات المبحوث عنها مؤخراً
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يحتفظ السجل حالياً بـ ({recentTermsCount}) مصطلح لتسهيل الوصول السريع في صفحة القاموس
              </p>
            </div>

            <button
              type="button"
              disabled={recentTermsCount === 0}
              onClick={onClearRecentTerms}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>مسح سجل البحث</span>
            </button>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. CLOUD DATA OTA UPDATES
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CloudDownload className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                2. التحديث السحابي للبيانات الطبية (GitHub / Cloud OTA)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              فحص وتنزيل التحديثات الطبية المعتمدة والموقعة رقمياً دون الحاجة لإعادة تثبيت التطبيق
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowOtaConfigPanel((prev) => !prev)}
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <span>إعدادات المستودع المتقدمة</span>
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
                className="font-mono font-extrabold text-slate-900 dark:text-white tabular-nums"
              >
                {versionMetadata.dataVersion}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-500 font-semibold">الإصدار السحابي المتاح:</span>
              <span
                dir="ltr"
                className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums"
              >
                {onlineUpdateStatus.availableDataVersion || '—'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-500 font-semibold">حالة التحديث:</span>
              <span
                className={`font-bold text-[11px] ${
                  onlineUpdateStatus.phase === 'update-available'
                    ? 'text-amber-700 dark:text-amber-300'
                    : onlineUpdateStatus.phase === 'completed' ||
                        onlineUpdateStatus.phase === 'up-to-date'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : onlineUpdateStatus.phase === 'error' ||
                          onlineUpdateStatus.phase === 'incompatible'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-700 dark:text-slate-300'
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

            <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-700 dark:text-emerald-300">
              {onlineUpdateStatus.checksumVerified && <span>SHA-256 ✓</span>}
              {onlineUpdateStatus.signatureVerified && <span>ECDSA-P256 ✓</span>}
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

        {/* Action Buttons */}
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
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
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
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
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
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>
              {isRunningLiveOtaTest
                ? 'جاري الاختبار الحي...'
                : 'اختبار تحديث محلي (Dev OTA)'}
            </span>
          </button>

          <button
            type="button"
            disabled={backupHistory.length === 0}
            onClick={() => void onRollbackToPreviousVersion()}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4 shrink-0 text-amber-500" />
            <span>التراجع للإصدار السابق</span>
          </button>
        </div>

        {/* Collapsible Repository & Public Key Configuration */}
        {showOtaConfigPanel && (
          <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  رابط ملف البيان السحابي (Manifest URL — GitHub Releases / CDN)
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
                  placeholder="https://raw.githubusercontent.com/Alssaedy50/UMEDT/main/data/releases/stable/manifest.json"
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
                  <span className="text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                    مؤمّن من بناء التطبيق (VITE_UMED_PUBLIC_KEY_PEM)
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
          3. BACKUP, RESTORE & CROSS-ENVIRONMENT TRANSFER
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-extrabold flex items-center gap-2 text-slate-900 dark:text-white">
              <FolderSync className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>3. النسخ الاحتياطي والاستعادة ونقل البيانات</span>
            </h2>
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
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>تصدير نسخة JSON</span>
          </button>

          <button
            type="button"
            onClick={onExportZipPackage}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-extrabold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>تصدير حزمة ZIP</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Upload className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>استعادة من ملف (JSON / ZIP)</span>
          </button>

          <button
            type="button"
            onClick={onShareDataFile}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <Share2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>مشاركة ملف البيانات</span>
          </button>
        </div>

        {/* Local Restore Snapshots */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>نقاط الاستعادة المحفوظة محلياً ({backupHistory.length})</span>
            </span>

            <button
              type="button"
              onClick={onCreateManualBackup}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-bold whitespace-nowrap"
            >
              + حفظ نقطة استعادة الآن
            </button>
          </div>

          {backupHistory.length > 0 ? (
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
                      className="min-h-[36px] px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 font-bold"
                    >
                      استعادة
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBackupById(item.backupId)}
                      className="min-h-[36px] px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                      title="حذف نقطة الاستعادة"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-2">
              لا توجد نقاط استعادة محفوظة حالياً. يمكنك الضغط على "+ حفظ نقطة استعادة الآن" لإنشاء نسخة فورية.
            </p>
          )}
        </div>
      </div>

      {/* ====================================================================
          4. APP INSTALLATION, DATABASE STORAGE & FACTORY RESET
         ==================================================================== */}
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              4. تثبيت التطبيق وبيانات النظام
            </h2>
          </div>
        </div>

        {/* Database summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 block">إجمالي المصطلحات</span>
            <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {dbMetrics.totalTerms.toLocaleString()}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 block">الجمل السياقية</span>
            <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {dbMetrics.totalSentences.toLocaleString()}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 block">روابط المعرفة</span>
            <span className="text-base font-extrabold font-mono text-slate-900 dark:text-white tabular-nums mt-0.5 block">
              {dbMetrics.totalGraphEdges.toLocaleString()}
            </span>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
            <span className="text-slate-500 block">حجم القاعدة المحلية</span>
            <span
              dir="ltr"
              className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5 block text-right"
            >
              {dbMetrics.actualSizeKb.toLocaleString()} KB
            </span>
          </div>
        </div>

        {/* PWA Install & Share Link */}
        {!isCapacitorNative && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  تثبيت التطبيق على الشاشة الرئيسية (PWA) ومشاركة الرابط
                </span>
              </div>
              {isInstalled && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  مثبّت على الجهاز ✓
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {isInstallable && (
                <button
                  type="button"
                  onClick={() => void install()}
                  className="min-h-[40px] py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-2 whitespace-nowrap"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>تثبيت التطبيق مباشرة</span>
                </button>
              )}

              <div className="flex-1 min-w-[220px] flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  dir="ltr"
                  value={shareableAppUrl}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-left text-slate-700 dark:text-slate-300"
                />
                <button
                  type="button"
                  onClick={handleCopyAppUrl}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>تم النسخ</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>نسخ الرابط</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Factory Reset with Safe Inline Confirmation */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
          <div className="space-y-0.5">
            <div className="text-xs font-bold text-slate-900 dark:text-white">
              إعادة ضبط البيانات إلى الحالة الافتراضية
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              استعادة المصطلحات والجمل والمواضيع الأساسية المدمجة مع التطبيق
            </p>
          </div>

          {!confirmResetDefaults ? (
            <button
              type="button"
              onClick={() => setConfirmResetDefaults(true)}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span>استعادة الضبط الافتراضي</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                تأكيد استعادة البيانات الافتراضية؟
              </span>
              <button
                type="button"
                onClick={() => {
                  onResetDefaults();
                  setConfirmResetDefaults(false);
                }}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold whitespace-nowrap"
              >
                نعم، استعادة الآن
              </button>
              <button
                type="button"
                onClick={() => setConfirmResetDefaults(false)}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold whitespace-nowrap"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
