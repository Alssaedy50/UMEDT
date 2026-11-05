import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Star,
  Volume2,
  Check,
  ArrowRight,
  Upload,
  Layers,
  Cpu,
  Stethoscope,
  Code2,
  Globe,
  X,
  CheckCircle2,
  Activity,
  BookOpen,
  Menu,
  Settings
} from 'lucide-react';
import {
  EXTRA_LINKABLE_ALIASES,
  CLINICAL_BENCHMARK_CASES,
  DictionaryTerm,
  LinkedSentence
} from './data/medicalLexiconData';
import {
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
import { runHybridGcNmtPipeline } from './engine/hybridTranslator';
import {
  syncBidirectionalLinks,
  autoEnrichTermRelations,
  autoEnrichAllTermsRelations
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
import { ClinicalTranslatorView } from './components/ClinicalTranslatorView';
import { IngestionPortal, StagedTermItem } from './components/IngestionPortal';
import { LibraryView } from './components/LibraryView';
import { SettingsView } from './components/SettingsView';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { prepareAndDownloadFile } from './utils/downloadHelper';
import { runSafeIndexedDbMigration, putAllInStore, IDB_STORES } from './services/indexedDbService';

type MainTab = 'home' | 'topics' | 'translator' | 'datacenter' | 'ingest' | 'library' | 'settings';

const ROUTE_TO_TAB: Record<string, MainTab> = {
  '/': 'home',
  '/home': 'home',
  '/search': 'home',
  '/topics': 'topics',
  '/translator': 'translator',
  '/datacenter': 'datacenter',
  '/medical-data-center': 'datacenter',
  '/ingest': 'ingest',
  '/library': 'library',
  '/settings': 'settings'
};

const TAB_TO_HASH: Record<MainTab, string> = {
  home: '#home',
  topics: '#topics',
  translator: '#translator',
  datacenter: '#datacenter',
  ingest: '#ingest',
  library: '#library',
  settings: '#settings'
};

const PAGE_LABELS: Record<MainTab, string> = {
  home: 'القاموس',
  topics: 'المواضيع',
  translator: 'المترجم',
  datacenter: 'البيانات',
  ingest: 'البيانات',
  library: 'مكتبتي',
  settings: 'الإعدادات'
};

function resolveInitialTabFromLocation(): MainTab {
  if (typeof window === 'undefined') return 'home';
  const hashClean = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (
    hashClean === 'home' ||
    hashClean === 'topics' ||
    hashClean === 'translator' ||
    hashClean === 'datacenter' ||
    hashClean === 'medical-data-center' ||
    hashClean === 'ingest' ||
    hashClean === 'library' ||
    hashClean === 'settings'
  ) {
    if (hashClean === 'medical-data-center') return 'datacenter';
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

  // Screen 2: Clinical Translator State
  const [clinicalInput, setClinicalInput] = useState<string>(
    CLINICAL_BENCHMARK_CASES[0].sourceEn
  );

  // Screen 3: Smart Ingestion Portal State
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
      lastBackupTime
    });
  }, [isDark, conflictPolicy, sharedStoragePath, lastBackupTime]);

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

  // Non-blocking startup online update check
  useEffect(() => {
    const timer = setTimeout(() => {
      void handleCheckForUpdates({ isStartup: true });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerTTS = (text: string, key: string, lang = 'en-US') => {
    setSpeakingKey(key);
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      // Fallback
    }
    setTimeout(() => {
      setSpeakingKey((prev) => (prev === key ? null : prev));
    }, 1200);
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
    setTerms((prev) =>
      prev.map((item) => {
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
      })
    );
  };

  const toggleFavoriteSentence = (sentenceId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSentences((prev) =>
      prev.map((s) => {
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
      })
    );
  };

  const handleSaveTopic = (topic: TopicArticle, isEdit: boolean) => {
    setTopics((prev) => {
      if (isEdit) {
        return prev.map((t) => (t.id === topic.id ? topic : t));
      }
      return [topic, ...prev];
    });
    showToast(
      isEdit
        ? `تم حفظ التعديلات على الموضوع "${topic.title}"`
        : `تم نشر الموضوع الجديد "${topic.title}" بنجاح`
    );
  };

  const handleDeleteTopic = (topicId: string) => {
    const target = topics.find((t) => t.id === topicId);
    setTopics((prev) => prev.filter((t) => t.id !== topicId));
    if (target) {
      showToast(`تم حذف الموضوع "${target.title}"`);
    }
  };

  const toggleFavoriteTopic = (topicId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTopics((prev) =>
      prev.map((tp) => {
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
      })
    );
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
    const pool = terms.filter((t) => t.id !== termOfDay.id);
    if (pool.length > 0) {
      const randomPick = pool[Math.floor(Math.random() * pool.length)];
      setTermOfDayId(randomPick.id);
    }
  };

  const termLookupMap = useMemo(() => {
    const map: Record<string, DictionaryTerm & { aliasName?: string }> = {};
    terms.forEach((t) => {
      map[t.term.toLowerCase()] = t;
    });
    Object.entries(EXTRA_LINKABLE_ALIASES).forEach(([alias, targetId]) => {
      const found = terms.find((t) => t.id === targetId);
      if (found) {
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
      activeDetailTerm.examples.map((e) => e.en.trim().toLowerCase())
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
      return nextTerms;
    });
  };

  const handleDeleteTerm = (termId: string) => {
    const deleted = terms.find((t) => t.id === termId);
    setTerms((prev) => {
      const remaining = prev.filter((t) => t.id !== termId);
      if (selectedDesktopTermId === termId && remaining[0]) {
        setSelectedDesktopTermId(remaining[0].id);
      }
      return remaining;
    });
    closeDetailSheet();
    if (deleted) {
      showToast(`تم حذف المصطلح "${deleted.term}" من قاعدة البيانات`);
    }
  };

  const handleAddSentenceToTerm = (termId: string, example: TermExample) => {
    setTerms((prevTerms) => {
      let targetTerm: DictionaryTerm | null = null;
      const replaced = prevTerms.map((t) => {
        if (t.id === termId) {
          targetTerm = {
            ...t,
            examples: [example, ...t.examples]
          };
          return targetTerm;
        }
        return t;
      });
      const nextTerms = targetTerm
        ? autoEnrichTermRelations(targetTerm, replaced)
        : replaced;
      const synced = syncTermExamplesToSentences(nextTerms, sentences);
      setSentences(synced);
      return nextTerms;
    });
    showToast('تمت إضافة الجملة السياقية للمصطلح وربطها بقاعدة الجمل');
  };

  const hybridTranslationOutput = useMemo(
    () =>
      runHybridGcNmtPipeline(
        clinicalInput,
        terms,
        sentences,
        customAffixes,
        customAbbreviations
      ),
    [clinicalInput, terms, sentences, customAffixes, customAbbreviations]
  );

  const handleSaveManualTerm = (
    newTerm: DictionaryTerm,
    newLinkedSentences: LinkedSentence[]
  ) => {
    setTerms((prevTerms) => {
      const existingIdx = prevTerms.findIndex(
        (t) => t.term.toLowerCase() === newTerm.term.toLowerCase()
      );
      let targetTerm = newTerm;
      let rawNextTerms: DictionaryTerm[];
      if (existingIdx !== -1) {
        rawNextTerms = [...prevTerms];
        targetTerm = {
          ...rawNextTerms[existingIdx],
          ...newTerm,
          id: rawNextTerms[existingIdx].id
        };
        rawNextTerms[existingIdx] = targetTerm;
      } else {
        rawNextTerms = [newTerm, ...prevTerms];
      }
      const nextTerms = autoEnrichTermRelations(targetTerm, rawNextTerms);
      const combinedSentences = [...newLinkedSentences, ...sentences];
      const synced = syncTermExamplesToSentences(nextTerms, combinedSentences);
      setSentences(synced);
      return nextTerms;
    });
    showToast(`تم حفظ المصطلح "${newTerm.term}" وربطه بشبكة المعرفة`);
  };

  const handleImportFullBackupJson = (rawJson: string): boolean => {
    const mode =
      conflictPolicy === 'overwrite'
        ? 'replace'
        : conflictPolicy === 'ignore'
        ? 'ignore'
        : 'merge';
    const importResult = importFullDatabaseJson(rawJson, mode);
    if (importResult.success && importResult.state) {
      setTerms(importResult.state.terms);
      setSentences(importResult.state.sentences);
      setTopics(importResult.state.topics);
      setCustomAffixes(importResult.state.customAffixes);
      setCustomAbbreviations(importResult.state.customAbbreviations);
      setStudyStats(importResult.state.studyStats);
      setVersionMetadata(importResult.state.versionMetadata);
      setActiveTab('home');
      showToast(
        `تم الاستيراد الذري بنجاح (${importResult.termsCount} مصطلح و ${importResult.sentencesCount} جملة · إصدار الداتا ${importResult.state.versionMetadata.dataVersion})`
      );
      return true;
    }
    if (importResult.error) {
      showToast(`فشل الاستيراد الذري (لم يتم تغيير أي بيانات): ${importResult.error}`, 'info');
    }
    return false;
  };

  const handleImportPackageFile = async (file: File) => {
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
      const firstErr = result.errors[0] || 'حزمة البيانات غير صالحة.';
      showToast(`تم رفض الحزمة (All-or-Nothing): ${firstErr}`, 'info');
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
    setLastBackupTime('نسخ تلقائي قبل استيراد الحزمة');
    showToast(
      `تم تحديث البيانات ذرياً من حزمة ${result.sourceFormat.toUpperCase()} (${result.summary.termsImported} مصطلح، ${result.summary.sentencesImported} جملة · الإصدار ${result.versionMetadata.dataVersion})`
    );
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
          if (
            !current.examples.some(
              (e) => e.en.toLowerCase() === enh.example.en.toLowerCase()
            )
          ) {
            nextTerms[idx] = {
              ...current,
              examples: [...current.examples, enh.example]
            };
            updatedCount += 1;
          }
        }
      });

      stagedTerms.forEach((staged) => {
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
              examples: staged.examples,
              relations: staged.relations,
              ingestedAt: 'الآن · تحديث مباشر'
            };
            updatedCount += 1;
          } else if (conflictPolicy === 'merge') {
            const current = nextTerms[existingIndex];
            const mergedExamples = [...current.examples];
            staged.examples.forEach((ex) => {
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
          nextTerms.unshift({
            id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            term: staged.term,
            termNormalized: staged.term.toLowerCase(),
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
            examples: staged.examples,
            relations: staged.relations
          });
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
      return enrichedTerms;
    });

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
      totalGraphEdges: termGraphEdges + sentenceTermLinks,
      actualSizeKb
    };
  }, [terms, sentences, customAbbreviations, topics]);

  const downloadFile = (filename: string, content: string, mime = 'application/json') => {
    void prepareAndDownloadFile({
      filename,
      content,
      mime
    });
    showToast(`جاري تنزيل الملف: ${filename}`);
  };

  const handleExportFullBackup = () => {
    downloadFile(
      'dictengine-umd-full-data.json',
      exportFullDatabaseJson({
        terms,
        sentences,
        topics,
        customAffixes,
        customAbbreviations,
        studyStats,
        versionMetadata
      }),
      'application/json;charset=utf-8'
    );
    setLastBackupTime('الآن');
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
    void prepareAndDownloadFile({
      filename,
      content: zipBytes,
      mime: 'application/zip'
    });
    setLastBackupTime('الآن');
    showToast(`جاري تنزيل حزمة البيانات الموحدة (.ZIP): ${filename}`);
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

    try {
      const file = new File([fullJson], 'dictengine-umd-full-data.json', {
        type: 'application/json'
      });
      if (
        typeof navigator !== 'undefined' &&
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        await navigator.share({
          title: 'بيانات المعجم الطبي UMEDT',
          text: `نسخة بيانات القاموس الطبي (${terms.length} مصطلح و ${sentences.length} جملة سياقية)`,
          files: [file]
        });
        showToast('تمت مشاركة ملف الداتا بنجاح');
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'بيانات المعجم الطبي UMEDT',
          text: buildAiLinguisticAuditPack(terms.slice(0, 15), sentences.slice(0, 15))
        });
        showToast('تمت مشاركة حزمة المراجعة بنجاح');
        return;
      }
    } catch {
      // Fallback to direct download if user cancels or browser blocks share inside iframe
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
      className="min-h-screen w-full max-w-full box-border bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col pb-10"
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
        <div className="fixed top-16 inset-x-4 max-w-md mx-auto z-50 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 border border-emerald-500/40 text-white shadow-xl">
          <div className="flex items-center gap-2.5 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ====================================================================
          TOP HEADER BAR (Clean: Side Menu Trigger + Current Page — Brand)
         ==================================================================== */}
      <header className="sticky top-0 z-30 h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-3 w-full box-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="القائمة"
            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-extrabold flex items-center gap-2 transition-colors shrink-0"
          >
            <Menu className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{PAGE_LABELS[activeTab]}</span>
          </button>
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
          POP-OUT SIDE NAVIGATION DRAWER (القائمة الجانبية المنبثقة)
         ==================================================================== */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-50 bg-black/60 flex justify-start"
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="w-64 max-w-[80vw] h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col p-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                القائمة
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

            <nav className="space-y-1">
              {[
                { id: 'home' as MainTab, label: 'القاموس', icon: Search },
                { id: 'topics' as MainTab, label: 'المواضيع', icon: BookOpen },
                { id: 'translator' as MainTab, label: 'المترجم', icon: Activity },
                { id: 'datacenter' as MainTab, label: 'البيانات', icon: Upload },
                { id: 'library' as MainTab, label: 'مكتبتي', icon: Star },
                { id: 'settings' as MainTab, label: 'الإعدادات', icon: Settings }
              ].map((item) => {
                const IconComp = item.icon;
                const isActive =
                  activeTab === item.id ||
                  (item.id === 'datacenter' && activeTab === 'ingest');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setDetailTermId(null);
                      setActiveTab(item.id);
                      setIsSidebarOpen(false);
                    }}
                    className={`w-full min-h-[44px] px-3.5 py-2 rounded-xl text-right flex items-center gap-3 text-sm transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 font-extrabold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold'
                    }`}
                  >
                    <IconComp
                      className={`w-4 h-4 shrink-0 ${
                        isActive
                          ? 'text-white dark:text-slate-950'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* ====================================================================
          MAIN APPLICATION WORKSPACE
         ==================================================================== */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 pt-4 box-border">
        {onlineUpdateStatus.phase === 'update-available' && (
          <div className="mb-4 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
              <span>
                يتوفر تحديث سحابي جديد للبيانات الطبية ({onlineUpdateStatus.availableDataVersion}) موقّع رقمياً وجاهز للتنزيل.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCheckForUpdates({ forceInstall: true })}
                className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold"
              >
                تنزيل وتثبيت التحديث الآن
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-white/80 dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-800"
              >
                الإعدادات
              </button>
            </div>
          </div>
        )}

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
              setClinicalInput(word);
              setActiveTab('translator');
            }}
            onAddNewTermFromQuery={() => {
              setActiveTab('ingest');
            }}
            showToast={showToast}
          />
        )}

        {activeTab === 'topics' && (
          <TopicsHub
            topics={topics}
            terms={terms}
            sentences={sentences}
            onSaveTopic={handleSaveTopic}
            onDeleteTopic={handleDeleteTopic}
            onToggleFavoriteTopic={toggleFavoriteTopic}
            onOpenTermDetail={openTermDetail}
            onSaveNewTermFromTopic={handleSaveManualTerm}
            onAddSentenceToExistingTerm={handleAddSentenceToTerm}
            onTriggerTTS={triggerTTS}
            showToast={showToast}
          />
        )}

        {activeTab === 'translator' && (
          <ClinicalTranslatorView
            terms={terms}
            sentences={sentences}
            customAffixes={customAffixes}
            customAbbreviations={customAbbreviations}
            clinicalInput={clinicalInput}
            onClinicalInputChange={setClinicalInput}
            hybridTranslationOutput={hybridTranslationOutput}
            copiedId={copiedId}
            onCopyToClipboard={copyToClipboard}
            onOpenTermDetail={openTermDetail}
            onSaveDecomposedTermToDictionary={(newTerm) =>
              handleSaveManualTerm(newTerm, [])
            }
            onTriggerTTS={triggerTTS}
            onToggleFavoriteTerm={toggleFavoriteTerm}
            showToast={showToast}
          />
        )}

        {(activeTab === 'datacenter' || activeTab === 'ingest') && (
          <IngestionPortal
            terms={terms}
            copiedId={copiedId}
            onCopyToClipboard={copyToClipboard}
            onSaveManualTerm={handleSaveManualTerm}
            onCommitBatch={handleCommitBatch}
            onImportFullBackupJson={handleImportFullBackupJson}
            onImportPackageFile={handleImportPackageFile}
            onOpenTermDetail={openTermDetail}
            showToast={showToast}
          />
        )}

        {activeTab === 'library' && (
          <LibraryView
            terms={terms}
            sentences={sentences}
            topics={topics}
            studyStats={studyStats}
            versionMetadata={versionMetadata}
            activeCollection={activeCollection}
            onOpenCollectionsMenu={() =>
              setOpenMenu(openMenu === 'collections' ? null : 'collections')
            }
            onRecordSm2Review={handleRecordSm2Review}
            onOpenTermDetail={openTermDetail}
            onToggleFavoriteTerm={toggleFavoriteTerm}
            onToggleFavoriteSentence={toggleFavoriteSentence}
            onTriggerTTS={triggerTTS}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            isDark={isDark}
            onToggleDark={setIsDark}
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
            onResetDefaults={() => {
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
          className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-2xl"
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto sm:hidden" />

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
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-700 p-6 space-y-4 shadow-2xl"
          >
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto" />

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
