import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Star,
  Volume2,
  Check,
  ArrowRight,
  Layers,
  Cpu,
  Stethoscope,
  Code2,
  Globe,
  X,
  CheckCircle2,
  BookOpen,
  Menu,
  Settings
} from 'lucide-react';
import {
  EXTRA_LINKABLE_ALIASES,
  DictionaryTerm,
  LinkedSentence
} from './data/medicalLexiconData';
import {
  AppColorTheme,
  AppFontFamily,
  AppFontSizeScale,
  ClinicalAbbreviation,
  DataBackupRecord,
  MorphologicalAffix,
  OnlineUpdateConfig,
  OnlineUpdateStatus,
  SpacedRepetitionData,
  TermExample,
  TopicArticle,
  VersionMetadata
} from './types/lexicon';
import {
  syncBidirectionalLinks,
  autoEnrichTermRelations,
  autoEnrichAllTermsRelations,
  isLinkableSpecializedTerm
} from './engine/knowledgeLinker';
import {
  loadAppState,
  saveTerms,
  saveSentences,
  saveTopics,
  saveCustomAffixes,
  saveCustomAbbreviations,
  saveStudyStats,
  saveSettings,
  saveVersionMetadata,
  loadOnlineUpdateConfig,
  saveOnlineUpdateConfig,
  normalizeManifestUrl,
  createInitialOnlineUpdateStatus,
  runOnlineUpdateCycle,
  loadBackupHistory,
  createDataBackupSnapshot,
  deleteBackupRecord,
  restoreDataBackupById,
  rollbackToPreviousDataVersion,
  syncTermExamplesToSentences,
  exportFullDatabaseJson,
  exportFullDatabaseZipBytes,
  executeAtomicPackageImport,
  buildAiLinguisticAuditPack,
  importFullDatabaseJson,
  resetToDefaults,
  calculateActualDatabaseSizeKb
} from './services/storageService';
import { SearchHub } from './components/SearchHub';
import { TopicsHub } from './components/TopicsHub';
import { TermDetailSheet } from './components/TermDetailSheet';
import { LibraryView, LibrarySubMode, StagedTermItem } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { registerImportGroup, ImportGroupDomain } from './services/importGroupService';
import { publishMasterDataToGitHub } from './services/githubRepositoryService';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { prepareAndDownloadFile, shareFileWithVerification } from './utils/downloadHelper';
import {
  deleteLocalMediaRecordsByTopicId,
  deleteLocalMediaRecordsByKeys
} from './services/mediaStorageService';
import { runSafeIndexedDbMigration, putAllInStore, IDB_STORES } from './services/indexedDbService';
import {
  TelegramBackupConfig,
  TelegramChangeAction,
  ConciseDataSummary,
  loadTelegramBackupConfig,
  saveTelegramBackupConfig,
  sendBackupToTelegram,
  isTelegramScheduledBackupDue,
  buildConciseDataSummary,
  createUnifiedBackupPackage,
  scheduleDebouncedTelegramAutoSync,
  scheduleDebouncedTelegramChangeNote,
  fetchLatestBackupPayloadFromTelegram
} from './services/telegramBackupService';
import {
  saveMedicalBlocks,
  saveMedicalSubjects,
  loadMedicalBlocks,
  loadMedicalSubjects,
  loadAcademicBooks,
  saveAcademicBooks,
  loadAcademicExams,
  saveAcademicExams,
  loadMediaAssetsIndex,
  saveMediaAssetsIndex,
  loadUserStudyNotes,
  saveUserStudyNotes,
  normalizeAcademicBookResource
} from './services/learningHierarchyService';
import { saveQuizQuestions, saveQuizAttempts, loadQuizQuestions } from './services/quizEngineService';
import {
  importUniversalAiOrLocalContent,
  importUniversalZipArchiveBytes,
  UniversalImportReport
} from './services/aiUniversalImportService';
import { parseUploadedFile } from './services/fileParserService';
import {
  enqueueEntitiesForCloudSync,
  processCloudSyncQueue,
  setCloudSyncSimulatedOffline,
  clearLocallyRemovedRegistry
} from './services/cloudLibrarySyncService';

type MainTab = 'home' | 'topics' | 'library' | 'settings';

const ROUTE_TO_TAB: Record<string, MainTab> = {
  '/': 'home',
  '/home': 'home',
  '/search': 'home',
  '/topics': 'topics',
  '/translator': 'topics',
  '/datacenter': 'library',
  '/medical-data-center': 'library',
  '/ingest': 'library',
  '/library': 'library',
  '/settings': 'settings'
};

const TAB_TO_HASH: Record<MainTab, string> = {
  home: '#home',
  topics: '#topics',
  library: '#library',
  settings: '#settings'
};

const PAGE_LABELS: Record<MainTab, string> = {
  home: 'القاموس',
  topics: 'المواضيع',
  library: 'مكتبتي',
  settings: 'الإعدادات'
};

function resolveInitialTabFromLocation(): MainTab {
  if (typeof window === 'undefined') return 'home';
  const hashClean = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (hashClean === 'translator') return 'topics';
  if (
    hashClean === 'datacenter' ||
    hashClean === 'medical-data-center' ||
    hashClean === 'ingest'
  ) {
    return 'library';
  }
  if (
    hashClean === 'home' ||
    hashClean === 'topics' ||
    hashClean === 'library' ||
    hashClean === 'settings'
  ) {
    return hashClean as MainTab;
  }
  const pathClean = window.location.pathname.replace(/\/+$/, '') || '/';
  return ROUTE_TO_TAB[pathClean.toLowerCase()] || 'home';
}

const CATEGORY_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  All: { label: 'جميع التخصصات', icon: Layers },
  Medical: { label: 'الطب السريري', icon: Stethoscope },
  AI: { label: 'الذكاء الاصطناعي', icon: Cpu },
  Programming: { label: 'هندسة البرمجيات', icon: Code2 },
  General: { label: 'معرفي وعام', icon: Globe }
};

const SCOPE_LABELS: Record<'all' | 'terms' | 'definitions' | 'examples', string> = {
  all: 'كل الحقول',
  terms: 'المصطلحات فقط',
  definitions: 'التعريفات فقط',
  examples: 'الأمثلة السياقية'
};

export default function App() {
  const initialPersisted = useMemo(() => loadAppState(), []);

  const [isDark, setIsDark] = useState<boolean>(initialPersisted.settings.isDark);
  const [fontFamily, setFontFamily] = useState<AppFontFamily>(
    initialPersisted.settings.fontFamily || 'cairo'
  );
  const [fontSizeScale, setFontSizeScale] = useState<AppFontSizeScale>(
    initialPersisted.settings.fontSizeScale || 'auto'
  );
  const [fontScalePercent, setFontScalePercent] = useState<number>(() => {
    try {
      const saved = window.localStorage.getItem('umed_font_scale_percent_v1');
      if (saved) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          return Math.max(75, Math.min(100, parsed));
        }
      }
    } catch {
      // ignore
    }
    const scaleMap: Record<AppFontSizeScale, number> = {
      auto: 85,
      sm: 75,
      md: 85,
      lg: 95,
      xl: 100
    };
    return scaleMap[initialPersisted.settings.fontSizeScale || 'auto'] || 85;
  });
  const [colorTheme, setColorTheme] = useState<AppColorTheme>(
    initialPersisted.settings.colorTheme || 'emerald'
  );
  const [activeTab, setActiveTab] = useState<MainTab>(() => resolveInitialTabFromLocation());
  const [terms, setTerms] = useState<DictionaryTerm[]>(initialPersisted.terms);
  const [sentences, setSentences] = useState<LinkedSentence[]>(initialPersisted.sentences);
  const [topics, setTopics] = useState<TopicArticle[]>(initialPersisted.topics);
  const [customAffixes, setCustomAffixes] = useState<MorphologicalAffix[]>(
    initialPersisted.customAffixes || []
  );
  const [customAbbreviations, setCustomAbbreviations] = useState<ClinicalAbbreviation[]>(
    initialPersisted.customAbbreviations
  );
  const [versionMetadata, setVersionMetadata] = useState<VersionMetadata>(
    initialPersisted.versionMetadata
  );
  const initialUpdateConfig = useMemo(() => loadOnlineUpdateConfig(), []);
  const [onlineUpdateConfig, setOnlineUpdateConfig] =
    useState<OnlineUpdateConfig>(initialUpdateConfig);
  const [onlineUpdateStatus, setOnlineUpdateStatus] = useState<OnlineUpdateStatus>(() =>
    createInitialOnlineUpdateStatus(
      initialPersisted.versionMetadata.dataVersion,
      initialUpdateConfig
    )
  );
  const [backupHistory, setBackupHistory] = useState<DataBackupRecord[]>(() =>
    loadBackupHistory()
  );
  const [simulatedOffline, setSimulatedOffline] = useState<boolean>(false);

  // Contextual Full-Card Sheet State (opens over any screen when a term is tapped)
  const [detailTermId, setDetailTermId] = useState<string | null>(null);
  const [detailHistory, setDetailHistory] = useState<string[]>([]);
  const [selectedDesktopTermId, setSelectedDesktopTermId] = useState<string>('m1');

  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);

  // Unified Popover & Side Menu States
  const [openMenu, setOpenMenu] = useState<null | 'searchFilters' | 'collections'>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    const fontMap: Record<AppFontFamily, string> = {
      cairo: "'Cairo', 'Inter', system-ui, -apple-system, sans-serif",
      tajawal: "'Tajawal', 'Inter', system-ui, -apple-system, sans-serif",
      ibm: "'IBM Plex Sans Arabic', 'Inter', system-ui, -apple-system, sans-serif",
      almarai: "'Almarai', 'Cairo', system-ui, -apple-system, sans-serif",
      readex: "'Readex Pro', 'Inter', system-ui, -apple-system, sans-serif",
      kufi: "'Noto Kufi Arabic', 'Inter', system-ui, -apple-system, sans-serif",
      changa: "'Changa', 'Cairo', system-ui, -apple-system, sans-serif",
      amiri: "'Amiri', Georgia, serif",
      system: "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif"
    };
    const clampedPercent = Math.max(75, Math.min(100, fontScalePercent));
    const isAutoSystemFont = fontSizeScale === 'auto';

    try {
      const bridge = (window as unknown as {
        UMEDAndroidBridge?: {
          setUseSystemFontScale?: (useSystem: boolean) => void;
          getSystemFontScale?: () => number;
        };
      }).UMEDAndroidBridge;
      bridge?.setUseSystemFontScale?.(isAutoSystemFont);
    } catch {
      // ignore
    }

    root.style.setProperty('--app-font-family', fontMap[fontFamily] || fontMap.cairo);
    if (isAutoSystemFont) {
      root.style.setProperty('--app-font-scale', '0.85');
      root.style.fontSize = '13.5px';
      root.style.setProperty('-webkit-text-size-adjust', 'auto');
      root.style.setProperty('text-size-adjust', 'auto');
    } else {
      const scaleRatio = Number((clampedPercent / 100).toFixed(3));
      root.style.setProperty('--app-font-scale', String(scaleRatio));
      root.style.fontSize = `${Number((16 * scaleRatio).toFixed(2))}px`;
      root.style.setProperty('-webkit-text-size-adjust', '100%');
      root.style.setProperty('text-size-adjust', '100%');
    }
    try {
      window.localStorage.setItem('umed_font_scale_percent_v1', String(clampedPercent));
    } catch {
      // ignore
    }
    root.setAttribute('data-theme', colorTheme || 'emerald');
  }, [fontFamily, fontSizeScale, fontScalePercent, colorTheme]);

  // Screen 1: Search & Home State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'all' | 'terms' | 'definitions' | 'examples'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [termOfDayId, setTermOfDayId] = useState<string>('m5');
  const [recentTermIds, setRecentTermIds] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem('umed2_recent_searched_terms_v1');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((id): id is string => typeof id === 'string');
        }
      }
    } catch {
      // ignore storage read error
    }
    return initialPersisted.terms.slice(0, 6).map((t) => t.id);
  });

  // Contextual Term Detail & Quick Preview State
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewTerm, setPreviewTerm] = useState<(DictionaryTerm & { aliasName?: string }) | null>(null);

  // Navigation handoff states for Library & Topics
  const [libraryInitialMode, setLibraryInitialMode] = useState<LibrarySubMode | undefined>(
    undefined
  );
  const [libraryDraftTerm, setLibraryDraftTerm] = useState<string>('');
  const [topicsInitialTopicId, setTopicsInitialTopicId] = useState<string | null>(null);

  // Conflict Policy State
  const [conflictPolicy, setConflictPolicy] = useState<'ignore' | 'overwrite' | 'merge'>(
    initialPersisted.settings.conflictPolicy
  );

  // Screen 4: Library, Flashcards & Database State
  const [activeCollection, setActiveCollection] = useState<string>('الكل');
  const [studyStats, setStudyStats] = useState<{ gotIt: number; needsReview: number }>(
    initialPersisted.studyStats
  );
  const [sharedStoragePath] = useState<string>(
    initialPersisted.settings.sharedStoragePath || '/storage/emulated/0/DictEngine/ingest/'
  );
  const [lastBackupTime, setLastBackupTime] = useState<string>(
    initialPersisted.settings.lastBackupTime
  );
  const [telegramConfig, setTelegramConfig] = useState<TelegramBackupConfig>(() =>
    loadTelegramBackupConfig()
  );
  const [lastImportedOrCopiedSummary, setLastImportedOrCopiedSummary] =
    useState<ConciseDataSummary | null>(null);

  // Automatic Hybrid Persistence Hooks (localStorage)
  useEffect(() => {
    saveTerms(terms);
  }, [terms]);

  useEffect(() => {
    saveSentences(sentences);
  }, [sentences]);

  useEffect(() => {
    saveTopics(topics);
  }, [topics]);

  useEffect(() => {
    saveCustomAffixes(customAffixes);
  }, [customAffixes]);

  useEffect(() => {
    saveCustomAbbreviations(customAbbreviations);
  }, [customAbbreviations]);

  useEffect(() => {
    saveStudyStats(studyStats);
  }, [studyStats]);

  useEffect(() => {
    saveSettings({
      isDark,
      conflictPolicy,
      sharedStoragePath,
      lastBackupTime,
      fontFamily,
      fontSizeScale,
      colorTheme
    });
  }, [isDark, conflictPolicy, sharedStoragePath, lastBackupTime, fontFamily, fontSizeScale, colorTheme]);

  // Synchronize URL hash & history state for SPA route refresh and Android hardware Back navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetHash = TAB_TO_HASH[activeTab] || '#home';
    if (window.location.hash !== targetHash) {
      window.history.pushState({ tab: activeTab, detailTermId }, '', targetHash);
    }
  }, [activeTab, detailTermId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      if (isSidebarOpen) {
        setIsSidebarOpen(false);
        return;
      }
      if (openMenu) {
        setOpenMenu(null);
        return;
      }
      if (previewTerm) {
        setPreviewTerm(null);
        return;
      }
      if (detailTermId) {
        if (detailHistory.length > 1) {
          const nextHistory = detailHistory.slice(0, -1);
          setDetailHistory(nextHistory);
          setDetailTermId(nextHistory[nextHistory.length - 1]);
        } else {
          setDetailTermId(null);
          setDetailHistory([]);
        }
        return;
      }
      const nextTab = resolveInitialTabFromLocation();
      if (nextTab !== activeTab) {
        setActiveTab(nextTab);
      } else if (activeTab !== 'home') {
        setActiveTab('home');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isSidebarOpen, openMenu, previewTerm, detailTermId, detailHistory, activeTab]);

  const showToast = (message: string, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 2600);
  };

  const handleUpdateOnlineConfig = (nextConfig: OnlineUpdateConfig) => {
    const cleanUrl = normalizeManifestUrl(nextConfig.manifestUrl);
    const normalized: OnlineUpdateConfig = {
      ...nextConfig,
      manifestUrl: cleanUrl
    };
    setOnlineUpdateConfig(normalized);
    saveOnlineUpdateConfig(normalized);
    setVersionMetadata((prev) => {
      const updated: VersionMetadata = {
        ...prev,
        remoteManifestUrl: cleanUrl || undefined,
        remoteChannel: normalized.channel
      };
      saveVersionMetadata(updated);
      return updated;
    });
  };

  const handleCheckForUpdates = async (options?: {
    isStartup?: boolean;
    forceInstall?: boolean;
  }) => {
    if (simulatedOffline) {
      const offlineStatus: OnlineUpdateStatus = {
        ...onlineUpdateStatus,
        phase: 'offline',
        progressPercent: null,
        message:
          'وضع عدم الاتصال (Offline Mode) نشط: يعمل التطبيق بكامل قدراته محلياً 100% دون الحاجة للإنترنت.'
      };
      setOnlineUpdateStatus(offlineStatus);
      if (!options?.isStartup) {
        showToast(offlineStatus.message, 'info');
      }
      return;
    }

    const mode =
      conflictPolicy === 'overwrite'
        ? 'replace'
        : conflictPolicy === 'ignore'
        ? 'ignore'
        : 'merge';

    const { status, updatedState, importResult } = await runOnlineUpdateCycle({
      config: onlineUpdateConfig,
      isStartup: options?.isStartup,
      forceInstall: options?.forceInstall,
      mode,
      onStatusChange: (liveStatus) => {
        setOnlineUpdateStatus(liveStatus);
      }
    });

    if (updatedState && importResult?.success) {
      setTerms(updatedState.terms);
      setSentences(updatedState.sentences);
      setTopics(updatedState.topics);
      setCustomAffixes(updatedState.customAffixes);
      setCustomAbbreviations(updatedState.customAbbreviations);
      setStudyStats(updatedState.studyStats);
      setVersionMetadata(updatedState.versionMetadata);
      setBackupHistory(loadBackupHistory());
      setLastBackupTime('نسخ تلقائي قبل التحديث السحابي');
      triggerTelegramAutoSync(`تحديث سحابي OTA (${updatedState.versionMetadata.dataVersion})`, {
        terms: updatedState.terms,
        sentences: updatedState.sentences,
        topics: updatedState.topics,
        studyStats: updatedState.studyStats,
        versionMetadata: updatedState.versionMetadata
      });
      showToast(
        `تم تثبيت التحديث الطبي السحابي بنجاح (${updatedState.versionMetadata.dataVersion}) مع حفظ النسخة السابقة`
      );
    } else if (!options?.isStartup) {
      if (status.phase === 'up-to-date') {
        showToast(`البيانات الطبية محدّثة إلى آخر إصدار (${status.installedDataVersion})`);
      } else if (status.phase === 'update-available') {
        showToast(
          `يتوفر تحديث جديد (${status.availableDataVersion}) جاهز للتثبيت`,
          'info'
        );
      } else if (
        status.phase === 'error' ||
        status.phase === 'incompatible' ||
        status.phase === 'unconfigured'
      ) {
        showToast(status.message, 'info');
      }
    }
  };

  const handleRunLiveServerOtaTest = async () => {
    try {
      const infoRes = await fetch('/api/ota-test/info', { cache: 'no-store' });
      if (!infoRes.ok) {
        showToast('تعذر الاتصال بخادم التحديث المحلي لاختبار OTA', 'info');
        return;
      }
      const info = (await infoRes.json()) as {
        manifestUrl: string;
        publicKeyPem: string;
        dataVersion: string;
      };

      const liveConfig: OnlineUpdateConfig = {
        ...onlineUpdateConfig,
        manifestUrl: info.manifestUrl,
        publicKeyPem: info.publicKeyPem,
        requireSignature: true,
        signatureAlgorithm: 'ECDSA-P256-SHA256',
        autoUpdatePolicy: 'notify-only'
      };
      handleUpdateOnlineConfig(liveConfig);

      const mode =
        conflictPolicy === 'overwrite'
          ? 'replace'
          : conflictPolicy === 'ignore'
          ? 'ignore'
          : 'merge';

      const { status, updatedState, importResult } = await runOnlineUpdateCycle({
        config: liveConfig,
        forceInstall: true,
        mode,
        onStatusChange: (liveStatus) => {
          setOnlineUpdateStatus(liveStatus);
        }
      });

      if (updatedState && importResult?.success) {
        setTerms(updatedState.terms);
        setSentences(updatedState.sentences);
        setTopics(updatedState.topics);
        setCustomAffixes(updatedState.customAffixes);
        setCustomAbbreviations(updatedState.customAbbreviations);
        setStudyStats(updatedState.studyStats);
        setVersionMetadata(updatedState.versionMetadata);
        setBackupHistory(loadBackupHistory());
        setLastBackupTime(`نسخ تلقائي قبل التحديث الحي (${info.dataVersion})`);
        triggerTelegramAutoSync(`تحديث خادم OTA (${updatedState.versionMetadata.dataVersion})`, {
          terms: updatedState.terms,
          sentences: updatedState.sentences,
          topics: updatedState.topics,
          studyStats: updatedState.studyStats,
          versionMetadata: updatedState.versionMetadata
        });
        showToast(
          `نجح اختبار التحديث الفعلي من الخادم إلى التطبيق (${updatedState.versionMetadata.dataVersion}) مع التحقق من التوقيع الرقمي ECDSA-P256-SHA256`
        );
      } else {
        showToast(status.message, 'info');
      }
    } catch (err) {
      showToast(
        err instanceof Error
          ? `فشل اختبار التحديث الحي: ${err.message}`
          : 'تعذر إكمال اختبار التحديث الحي من الخادم',
        'info'
      );
    }
  };

  const handleCreateManualBackup = async () => {
    const record = await createDataBackupSnapshot({
      trigger: 'manual'
    });
    setBackupHistory(loadBackupHistory());
    setLastBackupTime(`نقطة استعادة (${record.versionMetadata.dataVersion})`);
    showToast(
      `تم إنشاء نقطة استعادة موثقة ببصمة SHA-256 للإصدار ${record.versionMetadata.dataVersion}`
    );
  };

  const handleRestoreBackupById = async (backupId: string) => {
    const { result, state } = await restoreDataBackupById(backupId);
    if (!result.success) {
      showToast(
        `تعذر استرجاع النسخة الاحتياطية: ${result.errors[0] || 'فشل التحقق من السلامة'}`,
        'info'
      );
      return;
    }

    setTerms(state.terms);
    setSentences(state.sentences);
    setTopics(state.topics);
    setCustomAffixes(state.customAffixes);
    setCustomAbbreviations(state.customAbbreviations);
    setStudyStats(state.studyStats);
    setVersionMetadata(state.versionMetadata);
    setOnlineUpdateStatus((prev) => ({
      ...prev,
      installedDataVersion: state.versionMetadata.dataVersion,
      message: `تم الاسترجاع الذري بنجاح إلى الإصدار ${state.versionMetadata.dataVersion}.`
    }));
    setLastBackupTime(`استرجاع ذري (${state.versionMetadata.dataVersion})`);
    showToast(
      `تم الاسترجاع الذري للإصدار ${result.restoredDataVersion} مع الحفاظ على المفضلة وتقدم الدراسة`
    );
  };

  const handleRollbackToPreviousVersion = async () => {
    const { result, state } = await rollbackToPreviousDataVersion();
    if (!result.success) {
      showToast(`تعذر التراجع للإصدار السابق: ${result.errors[0] || ''}`, 'info');
      return;
    }

    setTerms(state.terms);
    setSentences(state.sentences);
    setTopics(state.topics);
    setCustomAffixes(state.customAffixes);
    setCustomAbbreviations(state.customAbbreviations);
    setStudyStats(state.studyStats);
    setVersionMetadata(state.versionMetadata);
    setOnlineUpdateStatus((prev) => ({
      ...prev,
      installedDataVersion: state.versionMetadata.dataVersion,
      message: `تم التراجع بنجاح إلى الإصدار السابق (${state.versionMetadata.dataVersion}).`
    }));
    setLastBackupTime(`تراجع للإصدار ${state.versionMetadata.dataVersion}`);
    showToast(
      `تم التراجع بنجاح من ${result.previousDataVersion} إلى ${result.restoredDataVersion} (بصمة SHA-256 موثقة)`
    );
  };

  const handleDeleteBackupById = (backupId: string) => {
    const next = deleteBackupRecord(backupId);
    setBackupHistory(next);
    showToast('تم حذف النسخة الاحتياطية من السجل المحلي', 'info');
  };

  const handleToggleSimulatedOffline = () => {
    setSimulatedOffline((prev) => {
      const next = !prev;
      if (next) {
        setOnlineUpdateStatus((st) => ({
          ...st,
          phase: 'offline',
          progressPercent: null,
          message:
            'تم تفعيل محاكاة انقطاع الشبكة (Offline Mode): البحث والمترجم السريري والنسخ الاحتياطي يعملون محلياً 100%.'
        }));
        showToast(
          'تم تفعيل وضع عدم الاتصال (Offline Mode): جميع المحركات المحلية تعمل بكفاءة 100%',
          'info'
        );
      } else {
        setOnlineUpdateStatus((st) => ({
          ...st,
          phase: 'idle',
          message: 'تمت استعادة الاتصال بالشبكة: جاهز لفحص التحديثات السحابية.'
        }));
        showToast('تمت استعادة وضع الاتصال بالشبكة (Online Mode)');
      }
      return next;
    });
  };

  // Safe IndexedDB Migration on startup
  useEffect(() => {
    void runSafeIndexedDbMigration().then((report) => {
      if (report.migrated) {
        console.log('[IndexedDB] Safe migration completed:', report.counts);
      }
    });
  }, []);

  // Sync terms and sentences into IndexedDB stores in background
  useEffect(() => {
    void putAllInStore(IDB_STORES.TERMS, terms);
  }, [terms]);

  useEffect(() => {
    void putAllInStore(IDB_STORES.SENTENCES, sentences);
  }, [sentences]);

  // Sync simulatedOffline flag with Unified Cloud Library Sync Engine (NEVER auto-download remote data)
  useEffect(() => {
    setCloudSyncSimulatedOffline(simulatedOffline);
    if (!simulatedOffline) {
      void processCloudSyncQueue();
    }
  }, [simulatedOffline]);

  // Flush outgoing user upload queue on connectivity restoration (no automatic cloud data download)
  useEffect(() => {
    const flushUploadQueueIfOnline = () => {
      if (simulatedOffline) return;
      void processCloudSyncQueue();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', flushUploadQueueIfOnline);
    }

    const retryInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (simulatedOffline) return;
      void processCloudSyncQueue();
    }, 30 * 1000);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', flushUploadQueueIfOnline);
      }
      clearInterval(retryInterval);
    };
  }, [simulatedOffline]);

  // Periodic Telegram Auto-Backup Check (Runs on startup and every minute)
  useEffect(() => {
    const checkScheduledBackup = async () => {
      const cfg = loadTelegramBackupConfig();
      if (!simulatedOffline && isTelegramScheduledBackupDue(cfg)) {
        const res = await sendBackupToTelegram(
          cfg,
          terms,
          sentences,
          topics,
          `نسخ دوري تلقائي (${cfg.schedule})`,
          studyStats,
          versionMetadata
        );
        if (res.ok && res.summary) {
          const fresh = loadTelegramBackupConfig();
          setTelegramConfig((prev) => ({
            ...prev,
            ...fresh,
            botToken: fresh.botToken || prev.botToken || cfg.botToken,
            chatId: fresh.chatId || prev.chatId || cfg.chatId
          }));
          setLastImportedOrCopiedSummary(res.summary);
          setLastBackupTime('تلقائي إلى تليجرام');
        }
      }
    };
    const initTimer = setTimeout(() => {
      void checkScheduledBackup();
    }, 4000);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void checkScheduledBackup();
    }, 60 * 1000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(interval);
    };
  }, [simulatedOffline, terms, sentences, topics, studyStats, versionMetadata]);

  const latestDataRef = useRef({
    terms,
    sentences,
    topics,
    studyStats,
    versionMetadata,
    simulatedOffline
  });

  useEffect(() => {
    latestDataRef.current = {
      terms,
      sentences,
      topics,
      studyStats,
      versionMetadata,
      simulatedOffline
    };
  }, [terms, sentences, topics, studyStats, versionMetadata, simulatedOffline]);

  const inferTelegramChangeAction = (reason: string): TelegramChangeAction => {
    if (reason.includes('حذف')) return 'delete';
    if (reason.includes('إضافة') || reason.includes('إنشاء') || reason.includes('جديد')) {
      return 'add';
    }
    if (reason.includes('استيراد') || reason.includes('دمج')) return 'import';
    return 'update';
  };

  const triggerTelegramAutoSync = (
    reason: string,
    overrides?: {
      terms?: DictionaryTerm[];
      sentences?: LinkedSentence[];
      topics?: TopicArticle[];
      studyStats?: { gotIt: number; needsReview: number };
      versionMetadata?: VersionMetadata;
      action?: TelegramChangeAction;
      skipChangeNote?: boolean;
    }
  ) => {
    const cfg = loadTelegramBackupConfig();
    if (latestDataRef.current.simulatedOffline) return;
    if (!cfg.botToken.trim() || !cfg.chatId.trim()) return;

    // 1. Always publish debounced instant change notes when enabled (even in scheduled mode)
    if (cfg.sendInstantChangeNotes !== false && !overrides?.skipChangeNote) {
      scheduleDebouncedTelegramChangeNote({
        action: overrides?.action || inferTelegramChangeAction(reason),
        label: reason,
        getTerms: () => overrides?.terms ?? latestDataRef.current.terms,
        getSentences: () => overrides?.sentences ?? latestDataRef.current.sentences,
        getTopics: () => overrides?.topics ?? latestDataRef.current.topics,
        debounceMs: 2200
      });
    }

    // 2. Full backup upload on change ONLY when schedule is 'on_change' and mode isn't scheduled-only
    if (
      !cfg.enabled ||
      cfg.schedule !== 'on_change' ||
      cfg.backupMode === 'notes_and_scheduled_full'
    ) {
      return;
    }

    scheduleDebouncedTelegramAutoSync({
      getTerms: () => overrides?.terms ?? latestDataRef.current.terms,
      getSentences: () => overrides?.sentences ?? latestDataRef.current.sentences,
      getTopics: () => overrides?.topics ?? latestDataRef.current.topics,
      getStudyStats: () => overrides?.studyStats ?? latestDataRef.current.studyStats,
      getVersionMetadata: () => overrides?.versionMetadata ?? latestDataRef.current.versionMetadata,
      triggerReason: reason,
      debounceMs: 3500,
      onSyncCompleted: (res) => {
        if (res.ok && res.summary) {
          const fresh = loadTelegramBackupConfig();
          setTelegramConfig((prev) => ({
            ...prev,
            ...fresh,
            botToken: fresh.botToken || prev.botToken || cfg.botToken,
            chatId: fresh.chatId || prev.chatId || cfg.chatId
          }));
          setLastImportedOrCopiedSummary(res.summary);
          setLastBackupTime('مزامنة تلقائية لتليجرام');
        }
      }
    });
  };

  const triggerTTS = (text: string, key: string, lang = 'en-US') => {
    const cleanText = text?.trim();
    if (!cleanText || typeof window === 'undefined' ||
        !('speechSynthesis' in window) ||
        typeof SpeechSynthesisUtterance === 'undefined') {
      setSpeakingKey(null);
      showToast('ميزة النطق غير متاحة. تحقق من تثبيت محرك تحويل النص إلى كلام في الجهاز.');
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    setSpeakingKey(key);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;
    const finish = () => setSpeakingKey((current) => current === key ? null : current);
    utterance.onend = finish;
    utterance.onerror = (event) => {
      finish();
      if (event.error !== 'canceled' && event.error !== 'interrupted') {
        showToast('تعذر تشغيل النطق. تحقق من محرك الصوت واللغة في إعدادات Android.');
      }
    };
    try {
      synth.resume();
      window.setTimeout(() => {
        try {
          const voices = synth.getVoices();
          const language = lang.toLowerCase();
          const voice = voices.find((item) => item.lang.toLowerCase() === language) ||
            voices.find((item) => item.lang.toLowerCase().startsWith(language.split('-')[0]));
          if (voice) utterance.voice = voice;
          synth.speak(utterance);
          window.setTimeout(finish, Math.max(8000, Math.min(60000, cleanText.length * 180)));
        } catch {
          finish();
          showToast('فشل بدء النطق الصوتي في بيئة التشغيل الحالية.');
        }
      }, 60);
    } catch {
      finish();
      showToast('تعذر الوصول إلى خدمة النطق الصوتي.');
    }
  };

  const copyToClipboard = (text: string, key: string, label = 'تم النسخ إلى الحافظة') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
    } catch {
      // Fallback
    }
    setCopiedId(key);
    showToast(label, 'info');
    setTimeout(() => {
      setCopiedId((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  // Open Contextual Full Term Sheet & Record in Recent Searches
  const openTermDetail = (termId: string) => {
    setSelectedDesktopTermId(termId);
    setDetailTermId(termId);
    setDetailHistory((prev) => [...prev, termId]);
    setPreviewTerm(null);
    setRecentTermIds((prev) => {
      const next = [termId, ...prev.filter((id) => id !== termId)].slice(0, 15);
      try {
        window.localStorage.setItem('umed2_recent_searched_terms_v1', JSON.stringify(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  const handleRemoveRecentTerm = (termId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecentTermIds((prev) => {
      const next = prev.filter((id) => id !== termId);
      try {
        window.localStorage.setItem('umed2_recent_searched_terms_v1', JSON.stringify(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };

  const handleClearRecentTerms = () => {
    setRecentTermIds([]);
    try {
      window.localStorage.setItem('umed2_recent_searched_terms_v1', JSON.stringify([]));
    } catch {
      // ignore storage error
    }
    showToast('تم مسح سجل المصطلحات المبحوث عنها مؤخراً', 'info');
  };

  const handleBackInDetailSheet = () => {
    if (detailHistory.length > 1) {
      const nextHistory = detailHistory.slice(0, -1);
      setDetailHistory(nextHistory);
      setDetailTermId(nextHistory[nextHistory.length - 1]);
    } else {
      setDetailTermId(null);
      setDetailHistory([]);
    }
  };

  const closeDetailSheet = () => {
    setDetailTermId(null);
    setDetailHistory([]);
  };

  const toggleFavoriteTerm = (termId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTerms((prev) => {
      const next = prev.map((item) => {
        if (item.id === termId) {
          const nextFav = !item.favorite;
          showToast(
            nextFav
              ? `تم حفظ "${item.term}" في المفضلة`
              : `تمت إزالة "${item.term}" من المفضلة`,
            'info'
          );
          return { ...item, favorite: nextFav };
        }
        return item;
      });
      triggerTelegramAutoSync('تحديث المفضلة (مصطلح)', { terms: next });
      return next;
    });
  };

  const toggleFavoriteSentence = (sentenceId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSentences((prev) => {
      const next = prev.map((s) => {
        if (s.id === sentenceId) {
          const nextFav = !s.favorite;
          showToast(
            nextFav
              ? 'تم حفظ الجملة السياقية في المفضلة والمراجعة'
              : 'تمت إزالة الجملة السياقية من المفضلة',
            'info'
          );
          return { ...s, favorite: nextFav };
        }
        return s;
      });
      triggerTelegramAutoSync('تحديث المفضلة (جملة)', { sentences: next });
      return next;
    });
  };

  const handleSaveTopic = (topic: TopicArticle, isEdit: boolean) => {
    if (isEdit) {
      const previousTopic = topics.find((t) => t.id === topic.id);
      if (previousTopic) {
        const nextMediaKeys = new Set<string>();
        for (const sec of topic.sections) {
          for (const blk of sec.contentBlocks || []) {
            if (blk.mediaIdbKey) nextMediaKeys.add(blk.mediaIdbKey);
          }
        }
        const removedKeys: string[] = [];
        for (const sec of previousTopic.sections) {
          for (const blk of sec.contentBlocks || []) {
            if (blk.mediaIdbKey && !nextMediaKeys.has(blk.mediaIdbKey)) {
              removedKeys.push(blk.mediaIdbKey);
            }
          }
        }
        if (removedKeys.length > 0) {
          void deleteLocalMediaRecordsByKeys(removedKeys);
        }
      }
    }

    const nextTopicsSnapshot = isEdit
      ? topics.map((t) => (t.id === topic.id ? topic : t))
      : [topic, ...topics];

    setTopics(nextTopicsSnapshot);
    void enqueueEntitiesForCloudSync({ topics: [topic] });
    triggerTelegramAutoSync(
      isEdit ? `تعديل موضوع: ${topic.title}` : `إضافة موضوع: ${topic.title}`,
      { topics: nextTopicsSnapshot }
    );
    showToast(
      isEdit
        ? `تم حفظ التعديلات على الموضوع "${topic.title}"`
        : `تم نشر الموضوع الجديد "${topic.title}" بنجاح`
    );
  };

  const handleDeleteTopic = (topicId: string) => {
    const target = topics.find((t) => t.id === topicId);
    if (target) {
      const keysToDelete: string[] = [];
      for (const sec of target.sections) {
        for (const blk of sec.contentBlocks || []) {
          if (blk.mediaIdbKey) {
            keysToDelete.push(blk.mediaIdbKey);
          }
        }
      }
      if (keysToDelete.length > 0) {
        void deleteLocalMediaRecordsByKeys(keysToDelete);
      }
      void deleteLocalMediaRecordsByTopicId(topicId);
    }
    const nextTopicsSnapshot = topics.filter((t) => t.id !== topicId);
    setTopics(nextTopicsSnapshot);
    if (target) {
      triggerTelegramAutoSync(`حذف موضوع: ${target.title}`, { topics: nextTopicsSnapshot });
      showToast(`تم حذف الموضوع "${target.title}" ووسائطه المحلية`);
    }
  };

  const toggleFavoriteTopic = (topicId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTopics((prev) => {
      const next = prev.map((tp) => {
        if (tp.id === topicId) {
          const nextFav = !tp.favorite;
          showToast(
            nextFav
              ? `تم حفظ الموضوع "${tp.title}" في المفضلة`
              : `تمت إزالة الموضوع من المفضلة`,
            'info'
          );
          return { ...tp, favorite: nextFav };
        }
        return tp;
      });
      triggerTelegramAutoSync('تحديث المفضلة (موضوع)', { topics: next });
      return next;
    });
  };

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      All: terms.length,
      Medical: 0,
      AI: 0,
      Programming: 0,
      General: 0
    };
    terms.forEach((t) => {
      if (counts[t.category] !== undefined) counts[t.category] += 1;
    });
    return counts;
  }, [terms]);

  // Active term for the contextual detail modal or desktop side inspector
  const activeDetailTerm = useMemo(
    () => terms.find((t) => t.id === (detailTermId || selectedDesktopTermId)) || terms[0],
    [terms, detailTermId, selectedDesktopTermId]
  );

  const termOfDay = useMemo(
    () => terms.find((t) => t.id === termOfDayId) || terms[0],
    [terms, termOfDayId]
  );

  const shuffleTermOfDay = () => {
    if (!termOfDay) return;
    const specializedPool = terms.filter(
      (t) => t.id !== termOfDay.id && isLinkableSpecializedTerm(t)
    );
    const pool =
      specializedPool.length > 0
        ? specializedPool
        : terms.filter((t) => t.id !== termOfDay.id);
    if (pool.length > 0) {
      const randomPick = pool[Math.floor(Math.random() * pool.length)];
      setTermOfDayId(randomPick.id);
    }
  };

  const termLookupMap = useMemo(() => {
    const map: Record<string, DictionaryTerm & { aliasName?: string }> = {};
    terms.forEach((t) => {
      if (!isLinkableSpecializedTerm(t)) return;
      map[t.term.toLowerCase()] = t;
    });
    Object.entries(EXTRA_LINKABLE_ALIASES).forEach(([alias, targetId]) => {
      const found = terms.find((t) => t.id === targetId);
      if (found && isLinkableSpecializedTerm(found)) {
        map[alias.toLowerCase()] = {
          ...found,
          aliasName: alias
        };
      }
    });
    return map;
  }, [terms]);

  const autoLinkRegex = useMemo(() => {
    const keys = Object.keys(termLookupMap)
      .filter((k) => k.length >= 4)
      .sort((a, b) => b.length - a.length);
    if (keys.length === 0) return null;
    return new RegExp(
      `(?<![a-zA-Z])(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![a-zA-Z])`,
      'gi'
    );
  }, [termLookupMap]);

  const renderAutoLinkedText = (text: string, currentTermId?: string) => {
    if (!autoLinkRegex) return text;
    const segments = text.split(autoLinkRegex);

    return segments.map((seg, index) => {
      const matched = termLookupMap[seg.toLowerCase()];
      if (matched && matched.id !== currentTermId) {
        return (
          <span
            key={`${seg}-${index}`}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setPreviewTerm(matched);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                setPreviewTerm(matched);
              }
            }}
            className="inline text-emerald-600 dark:text-emerald-400 underline decoration-dotted decoration-emerald-500/70 underline-offset-4 hover:text-emerald-500 transition-colors cursor-pointer"
          >
            {seg}
          </span>
        );
      }
      return <span key={index}>{seg}</span>;
    });
  };

  // Bidirectional Knowledge Linker (Term <-> Sentence Graph + Co-occurrence Suggestions)
  const bidirectionalGraph = useMemo(
    () => syncBidirectionalLinks(terms, sentences),
    [terms, sentences]
  );

  const concordanceMatches = useMemo(() => {
    if (!activeDetailTerm) return [];
    const directExampleSet = new Set(
      (Array.isArray(activeDetailTerm.examples) ? activeDetailTerm.examples : []).map((e) =>
        e.en.trim().toLowerCase()
      )
    );
    const occurrences =
      bidirectionalGraph.termToSentencesMap[activeDetailTerm.id] || [];

    return occurrences
      .filter((occ) => !directExampleSet.has(occ.en.trim().toLowerCase()))
      .map((occ) => ({
        sourceTermId: occ.sourceTermId || activeDetailTerm.id,
        sourceTerm: occ.sourceLabel,
        sourceTranslation: occ.specialty || 'سياق مترابط',
        en: occ.en,
        ar: occ.ar
      }));
  }, [bidirectionalGraph, activeDetailTerm]);

  const activeTermSuggestedRelations = useMemo(() => {
    if (!activeDetailTerm) return [];
    const existingSet = new Set(
      [
        ...(activeDetailTerm.relations.synonyms || []),
        ...(activeDetailTerm.relations.broader || []),
        ...(activeDetailTerm.relations.related || [])
      ].map((r) => r.toLowerCase())
    );
    const suggestions =
      bidirectionalGraph.suggestedRelationsMap[activeDetailTerm.id] || [];
    return suggestions.filter(
      (s) => !existingSet.has(s.relatedTerm.toLowerCase())
    );
  }, [bidirectionalGraph, activeDetailTerm]);

  const handleGraphChipClick = (label: string) => {
    const direct = terms.find((t) => t.term.toLowerCase() === label.toLowerCase());
    if (direct) {
      openTermDetail(direct.id);
      return;
    }
    const aliasTargetId = EXTRA_LINKABLE_ALIASES[label];
    if (aliasTargetId) {
      const target = terms.find((t) => t.id === aliasTargetId);
      if (target) {
        openTermDetail(target.id);
        return;
      }
    }
    closeDetailSheet();
    setSearchQuery(label);
    setSelectedCategory('All');
    setSearchScope('all');
    setActiveTab('home');
  };

  const handleUpdateTerm = (updatedTerm: DictionaryTerm) => {
    setTerms((prevTerms) => {
      const replaced = prevTerms.map((item) =>
        item.id === updatedTerm.id ? updatedTerm : item
      );
      const nextTerms = autoEnrichTermRelations(updatedTerm, replaced);
      const syncedSentences = syncTermExamplesToSentences(nextTerms, sentences);
      setSentences(syncedSentences);
      triggerTelegramAutoSync(`تعديل مصطلح: ${updatedTerm.term}`, {
        terms: nextTerms,
        sentences: syncedSentences
      });
      return nextTerms;
    });
    void enqueueEntitiesForCloudSync({ terms: [updatedTerm] });
  };

  const handleDeleteTerm = (termId: string) => {
    const deleted = terms.find((t) => t.id === termId);
    setTerms((prev) => {
      const remaining = prev.filter((t) => t.id !== termId);
      if (selectedDesktopTermId === termId && remaining[0]) {
        setSelectedDesktopTermId(remaining[0].id);
      }
      if (deleted) {
        triggerTelegramAutoSync(`حذف مصطلح: ${deleted.term}`, { terms: remaining });
      }
      return remaining;
    });
    closeDetailSheet();
    if (deleted) {
      showToast(`تم حذف المصطلح "${deleted.term}" من قاعدة البيانات`);
    }
  };

  const handleAddSentenceToTerm = (termId: string, example: TermExample) => {
    let updatedTargetTerm: DictionaryTerm | null = null;
    setTerms((prevTerms) => {
      let targetTerm: DictionaryTerm | null = null;
      const replaced = prevTerms.map((t) => {
        if (t.id === termId) {
          targetTerm = {
            ...t,
            examples: [example, ...t.examples]
          };
          updatedTargetTerm = targetTerm;
          return targetTerm;
        }
        return t;
      });
      const nextTerms = targetTerm
        ? autoEnrichTermRelations(targetTerm, replaced)
        : replaced;
      const synced = syncTermExamplesToSentences(nextTerms, sentences);
      setSentences(synced);
      triggerTelegramAutoSync('إضافة جملة سياقية', { terms: nextTerms, sentences: synced });
      return nextTerms;
    });
    if (updatedTargetTerm) {
      void enqueueEntitiesForCloudSync({ terms: [updatedTargetTerm] });
    }
    showToast('تمت إضافة الجملة السياقية للمصطلح وربطها بقاعدة الجمل');
  };

  const handleSaveManualTerm = (
    newTerm: DictionaryTerm,
    newLinkedSentences: LinkedSentence[]
  ) => {
    let savedTargetTerm: DictionaryTerm = newTerm;
    setTerms((prevTerms) => {
      const existingIdx = prevTerms.findIndex(
        (t) => t.term.toLowerCase() === newTerm.term.toLowerCase()
      );
      let targetTerm = newTerm;
      let rawNextTerms: DictionaryTerm[];
      if (existingIdx !== -1) {
        const existing = prevTerms[existingIdx];
        rawNextTerms = [...prevTerms];
        targetTerm = {
          ...existing,
          ...newTerm,
          id: existing.id,
          collections: Array.from(
            new Set([...(existing.collections || []), ...(newTerm.collections || [])])
          ),
          linkedTopicIds: Array.from(
            new Set([...(existing.linkedTopicIds || []), ...(newTerm.linkedTopicIds || [])])
          ),
          linkedSubjectIds: Array.from(
            new Set([
              ...(existing.linkedSubjectIds || []),
              ...(newTerm.linkedSubjectIds || [])
            ])
          ),
          linkedBlockIds: Array.from(
            new Set([...(existing.linkedBlockIds || []), ...(newTerm.linkedBlockIds || [])])
          )
        };
        rawNextTerms[existingIdx] = targetTerm;
      } else {
        rawNextTerms = [newTerm, ...prevTerms];
      }
      savedTargetTerm = targetTerm;
      const nextTerms = autoEnrichTermRelations(targetTerm, rawNextTerms);
      const combinedSentences = [...newLinkedSentences, ...sentences];
      const synced = syncTermExamplesToSentences(nextTerms, combinedSentences);
      setSentences(synced);
      triggerTelegramAutoSync(`حفظ مصطلح: ${newTerm.term}`, {
        terms: nextTerms,
        sentences: synced
      });
      return nextTerms;
    });
    void enqueueEntitiesForCloudSync({
      terms: [savedTargetTerm],
      sentences: newLinkedSentences
    });
    showToast(`تم حفظ المصطلح "${newTerm.term}" وربطه بشبكة المعرفة`);
  };

  const handleImportTopicsBatch = (incomingTopics: TopicArticle[]): number => {
    if (!Array.isArray(incomingTopics) || incomingTopics.length === 0) return 0;
    const addedTopics = incomingTopics.filter(tp => tp && tp.title && !topics.some(existing =>
      existing.id === tp.id || existing.title.toLowerCase() === tp.title.toLowerCase()
    ));
    const changedExisting = conflictPolicy !== 'ignore' && incomingTopics.some(tp => topics.some(existing =>
      existing.id === tp.id || existing.title.toLowerCase() === tp.title.toLowerCase()
    ));
    const topicIds = addedTopics.map(tp => tp.id);
    const topicHasMediaOrBlocks = addedTopics.some(tp =>
      Boolean(tp.images?.length || tp.attachments?.length || tp.sections?.some(section => Boolean(section.contentBlocks?.length)))
    );
    const hasExistingTopicReferences = terms.some(term => term.linkedTopicIds?.some(id => topicIds.includes(id)));
    if (addedTopics.length || changedExisting) {
      registerImportGroup({
        id: `topics-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: addedTopics[0]?.title || 'مواضيع طبية',
        sourceName: 'استيراد مواضيع',
        sourceType: 'manual-topics',
        createdAt: new Date().toISOString(),
        ids: { topics: topicIds },
        fingerprints: { topics: Object.fromEntries(addedTopics.map(tp => [tp.id, JSON.stringify(tp)])) },
        counts: { topics: addedTopics.length },
        ignoredDuplicates: Math.max(0, incomingTopics.length - addedTopics.length),
        requiresReview: changedExisting || topicHasMediaOrBlocks || hasExistingTopicReferences,
        reviewReason: changedExisting
          ? 'تم تحديث موضوع موجود مسبقاً؛ الحذف الانتقائي معطّل لحماية المحتوى السابق.'
          : topicHasMediaOrBlocks
            ? 'تحتوي المواضيع على وسائط أو كتل محتوى مرتبطة؛ يلزم تنظيف اعتمادياتها قبل الحذف.'
            : hasExistingTopicReferences
              ? 'توجد سجلات سابقة مرتبطة بالمواضيع الجديدة؛ أُوقف الحذف لحماية الروابط.'
              : undefined
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('umed:import-groups-updated'));
    }
    let importedCount = 0;
    setTopics((prev) => {
      const next = [...prev];
      for (const tp of incomingTopics) {
        if (!tp || !tp.title) continue;
        const idx = next.findIndex(
          (existing) =>
            existing.id === tp.id ||
            existing.title.toLowerCase() === tp.title.toLowerCase()
        );
        if (idx !== -1) {
          if (conflictPolicy !== 'ignore') {
            next[idx] = { ...next[idx], ...tp };
            importedCount += 1;
          }
        } else {
          next.unshift(tp);
          importedCount += 1;
        }
      }
      triggerTelegramAutoSync(`استيراد مواضيع (${importedCount})`, { topics: next });
      return next;
    });
    void enqueueEntitiesForCloudSync({ topics: incomingTopics });
    return importedCount;
  };

  const registerUniversalImportGroup = (report: UniversalImportReport, sourceName?: string) => {
    const collect = <T extends { id: string }>(incoming: T[], existing: T[]) => {
      const oldById = new Map(existing.map(item => [item.id, item]));
      const added = incoming.filter(item => !oldById.has(item.id));
      const changedExisting = incoming.some(item => {
        const old = oldById.get(item.id);
        return Boolean(old && JSON.stringify(old) !== JSON.stringify(item));
      });
      return {
        ids: added.map(item => item.id),
        fingerprints: Object.fromEntries(added.map(item => [item.id, JSON.stringify(item)])),
        changedExisting
      };
    };
    const termsGroup = collect(report.updatedTerms, terms);
    const sentencesGroup = collect(report.updatedSentences, sentences);
    const topicsGroup = collect(report.updatedTopics, topics);
    const affixesGroup = collect(report.updatedAffixes, customAffixes);
    const abbreviationsGroup = collect(report.updatedAbbreviations, customAbbreviations);
    const hasExistingChanges = [
      termsGroup, sentencesGroup, topicsGroup, affixesGroup, abbreviationsGroup
    ].some(group => group.changedExisting);
    const ids: Partial<Record<ImportGroupDomain, string[]>> = {
      terms: termsGroup.ids, sentences: sentencesGroup.ids, topics: topicsGroup.ids,
      affixes: affixesGroup.ids, abbreviations: abbreviationsGroup.ids
    };
    const fingerprints: Partial<Record<ImportGroupDomain, Record<string, string>>> = {
      terms: termsGroup.fingerprints, sentences: sentencesGroup.fingerprints,
      topics: topicsGroup.fingerprints, affixes: affixesGroup.fingerprints,
      abbreviations: abbreviationsGroup.fingerprints
    };
    const extendedCounts = report.counts;
    const hasExtendedContent = Boolean(
      extendedCounts.blocks || extendedCounts.subjects || extendedCounts.books ||
      extendedCounts.exams || extendedCounts.questions || extendedCounts.mediaAssets
    );
    const groupId = `universal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    registerImportGroup({
      id: groupId,
      name: sourceName || report.summaryText || 'استيراد محتوى طبي',
      sourceName: sourceName || report.sourceFormat || 'استيراد محتوى طبي',
      sourceType: report.sourceFormat,
      createdAt: new Date().toISOString(),
      ids,
      fingerprints,
      counts: {
        terms: termsGroup.ids.length, sentences: sentencesGroup.ids.length,
        topics: topicsGroup.ids.length, affixes: affixesGroup.ids.length,
        abbreviations: abbreviationsGroup.ids.length,
        blocks: extendedCounts.blocks, subjects: extendedCounts.subjects,
        books: extendedCounts.books, exams: extendedCounts.exams,
        questions: extendedCounts.questions, mediaAssets: extendedCounts.mediaAssets
      },
      ignoredDuplicates: extendedCounts.skippedDuplicates,
      requiresReview: hasExistingChanges || hasExtendedContent,
      reviewReason: hasExistingChanges
        ? 'تضمنت عملية الاستيراد دمجاً أو تحديثاً لسجلات سابقة؛ الحذف الانتقائي معطّل لحماية البيانات الأصلية.'
        : hasExtendedContent
          ? 'تتضمن الدفعة بلوكات أو مواد أو كتباً أو اختبارات أو وسائط؛ يلزم دعم إزالة هذه العناصر واعتمادياتها قبل تفعيل الحذف.'
          : undefined
    });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('umed:import-groups-updated'));
  };

  const handleUniversalImportComplete = (report: UniversalImportReport, sourceName?: string) => {
    if (!report.success) {
      if (report.errors[0]) showToast(report.errors[0], 'info');
      return;
    }
    registerUniversalImportGroup(report, sourceName);
    setTerms(report.updatedTerms);
    setSentences(report.updatedSentences);
    setTopics(report.updatedTopics);
    setCustomAffixes(report.updatedAffixes);
    setCustomAbbreviations(report.updatedAbbreviations);
    setBackupHistory(loadBackupHistory());
    setLastImportedOrCopiedSummary(
      buildConciseDataSummary({
        terms: report.updatedTerms,
        sentences: report.updatedSentences,
        topics: report.updatedTopics,
        sourceLabel: report.summaryText
      })
    );
    triggerTelegramAutoSync(`استيراد شامل: ${report.summaryText}`, {
      terms: report.updatedTerms,
      sentences: report.updatedSentences,
      topics: report.updatedTopics
    });
  };

  const registerFullBackupReviewGroup = (sourceName: string, sourceType: string, counts: Record<string, number>) => {
    registerImportGroup({
      id: `backup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: sourceName || 'نسخة احتياطية كاملة',
      sourceName: sourceName || 'استيراد نسخة احتياطية',
      sourceType,
      createdAt: new Date().toISOString(),
      ids: {},
      counts,
      ignoredDuplicates: 0,
      requiresReview: true,
      reviewReason: 'هذه عملية استعادة/استيراد كاملة قد تستبدل أو تدمج نطاقات متعددة؛ لا يمكن حذف مساهمتها انتقائياً بأمان.'
    });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('umed:import-groups-updated'));
  };

  const handleImportFullBackupJson = (
    rawJson: string,
    options?: { skipTelegramSync?: boolean; sourceName?: string }
  ): boolean => {
    const mode =
      conflictPolicy === 'overwrite'
        ? 'replace'
        : conflictPolicy === 'ignore'
        ? 'ignore'
        : 'merge';

    // Support Unified Backup v2.3 & Granular Export v1
    try {
      const parsed = JSON.parse(rawJson);
      if (
        parsed &&
        typeof parsed === 'object' &&
        (parsed.format === 'umed-unified-backup-v2.3' ||
          parsed.format === 'umed-granular-export-v1')
      ) {
        const inner = parsed.data || {};
        createDataBackupSnapshot({
          trigger: 'manual',
          label: 'نسخ تلقائي قبل الاستيراد أوفلاين'
        });

        if (Array.isArray(inner.blocks) && inner.blocks.length > 0) {
          saveMedicalBlocks(inner.blocks);
        }
        if (Array.isArray(inner.subjects) && inner.subjects.length > 0) {
          saveMedicalSubjects(inner.subjects);
        }
        if (Array.isArray(inner.books) && inner.books.length > 0) {
          const existingBookById = new Map(loadAcademicBooks().map((b) => [b.id, b]));
          const normalizedBooks = inner.books.map((rawBk: Record<string, unknown>) => {
            const nb = normalizeAcademicBookResource(rawBk);
            const prevBk = existingBookById.get(nb.id);
            if (!prevBk) return nb;
            return {
              ...nb,
              favorite: prevBk.favorite ?? nb.favorite,
              bookmarks: prevBk.bookmarks?.length ? prevBk.bookmarks : nb.bookmarks,
              lastReadPage: prevBk.lastReadPage ?? nb.lastReadPage,
              readingProgressPercent:
                prevBk.readingProgressPercent ?? nb.readingProgressPercent,
              notes: prevBk.notes ?? nb.notes,
              mediaIdbKey: prevBk.mediaIdbKey || nb.mediaIdbKey,
              coverIdbKey: prevBk.coverIdbKey || nb.coverIdbKey
            };
          });
          saveAcademicBooks(normalizedBooks);
        }
        if (Array.isArray(inner.exams) && inner.exams.length > 0) {
          saveAcademicExams(inner.exams);
        }
        if (Array.isArray(inner.mediaAssets) && inner.mediaAssets.length > 0) {
          saveMediaAssetsIndex(inner.mediaAssets);
        }
        if (Array.isArray(inner.userNotes) && inner.userNotes.length > 0) {
          const notesMap = new Map(loadUserStudyNotes().map((n) => [n.id, n]));
          for (const incomingNote of inner.userNotes) {
            if (!incomingNote || !incomingNote.id) continue;
            const prevNote = notesMap.get(incomingNote.id);
            if (!prevNote || (incomingNote.updatedAt || '') > (prevNote.updatedAt || '')) {
              notesMap.set(incomingNote.id, incomingNote);
            }
          }
          saveUserStudyNotes(Array.from(notesMap.values()));
        }
        if (Array.isArray(inner.customAffixes) && inner.customAffixes.length > 0) {
          setCustomAffixes((prev) => {
            if (mode === 'replace') return inner.customAffixes;
            const map = new Map(prev.map((a) => [a.id || a.cleanKey, a]));
            for (const item of inner.customAffixes) {
              if (!item) continue;
              const k = item.id || item.cleanKey;
              if (mode === 'ignore' && map.has(k)) continue;
              map.set(k, item);
            }
            return Array.from(map.values());
          });
        }
        if (Array.isArray(inner.customAbbreviations) && inner.customAbbreviations.length > 0) {
          setCustomAbbreviations((prev) => {
            if (mode === 'replace') return inner.customAbbreviations;
            const map = new Map(prev.map((a) => [a.id || a.abbr.toLowerCase(), a]));
            for (const item of inner.customAbbreviations) {
              if (!item || !item.abbr) continue;
              const k = item.id || item.abbr.toLowerCase();
              if (mode === 'ignore' && map.has(k)) continue;
              map.set(k, item);
            }
            return Array.from(map.values());
          });
        }
        if (Array.isArray(inner.quizQuestions || inner.questions)) {
          const qArr = inner.quizQuestions || inner.questions;
          if (qArr.length > 0) saveQuizQuestions(qArr);
        }
        if (Array.isArray(inner.quizAttempts) && inner.quizAttempts.length > 0) {
          saveQuizAttempts(inner.quizAttempts);
        }
        if (inner.studyStats && typeof inner.studyStats === 'object') {
          setStudyStats((prev) => ({
            gotIt: Math.max(prev.gotIt, Number(inner.studyStats.gotIt) || 0),
            needsReview: Math.max(prev.needsReview, Number(inner.studyStats.needsReview) || 0)
          }));
        }
        if (Array.isArray(inner.terms) && inner.terms.length > 0) {
          setTerms((prev) => {
            if (mode === 'replace') return inner.terms;
            const map = new Map(prev.map((t) => [t.term.toLowerCase(), t]));
            for (const t of inner.terms) {
              if (t && t.term) {
                const key = t.term.toLowerCase();
                if (mode === 'ignore' && map.has(key)) continue;
                map.set(key, t);
              }
            }
            return Array.from(map.values());
          });
        }
        if (Array.isArray(inner.sentences) && inner.sentences.length > 0) {
          setSentences((prev) => {
            if (mode === 'replace') return inner.sentences;
            const map = new Map(prev.map((s) => [s.en.trim().toLowerCase(), s]));
            for (const s of inner.sentences) {
              if (s && s.en) {
                const key = s.en.trim().toLowerCase();
                if (mode === 'ignore' && map.has(key)) continue;
                map.set(key, s);
              }
            }
            return Array.from(map.values());
          });
        }
        if (Array.isArray(inner.topics) && inner.topics.length > 0) {
          handleImportTopicsBatch(inner.topics);
        } else if (
          (Array.isArray(inner.blocks) && inner.blocks.length > 0) ||
          (Array.isArray(inner.subjects) && inner.subjects.length > 0) ||
          (Array.isArray(inner.books) && inner.books.length > 0)
        ) {
          // Trigger TopicsHub hierarchy sync from localStorage
          setTopics((prev) => [...prev]);
        }

        const summary = buildConciseDataSummary({
          terms: Array.isArray(inner.terms) ? inner.terms : terms,
          sentences: Array.isArray(inner.sentences) ? inner.sentences : sentences,
          topics: Array.isArray(inner.topics) ? inner.topics : topics,
          blocks: Array.isArray(inner.blocks) ? inner.blocks : undefined,
          subjects: Array.isArray(inner.subjects) ? inner.subjects : undefined,
          books: Array.isArray(inner.books) ? inner.books : undefined,
          exams: Array.isArray(inner.exams) ? inner.exams : undefined,
          sourceLabel: 'استيراد نسخة احتياطية أوفلاين',
          rawSizeBytes: new Blob([rawJson]).size
        });
        setLastImportedOrCopiedSummary(summary);
        setBackupHistory(loadBackupHistory());
        if (!options?.skipTelegramSync) {
          triggerTelegramAutoSync('استيراد نسخة احتياطية', {
            terms: Array.isArray(inner.terms) ? inner.terms : undefined,
            sentences: Array.isArray(inner.sentences) ? inner.sentences : undefined,
            topics: Array.isArray(inner.topics) ? inner.topics : undefined
          });
        }
        showToast(`تم استيراد النسخة أوفلاين بنجاح (${summary.shortText})`);
        registerFullBackupReviewGroup(options?.sourceName || 'نسخة احتياطية أوفلاين', parsed.format, {
          terms: Array.isArray(inner.terms) ? inner.terms.length : 0,
          sentences: Array.isArray(inner.sentences) ? inner.sentences.length : 0,
          topics: Array.isArray(inner.topics) ? inner.topics.length : 0,
          blocks: Array.isArray(inner.blocks) ? inner.blocks.length : 0,
          subjects: Array.isArray(inner.subjects) ? inner.subjects.length : 0,
          books: Array.isArray(inner.books) ? inner.books.length : 0,
          exams: Array.isArray(inner.exams) ? inner.exams.length : 0,
          mediaAssets: Array.isArray(inner.mediaAssets) ? inner.mediaAssets.length : 0,
          questions: Array.isArray(inner.quizQuestions || inner.questions) ? (inner.quizQuestions || inner.questions).length : 0
        });
        return true;
      }
    } catch {
      // Continue to standard importFullDatabaseJson
    }

    const importResult = importFullDatabaseJson(rawJson, mode);
    if (importResult.success && importResult.state) {
      setTerms(importResult.state.terms);
      setSentences(importResult.state.sentences);
      setTopics(importResult.state.topics);
      setCustomAffixes(importResult.state.customAffixes);
      setCustomAbbreviations(importResult.state.customAbbreviations);
      setStudyStats(importResult.state.studyStats);
      setVersionMetadata(importResult.state.versionMetadata);
      const summary = buildConciseDataSummary({
        terms: importResult.state.terms,
        sentences: importResult.state.sentences,
        topics: importResult.state.topics,
        sourceLabel: 'استيراد قاعدة بيانات كاملة',
        rawSizeBytes: new Blob([rawJson]).size
      });
      setLastImportedOrCopiedSummary(summary);
      setBackupHistory(loadBackupHistory());
      if (!options?.skipTelegramSync) {
        triggerTelegramAutoSync('استيراد قاعدة بيانات كاملة', {
          terms: importResult.state.terms,
          sentences: importResult.state.sentences,
          topics: importResult.state.topics,
          studyStats: importResult.state.studyStats,
          versionMetadata: importResult.state.versionMetadata
        });
      }
      showToast(`تم استيراد البيانات بنجاح (${summary.shortText})`);
      registerFullBackupReviewGroup(options?.sourceName || 'قاعدة بيانات كاملة', 'full-database-json', {
        terms: importResult.state.terms.length,
        sentences: importResult.state.sentences.length,
        topics: importResult.state.topics.length,
        affixes: importResult.state.customAffixes.length,
        abbreviations: importResult.state.customAbbreviations.length
      });
      return true;
    }
    if (importResult.error) {
      showToast(`تعذر الاستيراد: ${importResult.error}`, 'info');
    }
    return false;
  };

  const handleImportPackageFile = async (file: File) => {
    const lowerName = file.name.toLowerCase();

    // If JSON / JSONL / CSV / TSV / TXT / MD, first try universal AI/UMEDT-DATA parser and legacy unified parsers
    if (
      lowerName.endsWith('.json') ||
      lowerName.endsWith('.jsonl') ||
      lowerName.endsWith('.csv') ||
      lowerName.endsWith('.tsv') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.umedpack')
    ) {
      try {
        const parsedFile = await parseUploadedFile(file);
        const text = parsedFile.extractedText.trim();
        if (text) {
          const universalReport = importUniversalAiOrLocalContent({
            rawText: text,
            conflictPolicy,
            sourceLabel: file.name
          });
          if (universalReport.success) {
            handleUniversalImportComplete(universalReport, file.name);
            showToast(`تم استيراد الملف (${file.name}): ${universalReport.summaryText}`);
            return;
          }
          if (text.startsWith('{') || text.startsWith('[')) {
            const ok = handleImportFullBackupJson(text, { sourceName: file.name });
            if (ok) return;
          }
        }
      } catch {
        // Fallback to executeAtomicPackageImport or universal ZIP reader below
      }
    }

    const mode =
      conflictPolicy === 'overwrite'
        ? 'replace'
        : conflictPolicy === 'ignore'
        ? 'ignore'
        : 'merge';
    const { result, state } = await executeAtomicPackageImport(file, {
      mode,
      fileNameHint: file.name
    });

    if (!result.success) {
      const combinedErrText = (result.errors || []).join(' ');
      const isSecurityOrRollbackFailure =
        result.rolledBack ||
        /حماية|Zip Bomb|Zip Slip|تنفيذي|SQLite|CRC-32|SHA-256|برمجي|محظور/i.test(
          combinedErrText
        );

      // Fallback: if this is an AI-generated .zip without manifest.json (and NOT a security/rollback rejection), parse via importUniversalZipArchiveBytes
      if (
        !isSecurityOrRollbackFailure &&
        (lowerName.endsWith('.zip') || lowerName.endsWith('.umedpack'))
      ) {
        try {
          const zipBytes = new Uint8Array(await file.arrayBuffer());
          const zipReport = importUniversalZipArchiveBytes(zipBytes, {
            conflictPolicy,
            sourceLabel: file.name
          });
          if (zipReport.success) {
            handleUniversalImportComplete(zipReport, file.name);
            showToast(`تم استيراد الأرشيف (${file.name}): ${zipReport.summaryText}`);
            return;
          }
        } catch {
          // Ignore and show original error below
        }
      }
      const firstErr = result.errors[0] || 'حزمة البيانات غير صالحة.';
      showToast(`تعذر استيراد الحزمة: ${firstErr}`, 'info');
      return;
    }

    setTerms(state.terms);
    setSentences(state.sentences);
    setTopics(state.topics);
    setCustomAffixes(state.customAffixes);
    setCustomAbbreviations(state.customAbbreviations);
    setStudyStats(state.studyStats);
    setVersionMetadata(state.versionMetadata);
    setBackupHistory(loadBackupHistory());
    setLastBackupTime('نسخ تلقائي قبل الاستيراد');

    const summary = buildConciseDataSummary({
      terms: state.terms,
      sentences: state.sentences,
      topics: state.topics,
      sourceLabel: `مستورد من ${file.name}`,
      rawSizeBytes: file.size
    });
    setLastImportedOrCopiedSummary(summary);
    triggerTelegramAutoSync(`استيراد حزمة (${file.name})`, {
      terms: state.terms,
      sentences: state.sentences,
      topics: state.topics,
      studyStats: state.studyStats,
      versionMetadata: state.versionMetadata
    });

    const mediaSummarySuffix =
      result.summary.mediaFilesImported || result.summary.mediaFilesSkipped
        ? ` · الوسائط: ${result.summary.mediaFilesImported || 0} مستوردة، ${result.summary.mediaFilesSkipped || 0} متجاهلة`
        : '';
    showToast(`تم استيراد الحزمة بنجاح (${summary.shortText}${mediaSummarySuffix})`);
  };

  const handleCommitBatch = ({
    stagedTerms,
    stagedSentences: incomingSentences,
    termExampleEnhancements = [],
    incomingAffixes = [],
    incomingAbbreviations = [],
    stayOnCurrentTab = false
  }: {
    stagedTerms: StagedTermItem[];
    stagedSentences: LinkedSentence[];
    termExampleEnhancements?: Array<{
      termId: string;
      example: { en: string; ar: string };
    }>;
    incomingAffixes?: MorphologicalAffix[];
    incomingAbbreviations?: ClinicalAbbreviation[];
    stayOnCurrentTab?: boolean;
  }) => {
    const createdTermsByKey = new Map<string, DictionaryTerm>();
    for (const staged of stagedTerms) {
      const key = staged.term.trim().toLowerCase();
      if (!key || terms.some(existing => existing.term.toLowerCase() === key) || createdTermsByKey.has(key)) continue;
      createdTermsByKey.set(key, {
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        term: staged.term,
        termNormalized: key,
        translation: staged.translation,
        phonetic: staged.phonetic,
        pos: staged.pos,
        category: staged.category,
        umdCode: staged.umdCode,
        keepEnglish: true,
        favorite: false,
        collections: ['مستورد حديثاً'],
        ingestedAt: 'الآن · الذكاء الاصطناعي المباشر',
        definitionAr: staged.definitionAr,
        definitionEn: staged.definitionEn,
        examples: Array.isArray(staged.examples) ? staged.examples : [],
        relations: staged.relations
      });
    }
    const incomingNewSentences = incomingSentences.filter(item => !sentences.some(existing => existing.id === item.id));
    const incomingNewAffixes = incomingAffixes.filter(item => !customAffixes.some(existing => existing.cleanKey.toLowerCase() === item.cleanKey.toLowerCase()));
    const incomingNewAbbreviations = incomingAbbreviations.filter(item => !customAbbreviations.some(existing => existing.abbr.toLowerCase() === item.abbr.toLowerCase()));
    const hasExistingChanges = termExampleEnhancements.length > 0 ||
      (conflictPolicy !== 'ignore' && stagedTerms.some(staged => terms.some(existing => existing.term.toLowerCase() === staged.term.toLowerCase())));

    let addedCount = 0;
    let updatedCount = 0;

    if (incomingAffixes.length > 0) {
      setCustomAffixes((prev) => {
        const next = [...prev];
        incomingAffixes.forEach((aff) => {
          if (!next.some((a) => a.cleanKey.toLowerCase() === aff.cleanKey.toLowerCase())) {
            next.unshift(aff);
          }
        });
        return next;
      });
    }

    if (incomingAbbreviations.length > 0) {
      setCustomAbbreviations((prev) => {
        const next = [...prev];
        incomingAbbreviations.forEach((abbr) => {
          if (!next.some((a) => a.abbr.toLowerCase() === abbr.abbr.toLowerCase())) {
            next.unshift(abbr);
          }
        });
        return next;
      });
    }

    setTerms((prevTerms) => {
      const nextTerms = [...prevTerms];

      termExampleEnhancements.forEach((enh) => {
        const idx = nextTerms.findIndex((t) => t.id === enh.termId);
        if (idx !== -1) {
          const current = nextTerms[idx];
          const curExamples = Array.isArray(current.examples) ? current.examples : [];
          if (
            !curExamples.some(
              (e) => e.en.toLowerCase() === enh.example.en.toLowerCase()
            )
          ) {
            nextTerms[idx] = {
              ...current,
              examples: [...curExamples, enh.example]
            };
            updatedCount += 1;
          }
        }
      });

      stagedTerms.forEach((staged) => {
        const stagedExamples = Array.isArray(staged.examples) ? staged.examples : [];
        const existingIndex = nextTerms.findIndex(
          (t) => t.term.toLowerCase() === staged.term.toLowerCase()
        );

        if (existingIndex !== -1) {
          if (conflictPolicy === 'ignore') return;
          if (conflictPolicy === 'overwrite') {
            nextTerms[existingIndex] = {
              ...nextTerms[existingIndex],
              term: staged.term,
              termNormalized: staged.term.toLowerCase(),
              translation: staged.translation,
              phonetic: staged.phonetic,
              pos: staged.pos,
              category: staged.category,
              umdCode: staged.umdCode || nextTerms[existingIndex].umdCode,
              definitionAr: staged.definitionAr,
              definitionEn: staged.definitionEn,
              examples: stagedExamples,
              relations: staged.relations,
              ingestedAt: 'الآن · تحديث مباشر'
            };
            updatedCount += 1;
          } else if (conflictPolicy === 'merge') {
            const current = nextTerms[existingIndex];
            const mergedExamples = [
              ...(Array.isArray(current.examples) ? current.examples : [])
            ];
            stagedExamples.forEach((ex) => {
              if (!mergedExamples.some((e) => e.en === ex.en)) {
                mergedExamples.push(ex);
              }
            });
            nextTerms[existingIndex] = {
              ...current,
              translation: staged.translation || current.translation,
              definitionAr: staged.definitionAr || current.definitionAr,
              examples: mergedExamples,
              ingestedAt: 'الآن · دمج ذكي'
            };
            updatedCount += 1;
          }
        } else {
          const created = createdTermsByKey.get(staged.term.trim().toLowerCase());
          if (created) nextTerms.unshift(created);
          addedCount += 1;
        }
      });

      const enrichedTerms = autoEnrichAllTermsRelations(nextTerms);
      const combinedSentences = [...incomingSentences, ...sentences];
      const syncedSentences = syncTermExamplesToSentences(
        enrichedTerms,
        combinedSentences
      );
      setSentences(syncedSentences);
      void enqueueEntitiesForCloudSync({
        terms: enrichedTerms.slice(0, Math.max(stagedTerms.length, 1)),
        sentences: incomingSentences
      });
      triggerTelegramAutoSync(`دفعة مستوردة (${addedCount + updatedCount})`, {
        terms: enrichedTerms,
        sentences: syncedSentences
      });
      return enrichedTerms;
    });

    const createdTerms = Array.from(createdTermsByKey.values());
    const ids: Partial<Record<ImportGroupDomain, string[]>> = {
      terms: createdTerms.map(item => item.id),
      sentences: incomingNewSentences.map(item => item.id),
      affixes: incomingNewAffixes.map(item => item.id),
      abbreviations: incomingNewAbbreviations.map(item => item.id)
    };
    const fingerprints: Partial<Record<ImportGroupDomain, Record<string, string>>> = {
      terms: Object.fromEntries(createdTerms.map(item => [item.id, JSON.stringify(item)])),
      sentences: Object.fromEntries(incomingNewSentences.map(item => [item.id, JSON.stringify(item)])),
      affixes: Object.fromEntries(incomingNewAffixes.map(item => [item.id, JSON.stringify(item)])),
      abbreviations: Object.fromEntries(incomingNewAbbreviations.map(item => [item.id, JSON.stringify(item)]))
    };
    if (Object.values(ids).some(list => Boolean(list?.length)) || hasExistingChanges) {
      registerImportGroup({
        id: `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        name: stagedTerms[0]?.category || incomingAffixes[0]?.type || 'مصطلحات طبية',
        sourceName: 'إضافة مصطلحات من المحرر',
        sourceType: 'manual-batch',
        createdAt: new Date().toISOString(),
        ids, fingerprints,
        counts: {
          terms: createdTerms.length, sentences: incomingNewSentences.length,
          affixes: incomingNewAffixes.length, abbreviations: incomingNewAbbreviations.length
        },
        ignoredDuplicates: Math.max(0, stagedTerms.length - createdTerms.length),
        requiresReview: hasExistingChanges,
        reviewReason: hasExistingChanges ? 'تضمنت الدفعة تحديثات أو دمج أمثلة في سجلات موجودة؛ الحذف الانتقائي معطّل لحماية المحتوى السابق.' : undefined
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('umed:import-groups-updated'));
    }

    if (!stayOnCurrentTab) {
      setActiveTab('home');
    }
    const translatorExtras =
      incomingAffixes.length > 0 || incomingAbbreviations.length > 0
        ? ` + ${incomingAffixes.length} جذور صرفية + ${incomingAbbreviations.length} اختصارات للمترجم`
        : '';
    showToast(
      `تم حفظ ${addedCount} مصطلح جديد، وتحديث ${updatedCount}، وإضافة ${incomingSentences.length} جملة${translatorExtras}`
    );
  };

  const favoriteTerms = useMemo(() => terms.filter((t) => t.favorite), [terms]);

  const availableCollections = useMemo(() => {
    const set = new Set<string>(['الكل']);
    favoriteTerms.forEach((t) => {
      (t.collections || []).forEach((c) => set.add(c));
    });
    return Array.from(set);
  }, [favoriteTerms]);

  const handleRecordSm2Review = (
    kind: 'term' | 'sentence',
    id: string,
    updatedSrs: SpacedRepetitionData,
    knewIt: boolean
  ) => {
    if (kind === 'term') {
      setTerms((prev) =>
        prev.map((t) => (t.id === id ? { ...t, srsData: updatedSrs } : t))
      );
    } else {
      setSentences((prev) =>
        prev.map((s) => (s.id === id ? { ...s, srsData: updatedSrs } : s))
      );
    }
    setStudyStats((prev) => ({
      gotIt: knewIt ? prev.gotIt + 1 : prev.gotIt,
      needsReview: !knewIt ? prev.needsReview + 1 : prev.needsReview
    }));
  };

  const dbMetrics = useMemo(() => {
    const termGraphEdges = terms.reduce(
      (acc, t) =>
        acc +
        (t.relations.synonyms?.length || 0) +
        (t.relations.broader?.length || 0) +
        (t.relations.related?.length || 0),
      0
    );
    const sentenceTermLinks = sentences.reduce(
      (acc, s) => acc + (s.linkedTermIds?.length || 0),
      0
    );
    const actualSizeKb = calculateActualDatabaseSizeKb(
      terms,
      sentences,
      [],
      customAbbreviations,
      topics
    );

    return {
      totalTerms: terms.length,
      localLoadedTerms: terms.length,
      totalSentences: sentences.length,
      totalTopics: topics.length,
      totalGraphEdges: termGraphEdges + sentenceTermLinks,
      actualSizeKb
    };
  }, [terms, sentences, customAbbreviations, topics]);

  const currentDataSummary = useMemo(
    () =>
      buildConciseDataSummary({
        terms,
        sentences,
        topics,
        sourceLabel: 'بيانات التطبيق الحالية',
        rawSizeBytes: dbMetrics.actualSizeKb * 1024
      }),
    [terms, sentences, topics, dbMetrics.actualSizeKb]
  );

  const handleUpdateTelegramConfig = (nextConfig: TelegramBackupConfig) => {
    const saved = saveTelegramBackupConfig(nextConfig);
    setTelegramConfig((prev) => ({
      ...prev,
      ...saved,
      botToken: nextConfig.botToken ?? saved.botToken,
      chatId: nextConfig.chatId ?? saved.chatId
    }));
  };

  const handleTriggerTelegramBackupNow = async (overrideConfig?: TelegramBackupConfig) => {
    const activeCfg = overrideConfig
      ? saveTelegramBackupConfig(overrideConfig)
      : saveTelegramBackupConfig(telegramConfig);
    setTelegramConfig(activeCfg);

    const res = await sendBackupToTelegram(
      activeCfg,
      terms,
      sentences,
      topics,
      'نسخة احتياطية فورية',
      studyStats,
      versionMetadata,
      { simulatedOffline }
    );
    if (res.ok && res.summary) {
      const fresh = loadTelegramBackupConfig();
      setTelegramConfig((prev) => ({
        ...prev,
        ...fresh,
        botToken: activeCfg.botToken || fresh.botToken || prev.botToken,
        chatId: activeCfg.chatId || fresh.chatId || prev.chatId
      }));
      setLastImportedOrCopiedSummary(res.summary);
      setLastBackupTime('إلى تليجرام الآن');
      showToast(`تم النسخ الاحتياطي إلى تليجرام (${res.summary.shortText})`);
    }
    return res;
  };

  const handleRestoreFromTelegramNow = async (
    overrideConfig?: TelegramBackupConfig
  ): Promise<{ ok: boolean; message: string }> => {
    const activeCfg = overrideConfig
      ? saveTelegramBackupConfig(overrideConfig)
      : saveTelegramBackupConfig(telegramConfig);
    setTelegramConfig(activeCfg);

    const fetchRes = await fetchLatestBackupPayloadFromTelegram(activeCfg, {
      simulatedOffline
    });
    if (!fetchRes.ok || !fetchRes.bytes) {
      showToast(fetchRes.message, 'info');
      return { ok: false, message: fetchRes.message };
    }

    const mode =
      conflictPolicy === 'overwrite'
        ? 'replace'
        : conflictPolicy === 'ignore'
          ? 'ignore'
          : 'merge';

    const { result, state } = await executeAtomicPackageImport(fetchRes.bytes, {
      mode,
      fileNameHint: fetchRes.fileName || 'UMEDT-Backup.json'
    });

    if (!result.success) {
      const errMsg = result.errors[0] || 'تعذر قراءة ملف النسخة المستلمة من تليجرام.';
      showToast(errMsg, 'info');
      return { ok: false, message: errMsg };
    }

    setTerms(state.terms);
    setSentences(state.sentences);
    setTopics(state.topics);
    setCustomAffixes(state.customAffixes);
    setCustomAbbreviations(state.customAbbreviations);
    setStudyStats(state.studyStats);
    setVersionMetadata(state.versionMetadata);
    setBackupHistory(loadBackupHistory());
    setLastBackupTime('استيراد من تليجرام');

    const summary = buildConciseDataSummary({
      terms: state.terms,
      sentences: state.sentences,
      topics: state.topics,
      sourceLabel: `مستورد من تليجرام (${fetchRes.fileName || 'Backup'})`,
      rawSizeBytes: fetchRes.bytes.byteLength
    });
    setLastImportedOrCopiedSummary(summary);
    const successMsg = `تم استيراد ودمج النسخة من تليجرام بنجاح (${summary.shortText})`;
    showToast(successMsg);
    return { ok: true, message: successMsg };
  };

  const downloadFile = async (filename: string, content: string, mime = 'application/json') => {
    const res = await prepareAndDownloadFile({
      filename,
      content,
      mime
    });
    if (res.initiated) {
      showToast(res.messageAr);
    } else {
      showToast(res.error || 'تعذر تجهيز أو حفظ الملف', 'info');
    }
    return res;
  };

  const handleExportFullBackup = () => {
    const { jsonString, summary } = createUnifiedBackupPackage(
      terms,
      sentences,
      topics,
      'نسخة احتياطية شاملة (JSON)',
      studyStats,
      versionMetadata
    );
    void downloadFile(
      `UMEDT-Backup-${new Date().toISOString().slice(0, 10)}.json`,
      jsonString,
      'application/json;charset=utf-8'
    ).then((res) => {
      if (res.initiated) {
        setLastImportedOrCopiedSummary(summary);
        setLastBackupTime(
          res.verifiedOnDisk ? `محفوظ (${res.savedPath})` : `تنزيل المتصفح (${res.filename})`
        );
      }
    });
  };

  const handleExportZipPackage = () => {
    const zipBytes = exportFullDatabaseZipBytes({
      terms,
      sentences,
      topics,
      customAffixes,
      customAbbreviations,
      studyStats,
      versionMetadata
    });
    const filename = `umed2-data-package-${versionMetadata.dataVersion}.zip`;
    const summary = buildConciseDataSummary({
      terms,
      sentences,
      topics,
      sourceLabel: 'حزمة احتياطية مضغوطة (ZIP)',
      rawSizeBytes: zipBytes.byteLength
    });
    void prepareAndDownloadFile({
      filename,
      content: zipBytes,
      mime: 'application/zip'
    }).then((res) => {
      if (res.initiated) {
        setLastImportedOrCopiedSummary(summary);
        setLastBackupTime(
          res.verifiedOnDisk ? `محفوظ (${res.savedPath})` : `تنزيل المتصفح (${res.filename})`
        );
        showToast(res.messageAr);
      } else {
        showToast(res.error || 'تعذر حفظ حزمة ZIP', 'info');
      }
    });
  };

  const handleShareDataFile = async () => {
    const fullJson = exportFullDatabaseJson({
      terms,
      sentences,
      topics,
      customAffixes,
      customAbbreviations,
      studyStats
    });

    const shareRes = await shareFileWithVerification({
      filename: 'dictengine-umd-full-data.json',
      content: fullJson,
      mime: 'application/json;charset=utf-8',
      title: 'بيانات المعجم الطبي UMEDT',
      text: `نسخة بيانات القاموس الطبي (${terms.length} مصطلح و ${sentences.length} جملة سياقية)`
    });

    if (shareRes.initiated) {
      showToast(shareRes.messageAr);
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'بيانات المعجم الطبي UMEDT',
          text: buildAiLinguisticAuditPack(terms.slice(0, 15), sentences.slice(0, 15))
        });
        showToast('تمت مشاركة حزمة المراجعة بنجاح');
        return;
      }
    } catch {
      // Fallback to download
    }
    handleExportFullBackup();
  };

  const activeFilterSummary =
    selectedCategory === 'All' && searchScope === 'all'
      ? 'الفلترة والنطاق'
      : `${CATEGORY_META[selectedCategory]?.label} · ${SCOPE_LABELS[searchScope]}`;

  return (
    <div
      dir="rtl"
      className="min-h-screen w-full max-w-full box-border bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col pb-24 sm:pb-12"
    >
      {/* Service Worker & Offline Mode Portal Notices */}
      <PWAInstallBanner
        hideHeaderButtons
        simulatedOffline={simulatedOffline}
        onToggleSimulatedOffline={handleToggleSimulatedOffline}
        onExportZipPackage={handleExportZipPackage}
        onExportJsonBackup={handleExportFullBackup}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-[calc(env(safe-area-inset-top,0px)+4rem)] inset-x-4 max-w-md mx-auto z-50 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 border border-emerald-500/40 text-white shadow-xl">
          <div className="flex items-center gap-2.5 text-xs font-medium min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="break-words">{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white p-1 min-h-[36px] min-w-[36px] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====================================================================
          TOP HEADER BAR (Clean: Side Menu Trigger + Desktop Tabs + Brand)
         ==================================================================== */}
      <header className="sticky top-0 z-30 min-h-14 pt-[env(safe-area-inset-top,0px)] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 lg:px-8 py-1.5 flex items-center justify-between gap-3 w-full box-border">
        <div className="flex items-center gap-2 min-w-0">
          {/* Top-level duplicate dictionary/search menu removed; bottom navigation remains available. */}

          {/* Desktop Quick Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 mr-2">
            {[
              { id: 'home' as MainTab, label: 'القاموس', icon: Search },
              { id: 'topics' as MainTab, label: 'المواضيع', icon: BookOpen },
              { id: 'library' as MainTab, label: 'مكتبتي', icon: Star },
              { id: 'settings' as MainTab, label: 'الإعدادات', icon: Settings }
            ].map((tabItem) => {
              const IconComp = tabItem.icon;
              const isActive = activeTab === tabItem.id;
              return (
                <button
                  key={tabItem.id}
                  type="button"
                  onClick={() => {
                    setDetailTermId(null);
                    setActiveTab(tabItem.id);
                  }}
                  className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <IconComp className="w-3.5 h-3.5" />
                  <span>{tabItem.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('home');
          }}
          className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
        >
          UMEDT
        </a>
      </header>

      {/* ====================================================================
          CENTERED POPUP NAVIGATION CARD
         ==================================================================== */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                الأقسام
              </span>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="إغلاق"
                className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="grid grid-cols-2 gap-2.5">
              {[
                { id: 'home' as MainTab, label: 'القاموس', sub: `${terms.length}`, icon: Search },
                { id: 'topics' as MainTab, label: 'المواضيع', sub: `${topics.length}`, icon: BookOpen },
                { id: 'library' as MainTab, label: 'مكتبتي', sub: `${favoriteTerms.length}`, icon: Star },
                { id: 'settings' as MainTab, label: 'الإعدادات', sub: `${dbMetrics.actualSizeKb} KB`, icon: Settings }
              ].map((item) => {
                const IconComp = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setDetailTermId(null);
                      setActiveTab(item.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`p-3.5 rounded-2xl border text-right flex flex-col justify-between gap-2 transition-all ${
                      isActive
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:border-emerald-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <IconComp
                        className={`w-4 h-4 shrink-0 ${
                          isActive
                            ? 'text-white'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      />
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          isActive ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {item.sub}
                      </span>
                    </div>
                    <span className="text-xs font-extrabold truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ====================================================================
          MAIN APPLICATION WORKSPACE
         ==================================================================== */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 pt-4 box-border">

        {activeTab === 'home' && (
          <SearchHub
            terms={terms}
            sentences={sentences}
            recentTermIds={recentTermIds}
            onRemoveRecentTerm={handleRemoveRecentTerm}
            onClearRecentTerms={handleClearRecentTerms}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            searchScope={searchScope}
            selectedCategory={selectedCategory}
            onResetFilters={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSearchScope('all');
            }}
            onOpenFilterMenu={() =>
              setOpenMenu(openMenu === 'searchFilters' ? null : 'searchFilters')
            }
            activeFilterSummary={activeFilterSummary}
            categoryMeta={CATEGORY_META}
            termOfDay={termOfDay}
            onShuffleTermOfDay={shuffleTermOfDay}
            selectedDesktopTermId={selectedDesktopTermId}
            activeDetailTerm={activeDetailTerm}
            onOpenTermDetail={openTermDetail}
            onToggleFavoriteTerm={toggleFavoriteTerm}
            onToggleFavoriteSentence={toggleFavoriteSentence}
            onTriggerTTS={triggerTTS}
            onCopyToClipboard={copyToClipboard}
            copiedId={copiedId}
            renderAutoLinkedText={renderAutoLinkedText}
            onGraphChipClick={handleGraphChipClick}
            onInspectMorphologyForQuery={(word) => {
              setLibraryDraftTerm(word);
              setLibraryInitialMode('add_offline');
              setActiveTab('library');
            }}
            onAddNewTermFromQuery={() => {
              setLibraryDraftTerm(searchQuery);
              setLibraryInitialMode('add_offline');
              setActiveTab('library');
            }}
            showToast={showToast}
          />
        )}

        {activeTab === 'topics' && (
          <TopicsHub
            topics={topics}
            terms={terms}
            sentences={sentences}
            initialTopicId={topicsInitialTopicId}
            onInitialTopicConsumed={() => setTopicsInitialTopicId(null)}
            onSaveTopic={handleSaveTopic}
            onDeleteTopic={handleDeleteTopic}
            onToggleFavoriteTopic={toggleFavoriteTopic}
            onToggleFavoriteTerm={toggleFavoriteTerm}
            onOpenTermDetail={openTermDetail}
            onSaveNewTermFromTopic={handleSaveManualTerm}
            onAddSentenceToExistingTerm={handleAddSentenceToTerm}
            onTriggerTTS={triggerTTS}
            onHierarchyChanged={(reason) => {
              triggerTelegramAutoSync(reason);
            }}
            showToast={showToast}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            terms={terms}
            sentences={sentences}
            topics={topics}
            studyStats={studyStats}
            activeCollection={activeCollection}
            initialMode={libraryInitialMode}
            initialDraftTerm={libraryDraftTerm}
            onInitialModeConsumed={() => {
              setLibraryInitialMode(undefined);
              setLibraryDraftTerm('');
            }}
            onOpenCollectionsMenu={() =>
              setOpenMenu(openMenu === 'collections' ? null : 'collections')
            }
            onRecordSm2Review={handleRecordSm2Review}
            onOpenTermDetail={openTermDetail}
            onToggleFavoriteTerm={toggleFavoriteTerm}
            onToggleFavoriteSentence={toggleFavoriteSentence}
            onToggleFavoriteTopic={toggleFavoriteTopic}
            onOpenTopicFromLibrary={(topicId) => {
              setTopicsInitialTopicId(topicId);
              setActiveTab('topics');
            }}
            onTriggerTTS={triggerTTS}
            onSaveManualTerm={handleSaveManualTerm}
            onCommitBatch={handleCommitBatch}
            onImportFullBackupJson={handleImportFullBackupJson}
            onImportPackageFile={handleImportPackageFile}
            onImportTopicsBatch={handleImportTopicsBatch}
            onSyncStateUpdated={({
              topics: nextTopics,
              terms: nextTerms,
              sentences: nextSentences,
              customAffixes: nextAffixes,
              customAbbreviations: nextAbbreviations
            }) => {
              setTopics(nextTopics);
              setTerms(nextTerms);
              setSentences(nextSentences);
              if (nextAffixes !== undefined) {
                setCustomAffixes(nextAffixes);
              }
              if (nextAbbreviations !== undefined) {
                setCustomAbbreviations(nextAbbreviations);
              }
              triggerTelegramAutoSync('تحديث المكتبة السحابية', {
                topics: nextTopics,
                terms: nextTerms,
                sentences: nextSentences
              });
            }}
            onUniversalImportComplete={handleUniversalImportComplete}
            onBackupNowTriggered={(reason) => triggerTelegramAutoSync(reason)}
            showToast={showToast}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            isDark={isDark}
            onToggleDark={setIsDark}
            fontFamily={fontFamily}
            onChangeFontFamily={(nextFont) => {
              setFontFamily(nextFont);
            }}
            fontSizeScale={fontSizeScale}
            onChangeFontSizeScale={(nextScale) => {
              setFontSizeScale(nextScale);
              const pctMap: Record<AppFontSizeScale, number> = {
                auto: 85,
                sm: 75,
                md: 85,
                lg: 95,
                xl: 100
              };
              if (nextScale !== 'auto' && Math.abs(fontScalePercent - pctMap[nextScale]) > 3) {
                setFontScalePercent(pctMap[nextScale]);
              }
            }}
            fontScalePercent={fontScalePercent}
            onChangeFontScalePercent={(nextPct) => {
              setFontScalePercent(Math.max(75, Math.min(100, nextPct)));
            }}
            colorTheme={colorTheme}
            onChangeColorTheme={(nextTheme) => {
              setColorTheme(nextTheme);
              showToast('تم تطبيق الثيم المختار');
            }}
            conflictPolicy={conflictPolicy}
            onChangeConflictPolicy={(nextPolicy) => {
              setConflictPolicy(nextPolicy);
              showToast('تم تحديث سياسة معالجة المصطلحات المكررة');
            }}
            simulatedOffline={simulatedOffline}
            onToggleSimulatedOffline={handleToggleSimulatedOffline}
            recentTermsCount={recentTermIds.length}
            onClearRecentTerms={handleClearRecentTerms}
            dbMetrics={dbMetrics}
            versionMetadata={versionMetadata}
            onlineUpdateConfig={onlineUpdateConfig}
            onlineUpdateStatus={onlineUpdateStatus}
            onUpdateOnlineConfig={handleUpdateOnlineConfig}
            onCheckForUpdates={handleCheckForUpdates}
            onRunLiveServerOtaTest={handleRunLiveServerOtaTest}
            onRollbackToPreviousVersion={handleRollbackToPreviousVersion}
            backupHistory={backupHistory}
            onCreateManualBackup={handleCreateManualBackup}
            onRestoreBackupById={handleRestoreBackupById}
            onDeleteBackupById={handleDeleteBackupById}
            onExportBackup={handleExportFullBackup}
            onExportZipPackage={handleExportZipPackage}
            onImportPackageFile={handleImportPackageFile}
            onShareDataFile={handleShareDataFile}
            telegramConfig={telegramConfig}
            onUpdateTelegramConfig={handleUpdateTelegramConfig}
            onTriggerTelegramBackupNow={handleTriggerTelegramBackupNow}
            onRestoreFromTelegramNow={handleRestoreFromTelegramNow}
            currentDataSummary={currentDataSummary}
            lastImportedOrCopiedSummary={lastImportedOrCopiedSummary}
            onPublishLocalData={() => publishMasterDataToGitHub({
              terms,
              sentences,
              topics,
              customAffixes,
              customAbbreviations,
              blocks: loadMedicalBlocks(),
              subjects: loadMedicalSubjects(),
              books: loadAcademicBooks(),
              questions: loadQuizQuestions(topics, terms),
              exams: loadAcademicExams(),
              mediaAssets: loadMediaAssetsIndex()
            })}
            onResetDefaults={() => {
              clearLocallyRemovedRegistry();
              const defaults = resetToDefaults();
              setTerms(defaults.terms);
              setSentences(defaults.sentences);
              setTopics(defaults.topics);
              setCustomAffixes(defaults.customAffixes);
              setCustomAbbreviations(defaults.customAbbreviations);
              setStudyStats(defaults.studyStats);
              setVersionMetadata(defaults.versionMetadata);
              setBackupHistory(loadBackupHistory());
              showToast('تمت استعادة البيانات الافتراضية الكاملة');
            }}
            lastBackupTime={lastBackupTime}
          />
        )}
      </main>

      {/* ====================================================================
          MOBILE BOTTOM NAVIGATION BAR (4 CLEAR PAGES)
         ==================================================================== */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 pb-[env(safe-area-inset-bottom,4px)] pt-1.5 grid grid-cols-4 gap-1">
        {[
          { id: 'home' as MainTab, label: 'القاموس', icon: Search },
          { id: 'topics' as MainTab, label: 'المواضيع', icon: BookOpen },
          { id: 'library' as MainTab, label: 'مكتبتي', icon: Star },
          { id: 'settings' as MainTab, label: 'الإعدادات', icon: Settings }
        ].map((item) => {
          const IconComp = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setDetailTermId(null);
                setActiveTab(item.id);
              }}
              className={`min-h-[48px] rounded-2xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-extrabold transition-colors ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <IconComp className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ====================================================================
          CONTEXTUAL FULL TERM DETAIL SHEET
         ==================================================================== */}
      {detailTermId && activeDetailTerm && (
        <TermDetailSheet
          activeDetailTerm={activeDetailTerm}
          terms={terms}
          sentences={sentences}
          detailHistory={detailHistory}
          categoryMeta={CATEGORY_META}
          speakingKey={speakingKey}
          copiedId={copiedId}
          concordanceMatches={concordanceMatches}
          suggestedRelations={activeTermSuggestedRelations}
          onBack={handleBackInDetailSheet}
          onClose={closeDetailSheet}
          onOpenTermDetail={openTermDetail}
          onToggleFavorite={toggleFavoriteTerm}
          onTriggerTTS={triggerTTS}
          onCopyToClipboard={copyToClipboard}
          renderAutoLinkedText={renderAutoLinkedText}
          onGraphChipClick={handleGraphChipClick}
          onUpdateTerm={handleUpdateTerm}
          onDeleteTerm={handleDeleteTerm}
          onAddSentenceToTerm={handleAddSentenceToTerm}
          showToast={showToast}
        />
      )}

      {/* ====================================================================
          UNIFIED POPOVER / ACTION-SHEET MENUS
         ==================================================================== */}
      {openMenu && (
        <div
          onClick={() => setOpenMenu(null)}
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl"
          >

            {/* 1. Search Filters & Scope Popover */}
            {openMenu === 'searchFilters' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">نطاق البحث والتخصصات</h3>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(null)}
                    className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-slate-500 block">نطاق البحث في FTS5:</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(['all', 'terms', 'definitions', 'examples'] as const).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => setSearchScope(sc)}
                        className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                          searchScope === sc
                            ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {SCOPE_LABELS[sc]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-xs text-slate-500 block">التخصص المعجمي:</span>
                  <div className="space-y-1.5">
                    {Object.entries(CATEGORY_META).map(([catKey, meta]) => {
                      const IconComp = meta.icon;
                      const active = selectedCategory === catKey;
                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => {
                            setSelectedCategory(catKey);
                            setOpenMenu(null);
                          }}
                          className={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between border transition-colors ${
                            active
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <IconComp className="w-4 h-4" />
                            <span>{meta.label}</span>
                          </span>
                          <span className="font-mono text-[11px]">
                            {categoryCounts[catKey]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 2. Collections Picker Popover */}
            {openMenu === 'collections' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold">اختر مجموعة المفضلة</h3>
                  <button
                    type="button"
                    onClick={() => setOpenMenu(null)}
                    className="p-1 text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  {availableCollections.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => {
                        setActiveCollection(col);
                        setOpenMenu(null);
                      }}
                      className={`w-full p-3 rounded-xl border text-right text-xs font-bold flex items-center justify-between ${
                        activeCollection === col
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <span>{col}</span>
                      {activeCollection === col && (
                        <Check className="w-4 h-4 text-emerald-500" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          MINI BOTTOM-SHEET PREVIEW FOR DOTTED AUTO-LINKED TERMS
         ==================================================================== */}
      {previewTerm && (
        <div
          onClick={() => setPreviewTerm(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 sm:p-6 space-y-4 shadow-2xl"
          >

            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold block">
                  {CATEGORY_META[previewTerm.category]?.label}
                  {previewTerm.umdCode ? ` · ${previewTerm.umdCode}` : ''}
                </span>
                <h3 dir="ltr" className="text-xl font-extrabold text-left mt-0.5">
                  {previewTerm.aliasName
                    ? `${previewTerm.aliasName} → ${previewTerm.term}`
                    : previewTerm.term}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTerm(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                {previewTerm.translation}
              </span>
              <span dir="ltr" className="text-xs font-mono text-slate-500">
                {previewTerm.phonetic}
              </span>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                الشرح والتعريف:
              </span>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {previewTerm.definitionAr}
              </p>
            </div>

            {previewTerm.examples && previewTerm.examples.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  الجمل السياقية الخاصة بالمصطلح ({previewTerm.examples.length}):
                </span>
                <div className="space-y-2">
                  {previewTerm.examples.map((ex, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1"
                    >
                      <p
                        dir="ltr"
                        className="text-xs text-slate-800 dark:text-slate-200 font-medium text-left"
                      >
                        {ex.en}
                      </p>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300">
                        {ex.ar}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => openTermDetail(previewTerm.id)}
                className="flex-1 min-h-[44px] py-3 px-4 rounded-2xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2"
              >
                <span>فتح بطاقة المصطلح الكاملة</span>
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
              <button
                type="button"
                onClick={() =>
                  triggerTTS(previewTerm.term, `preview-tts-${previewTerm.id}`)
                }
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
