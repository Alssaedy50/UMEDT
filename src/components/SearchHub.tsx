import React, { useMemo } from 'react';
import {
  Search,
  Star,
  Shuffle,
  X,
  AlertCircle,
  ClipboardPaste,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Trash2,
  Mic,
  MicOff,
  Volume2
} from 'lucide-react';
import { DictionaryTerm, LinkedSentence } from '../types/lexicon';

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error?: string;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SearchHubProps {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  recentTermIds?: string[];
  onRemoveRecentTerm?: (termId: string, e?: React.MouseEvent) => void;
  onClearRecentTerms?: () => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchScope: 'all' | 'terms' | 'definitions' | 'examples';
  selectedCategory: string;
  onResetFilters: () => void;
  onOpenFilterMenu: () => void;
  activeFilterSummary: string;
  categoryMeta: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }> }
  >;
  termOfDay: DictionaryTerm;
  onShuffleTermOfDay: () => void;
  selectedDesktopTermId: string;
  activeDetailTerm: DictionaryTerm;
  onOpenTermDetail: (termId: string) => void;
  onToggleFavoriteTerm: (termId: string, e?: React.MouseEvent) => void;
  onToggleFavoriteSentence: (sentenceId: string, e?: React.MouseEvent) => void;
  onTriggerTTS: (text: string, key: string, lang?: string) => void;
  speakingKey?: string | null;
  onCopyToClipboard: (text: string, key: string, label?: string) => void;
  copiedId: string | null;
  renderAutoLinkedText: (text: string, currentTermId?: string) => React.ReactNode;
  onGraphChipClick: (label: string) => void;
  onInspectMorphologyForQuery: (word: string) => void;
  onAddNewTermFromQuery: (queryText: string) => void;
  showToast: (message: string, type?: string) => void;
}

export const SearchHub: React.FC<SearchHubProps> = ({
  terms,
  recentTermIds = [],
  onRemoveRecentTerm,
  onClearRecentTerms,
  searchQuery,
  onSearchQueryChange,
  searchScope,
  selectedCategory,
  onResetFilters,
  onOpenFilterMenu,
  activeFilterSummary,
  termOfDay,
  onShuffleTermOfDay,
  onOpenTermDetail,
  onToggleFavoriteTerm,
  onTriggerTTS,
  speakingKey = null,
  onInspectMorphologyForQuery,
  onAddNewTermFromQuery,
  showToast
}) => {
  const [visibleLimit, setVisibleLimit] = React.useState<number>(60);
  const [draftQuery, setDraftQuery] = React.useState(searchQuery);
  const deferredDraftQuery = React.useDeferredValue(draftQuery);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(-1);
  const [isVoiceListening, setIsVoiceListening] = React.useState(false);
  const [voiceLang, setVoiceLang] = React.useState<'en-US' | 'ar-SA'>('en-US');
  const [voiceInterimText, setVoiceInterimText] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const isComposingRef = React.useRef(false);
  const lastPushedQueryRef = React.useRef(searchQuery);
  const blurTimeoutRef = React.useRef<number | null>(null);
  const recognitionRef = React.useRef<SpeechRecognitionInstanceLike | null>(null);

  const applySpokenQuery = React.useCallback(
    (rawSpoken: string) => {
      const cleaned = (rawSpoken || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[.,،؟?!؛;:]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) return;
      isComposingRef.current = false;
      lastPushedQueryRef.current = cleaned;
      setDraftQuery(cleaned);
      onSearchQueryChange(cleaned);
      setActiveSuggestionIndex(-1);
      setIsSearchFocused(false);
      showToast(`تم البحث صوتياً عن «${cleaned}»`);
    },
    [onSearchQueryChange, showToast]
  );

  React.useEffect(() => {
    if (searchQuery !== lastPushedQueryRef.current) {
      lastPushedQueryRef.current = searchQuery;
      if (!isComposingRef.current) {
        setDraftQuery(searchQuery);
      }
      setActiveSuggestionIndex(-1);
    }
  }, [searchQuery]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleNativeVoiceStarted = () => {
      setIsVoiceListening(true);
      setVoiceInterimText('');
    };

    const handleNativeVoicePartial = (event: Event) => {
      const custom = event as CustomEvent<{ text?: string }>;
      if (custom?.detail?.text) {
        setIsVoiceListening(true);
        setVoiceInterimText(custom.detail.text);
      }
    };

    const handleNativeVoiceResult = (event: Event) => {
      const custom = event as CustomEvent<{ text?: string }>;
      setIsVoiceListening(false);
      setVoiceInterimText('');
      if (custom?.detail?.text) {
        applySpokenQuery(custom.detail.text);
      }
    };

    const handleNativeVoiceError = (event: Event) => {
      const custom = event as CustomEvent<{ code?: string; message?: string }>;
      setIsVoiceListening(false);
      setVoiceInterimText('');
      const code = custom?.detail?.code;
      if (code && code !== 'cancelled') {
        const customMessage = custom?.detail?.message;
        if (customMessage) {
          showToast(customMessage, 'info');
        } else if (code === 'permission_denied') {
          showToast('يرجى السماح بصلاحية الميكروفون من إعدادات التطبيق لاستخدام البحث الصوتي.', 'info');
        } else if (code === 'no_speech') {
          showToast('لم يتم التقاط أي صوت. اضغط الميكروفون وتحدث بوضوح.', 'info');
        } else if (code === 'network') {
          showToast('تعذر التعرف على الصوت. تحقق من اتصال الإنترنت أو حزمة الصوت على الهاتف.', 'info');
        } else if (code === 'not_available') {
          showToast('لا توجد خدمة تعرّف على الصوت مفعّلة على هذا الجهاز.', 'info');
        } else {
          showToast('تعذر التقاط الصوت. تأكد من صلاحية الميكروفون وحاول مرة أخرى.', 'info');
        }
      }
    };

    window.addEventListener('umed-voice-search-started', handleNativeVoiceStarted);
    window.addEventListener('umed-voice-search-partial', handleNativeVoicePartial);
    window.addEventListener('umed-voice-search-result', handleNativeVoiceResult);
    window.addEventListener('umed-voice-search-error', handleNativeVoiceError);

    return () => {
      window.removeEventListener('umed-voice-search-started', handleNativeVoiceStarted);
      window.removeEventListener('umed-voice-search-partial', handleNativeVoicePartial);
      window.removeEventListener('umed-voice-search-result', handleNativeVoiceResult);
      window.removeEventListener('umed-voice-search-error', handleNativeVoiceError);
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [applySpokenQuery, showToast]);

  const getNativeVoiceBridge = () => {
    if (typeof window === 'undefined') return undefined;
    const win = window as unknown as {
      UMEDAndroidBridge?: {
        isVoiceSearchAvailable?: () => boolean;
        startVoiceSearch?: (lang: string) => string;
        stopVoiceSearch?: () => void;
        hasMicrophonePermission?: () => boolean;
        requestMicrophonePermission?: () => boolean;
      };
      UMEDNativeDownloader?: {
        isVoiceSearchAvailable?: () => boolean;
        startVoiceSearch?: (lang: string) => string;
        stopVoiceSearch?: () => void;
      };
    };
    return win.UMEDAndroidBridge || win.UMEDNativeDownloader;
  };

  const stopVoiceSearch = () => {
    try {
      const nativeBridge = getNativeVoiceBridge();
      if (nativeBridge && typeof nativeBridge.stopVoiceSearch === 'function') {
        nativeBridge.stopVoiceSearch();
      }
    } catch {
      // ignore
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsVoiceListening(false);
    setVoiceInterimText('');
  };

  const handleToggleVoiceSearch = () => {
    if (isVoiceListening) {
      stopVoiceSearch();
      return;
    }
    if (typeof window === 'undefined') return;

    // 1. Native Android dual-engine bridge (in-app SpeechRecognizer + RecognizerIntent fallback)
    const nativeBridge = getNativeVoiceBridge();
    if (nativeBridge && typeof nativeBridge.startVoiceSearch === 'function') {
      try {
        const raw = nativeBridge.startVoiceSearch(voiceLang);
        const parsed = raw ? JSON.parse(raw) : { ok: false };
        if (parsed?.permissionRequested) {
          showToast(
            parsed.message || 'يرجى الموافقة على إذن الميكروفون ليبدأ البحث الصوتي تلقائياً.',
            'info'
          );
          return;
        }
        if (parsed?.ok) {
          setIsVoiceListening(true);
          setVoiceInterimText('');
          return;
        }
        showToast(
          parsed?.error || 'تعذر بدء الإدخال الصوتي على هذا الجهاز. تحقق من إعدادات الصوت والميكروفون.',
          'info'
        );
        return;
      } catch {
        showToast('تعذر تشغيل الإدخال الصوتي على جهاز Android. حاول مرة أخرى.', 'info');
        return;
      }
    }

    // 2. Web Speech API (Chrome / Edge / Safari / Mobile Browsers)
    const SpeechRecCtor = (
      window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      }
    ).SpeechRecognition || (
      window as unknown as {
        webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      }
    ).webkitSpeechRecognition;

    if (!SpeechRecCtor) {
      showToast('الإدخال الصوتي غير مدعوم في هذا المتصفح. جرّب Chrome أو تطبيق Android.', 'info');
      return;
    }

    try {
      const recognition = new SpeechRecCtor();
      recognition.lang = voiceLang;
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsVoiceListening(true);
        setVoiceInterimText('');
      };

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = 0; i < event.results.length; i += 1) {
          const res = event.results[i];
          const text = res?.[0]?.transcript || '';
          if (res?.isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }
        const live = (finalTranscript || interimTranscript).trim();
        if (live) {
          setVoiceInterimText(live);
        }
        if (finalTranscript.trim()) {
          applySpokenQuery(finalTranscript);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
        setIsVoiceListening(false);
        setVoiceInterimText('');
        recognitionRef.current = null;
        const code = event?.error || '';
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          showToast('تم رفض صلاحية الميكروفون. فعّل إذن الميكروفون من إعدادات المتصفح.', 'info');
        } else if (code === 'no-speech') {
          showToast('لم يتم التقاط أي صوت. اضغط الميكروفون وتحدث بوضوح.', 'info');
        } else if (code === 'network') {
          showToast('يتطلب الإدخال الصوتي في المتصفح اتصالاً بالإنترنت.', 'info');
        } else if (code !== 'aborted') {
          showToast('تعذر التعرف على الصوت. حاول مرة أخرى.', 'info');
        }
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
        setVoiceInterimText('');
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsVoiceListening(false);
      setVoiceInterimText('');
      recognitionRef.current = null;
      showToast('تعذر بدء الاستماع الصوتي. تحقق من صلاحية الميكروفون.', 'info');
    }
  };

  React.useEffect(() => {
    setVisibleLimit(60);
  }, [searchQuery, searchScope, selectedCategory]);

  const indexedTerms = useMemo(
    () =>
      terms.map((item) => {
        const termLower = (item.term || '').toLowerCase();
        const transLower = (item.translation || '').toLowerCase();
        const metaLower = `${item.umdCode || ''} ${item.specialty || ''}`.toLowerCase();
        const defLower = `${item.definitionAr || ''} ${item.definitionEn || ''} ${item.clinicalNote || ''}`.toLowerCase();
        const exLower = (Array.isArray(item.examples) ? item.examples : [])
          .map((ex) => `${ex.en || ''} ${ex.ar || ''}`)
          .join(' ')
          .toLowerCase();
        const synLowers = (item.relations?.synonyms || []).map((v) => v.toLowerCase());
        return {
          item,
          termLower,
          transLower,
          metaLower,
          defLower,
          exLower,
          synLowers
        };
      }),
    [terms]
  );

  const filteredTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const results: DictionaryTerm[] = [];
    for (let i = 0; i < indexedTerms.length; i += 1) {
      const entry = indexedTerms[i];
      if (selectedCategory !== 'All' && entry.item.category !== selectedCategory) {
        continue;
      }
      if (!q) {
        results.push(entry.item);
        continue;
      }

      const inTerm =
        entry.termLower.includes(q) ||
        entry.transLower.includes(q) ||
        entry.metaLower.includes(q);
      if (searchScope === 'terms') {
        if (inTerm) results.push(entry.item);
        continue;
      }
      const inDef = entry.defLower.includes(q);
      if (searchScope === 'definitions') {
        if (inDef) results.push(entry.item);
        continue;
      }
      const inExamples = entry.exLower.includes(q);
      if (searchScope === 'examples') {
        if (inExamples) results.push(entry.item);
        continue;
      }
      if (inTerm || inDef || inExamples) {
        results.push(entry.item);
      }
    }
    return results;
  }, [indexedTerms, searchQuery, searchScope, selectedCategory]);

  const recentTerms = useMemo(() => {
    const termMap = new Map(terms.map((t) => [t.id, t]));
    return recentTermIds
      .map((id) => termMap.get(id))
      .filter((t): t is DictionaryTerm => Boolean(t));
  }, [terms, recentTermIds]);

  const handlePasteFromClipboard = async () => {
    searchInputRef.current?.focus();
    try {
      if (!navigator.clipboard?.readText) {
        showToast('اضغط مطولاً داخل حقل البحث واختر «لصق» من لوحة الهاتف', 'info');
        return;
      }
      const clipText = await navigator.clipboard.readText();
      const normalizedClip = clipText ? clipText.replace(/[\r\n]+/g, ' ').trim() : '';
      if (normalizedClip) {
        isComposingRef.current = false;
        lastPushedQueryRef.current = normalizedClip;
        setDraftQuery(normalizedClip);
        onSearchQueryChange(normalizedClip);
        setIsSearchFocused(true);
        setActiveSuggestionIndex(-1);
        showToast('تم لصق الكلمة وعرض النتائج');
      } else {
        showToast('الحافظة فارغة حالياً', 'info');
      }
    } catch {
      showToast('تعذر الوصول المباشر للحافظة. اضغط مطولاً داخل الحقل واختر «لصق»', 'info');
    }
  };

  const suggestedTerms = useMemo(() => {
    const query = deferredDraftQuery.trim().toLowerCase();
    if (!query) return [];

    const scored: { item: DictionaryTerm; score: number }[] = [];
    for (let i = 0; i < indexedTerms.length; i += 1) {
      const entry = indexedTerms[i];
      if (selectedCategory !== 'All' && entry.item.category !== selectedCategory) {
        continue;
      }
      let score = Number.POSITIVE_INFINITY;

      if (entry.termLower === query) score = 0;
      else if (entry.termLower.startsWith(query)) score = 1;
      else if (entry.synLowers.some((value) => value === query)) score = 2;
      else if (entry.synLowers.some((value) => value.startsWith(query))) score = 3;
      else if (entry.transLower.startsWith(query)) score = 4;
      else if (entry.termLower.includes(query) || entry.synLowers.some((value) => value.includes(query))) score = 5;
      else if (entry.transLower.includes(query)) score = 6;

      if (Number.isFinite(score)) {
        scored.push({ item: entry.item, score });
      }
    }

    return scored
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.item.term.localeCompare(b.item.term, undefined, { sensitivity: 'base' })
      )
      .slice(0, 6)
      .map((entry) => entry.item);
  }, [indexedTerms, deferredDraftQuery, selectedCategory]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = draftQuery.trim();
    if (!query) {
      searchInputRef.current?.focus();
      return;
    }

    const selectedSuggestion =
      activeSuggestionIndex >= 0 ? suggestedTerms[activeSuggestionIndex] : undefined;
    if (selectedSuggestion) {
      handleSelectSuggestion(selectedSuggestion);
      return;
    }

    lastPushedQueryRef.current = query;
    setDraftQuery(query);
    onSearchQueryChange(query);
    setIsSearchFocused(false);
    setActiveSuggestionIndex(-1);
  };

  const handleSelectSuggestion = (item: DictionaryTerm) => {
    lastPushedQueryRef.current = item.term;
    setDraftQuery(item.term);
    onSearchQueryChange(item.term);
    setIsSearchFocused(false);
    setActiveSuggestionIndex(-1);
    onOpenTermDetail(item.id);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Android WebView keyboards do not consistently dispatch the form submit event
    // for the IME Search/Enter action. Explicitly submit after text composition ends.
    if (
      event.key === 'Enter' &&
      !event.nativeEvent.isComposing &&
      !isComposingRef.current
    ) {
      event.preventDefault();
      const form = event.currentTarget.form;
      if (form) {
        if (typeof form.requestSubmit === 'function') {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }
      return;
    }
    if (event.key === 'ArrowDown' && suggestedTerms.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((current) =>
        current < suggestedTerms.length - 1 ? current + 1 : 0
      );
    } else if (event.key === 'ArrowUp' && suggestedTerms.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((current) =>
        current > 0 ? current - 1 : suggestedTerms.length - 1
      );
    } else if (event.key === 'Escape') {
      setIsSearchFocused(false);
      setActiveSuggestionIndex(-1);
    }
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query || !query.trim()) return text;
    const trimmed = query.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    const lowerTarget = trimmed.toLowerCase();
    return parts.map((part, idx) =>
      part.toLowerCase() === lowerTarget ? (
        <mark
          key={idx}
          className="bg-emerald-500/25 text-emerald-900 dark:text-emerald-200 px-0 rounded-[2px] font-semibold"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const isDefaultView = searchQuery.trim() === '' && selectedCategory === 'All';
  const displayedFilteredTerms = useMemo(
    () => filteredTerms.slice(0, visibleLimit),
    [filteredTerms, visibleLimit]
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5 w-full overflow-x-clip box-border">
      {/* Search Bar, Submit Action, and Live Suggestions */}
      <div className="space-y-2 w-full">
        <form
          onSubmit={handleSearchSubmit}
          className="relative w-full"
          role="search"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={draftQuery}
              onChange={(event) => {
                const nextValue = event.target.value;
                setDraftQuery(nextValue);
                setActiveSuggestionIndex(-1);
                setIsSearchFocused(true);
                lastPushedQueryRef.current = nextValue;
                React.startTransition(() => {
                  onSearchQueryChange(nextValue);
                });
              }}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                isComposingRef.current = false;
                const committed = event.currentTarget.value;
                lastPushedQueryRef.current = committed;
                setDraftQuery(committed);
                onSearchQueryChange(committed);
              }}
              onFocus={() => {
                if (blurTimeoutRef.current !== null) {
                  window.clearTimeout(blurTimeoutRef.current);
                  blurTimeoutRef.current = null;
                }
                setIsSearchFocused(true);
              }}
              onPaste={(event) => {
                const pastedText = event.clipboardData?.getData('text/plain') || '';
                const inputEl = event.currentTarget;
                // Do not call preventDefault(): keep Android WebView InputConnection synchronized
                // so dismissing the soft keyboard never reverts or clears the pasted word.
                window.setTimeout(() => {
                  const domValue = inputEl?.value || '';
                  const resolved =
                    domValue || pastedText.replace(/[\r\n]+/g, ' ').trim();
                  if (!resolved) return;
                  isComposingRef.current = false;
                  lastPushedQueryRef.current = resolved;
                  setDraftQuery(resolved);
                  onSearchQueryChange(resolved);
                  setActiveSuggestionIndex(-1);
                  setIsSearchFocused(true);
                }, 0);
              }}
              onBlur={(event) => {
                isComposingRef.current = false;
                const latestValue = event.currentTarget.value;
                if (latestValue && latestValue !== lastPushedQueryRef.current) {
                  lastPushedQueryRef.current = latestValue;
                  setDraftQuery(latestValue);
                  onSearchQueryChange(latestValue);
                }
                if (blurTimeoutRef.current !== null) {
                  window.clearTimeout(blurTimeoutRef.current);
                }
                blurTimeoutRef.current = window.setTimeout(() => {
                  setIsSearchFocused(false);
                  blurTimeoutRef.current = null;
                }, 220);
              }}
              onKeyDown={handleSearchKeyDown}
              dir="auto"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              aria-label="ابحث عن كلمة أو ترجمتها"
              aria-autocomplete="list"
              aria-controls="dictionary-search-suggestions"
              aria-expanded={isSearchFocused && suggestedTerms.length > 0}
              placeholder="ابحث بالإنجليزية أو العربية أو انطق الكلمة..."
              className="w-full min-h-[50px] pr-10 pl-32 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-colors shadow-sm [user-select:text] [-webkit-user-select:text]"
            />
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleVoiceSearch}
                className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl transition-all ${
                  isVoiceListening
                    ? 'bg-rose-600 text-white animate-pulse shadow-sm'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                }`}
                title={isVoiceListening ? 'إيقاف الإدخال الصوتي' : 'بحث صوتي (نطق الكلمة)'}
                aria-label={isVoiceListening ? 'إيقاف الإدخال الصوتي' : 'إدخال الكلمة صوتياً'}
              >
                {isVoiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {draftQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    isComposingRef.current = false;
                    lastPushedQueryRef.current = '';
                    setDraftQuery('');
                    onSearchQueryChange('');
                    setActiveSuggestionIndex(-1);
                    searchInputRef.current?.focus();
                  }}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  title="مسح"
                  aria-label="مسح البحث"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="min-h-[34px] flex items-center gap-1 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors whitespace-nowrap"
                  title="لصق من الحافظة"
                >
                  <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>لصق</span>
                </button>
              )}
            </div>

            {isSearchFocused && suggestedTerms.length > 0 && (
              <div
                id="dictionary-search-suggestions"
                role="listbox"
                aria-label="اقتراحات البحث"
                className="absolute top-full right-0 left-0 z-40 mt-2 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl"
              >
                <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  اقتراحات مطابقة · اختر كلمة لعرض ترجمتها
                </div>
                {suggestedTerms.map((item, index) => (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={activeSuggestionIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectSuggestion(item)}
                    className={`w-full min-h-[54px] px-3.5 py-2 flex items-center justify-between gap-2.5 text-right border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors cursor-pointer ${
                      activeSuggestionIndex === index
                        ? 'bg-emerald-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        onTriggerTTS(item.term, `search-sugg-${item.id}`, 'en-US');
                      }}
                      className={`min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl shrink-0 transition-colors ${
                        speakingKey === `search-sugg-${item.id}`
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400'
                      }`}
                      title="نطق المصطلح"
                      aria-label={`نطق ${item.term}`}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <span className="min-w-0 flex-1">
                      <span dir="ltr" className="block text-left text-sm font-bold text-slate-900 dark:text-white truncate">
                        {item.term}
                      </span>
                      <span className="block text-xs text-emerald-700 dark:text-emerald-300 truncate mt-0.5">
                        {item.translation}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {item.category === 'General' ? 'عام' : item.category === 'Medical' ? 'طبي' : item.category}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </form>

        {isVoiceListening && (
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-rose-700 dark:text-rose-300">
                  جاري الاستماع ({voiceLang === 'en-US' ? 'إنجليزي' : 'عربي'})... انطق الكلمة أو المصطلح
                </div>
                {voiceInterimText ? (
                  <div dir="auto" className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">
                    {voiceInterimText}
                  </div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={stopVoiceSearch}
              className="min-h-[34px] px-3 rounded-xl bg-rose-600 text-white text-xs font-extrabold shrink-0"
            >
              إيقاف
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenFilterMenu}
              className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors ${
                selectedCategory !== 'All' || searchScope !== 'all'
                  ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400'
                  : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-emerald-500/40'
              }`}
              aria-label="تصفية نطاق البحث"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">{activeFilterSummary}</span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
            </button>

            <button
              type="button"
              onClick={() => setVoiceLang((prev) => (prev === 'en-US' ? 'ar-SA' : 'en-US'))}
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/40 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0 transition-colors"
              title="تبديل لغة الإدخال الصوتي بين الإنجليزية والعربية"
              aria-label="لغة الإدخال الصوتي"
            >
              <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>صوت: {voiceLang === 'en-US' ? 'EN' : 'عربي'}</span>
            </button>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            اكتب أو الصق أو انطق أي مصطلح طبي لعرض ترجمته فوراً
          </p>
        </div>
      </div>

      {/* Dynamic Content Area */}
      {isDefaultView ? (
        <div className="space-y-3.5">
          {/* Sleek Single-Line Term of the Day Strip */}
          {termOfDay && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 px-3.5 py-2.5 flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  مصطلح اليوم:
                </span>
                <button
                  type="button"
                  onClick={() => onOpenTermDetail(termOfDay.id)}
                  dir="ltr"
                  className="text-sm font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 truncate text-left transition-colors"
                >
                  {termOfDay.term}
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onTriggerTTS(termOfDay.term, `tod-tts-${termOfDay.id}`, 'en-US')}
                  className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl transition-colors ${
                    speakingKey === `tod-tts-${termOfDay.id}`
                      ? 'bg-emerald-600 text-white'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400'
                  }`}
                  title="نطق مصطلح اليوم"
                  aria-label="نطق مصطلح اليوم"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onShuffleTermOfDay}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                  title="تبديل المصطلح"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => onToggleFavoriteTerm(termOfDay.id, e)}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-500"
                  title="المفضلة"
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      termOfDay.favorite ? 'fill-amber-400' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Recently Searched Terms List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 min-w-0">
                <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="truncate">آخر عمليات البحث</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono tabular-nums shrink-0">
                  {recentTerms.length}
                </span>
              </h3>
              {recentTerms.length > 0 && onClearRecentTerms && (
                <button
                  type="button"
                  onClick={onClearRecentTerms}
                  className="text-[11px] font-bold text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 flex items-center gap-1 shrink-0 whitespace-nowrap transition-colors"
                  title="مسح سجل البحث الأخير"
                >
                  <Trash2 className="w-3 h-3 shrink-0" />
                  <span>مسح السجل</span>
                </button>
              )}
            </div>

            {recentTerms.length > 0 ? (
              <div className="divide-y divide-slate-200/75 dark:divide-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
                {recentTerms.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpenTermDetail(item.id)}
                    className="px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-emerald-500/10 transition-colors cursor-pointer flex items-center justify-between gap-2.5 group"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTriggerTTS(item.term, `recent-tts-${item.id}`, 'en-US');
                        }}
                        className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl transition-colors ${
                          speakingKey === `recent-tts-${item.id}`
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400'
                        }`}
                        title="نطق المصطلح"
                        aria-label={`نطق ${item.term}`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => onToggleFavoriteTerm(item.id, e)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-amber-500"
                        title="المفضلة"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            item.favorite ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>
                      {onRemoveRecentTerm && (
                        <button
                          type="button"
                          onClick={(e) => onRemoveRecentTerm(item.id, e)}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
                          title="إزالة من السجل الأخير"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-left">
                      <span
                        dir="ltr"
                        className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors break-words"
                      >
                        {item.term}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 text-right sm:text-left break-words">
                        {item.translation}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-center space-y-1.5 shadow-xs">
                <Clock className="w-6 h-6 text-slate-400 mx-auto" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  لا توجد مصطلحات تم البحث عنها مؤخراً
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  ابحث عن أي مصطلح طبي في شريط البحث أعلاه، وسيظهر هنا تلقائياً لسرعة الرجوع إليه.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Filtered Search Results View — Compact English Terms */
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              المصطلحات المطابقة:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                {filteredTerms.length.toLocaleString()}
              </strong>
            </span>
            <button
              type="button"
              onClick={onResetFilters}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>

          {filteredTerms.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                لا توجد ترجمة محفوظة مطابقة لكلمة «{searchQuery}»
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                يمكنك توليد ترجمتها الجذرية وإضافتها للقاموس أوفلاين من صفحة مكتبتي:
              </p>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => onAddNewTermFromQuery(searchQuery)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-xs"
                >
                  إضافة «{searchQuery}» أوفلاين في مكتبتي
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="divide-y divide-slate-200/75 dark:divide-slate-800/80 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 overflow-hidden shadow-xs">
                {displayedFilteredTerms.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onOpenTermDetail(item.id)}
                    className="px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-emerald-500/10 transition-colors cursor-pointer flex items-center justify-between gap-2.5 group"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTriggerTTS(item.term, `search-res-${item.id}`, 'en-US');
                        }}
                        className={`min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl transition-colors ${
                          speakingKey === `search-res-${item.id}`
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400'
                        }`}
                        title="نطق المصطلح"
                        aria-label={`نطق ${item.term}`}
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => onToggleFavoriteTerm(item.id, e)}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-amber-500 shrink-0"
                        title="المفضلة"
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            item.favorite ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-left">
                      <span
                        dir="ltr"
                        className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors break-words"
                      >
                        {highlightMatch(item.term, searchQuery)}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 text-right sm:text-left break-words">
                        {highlightMatch(item.translation, searchQuery)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {filteredTerms.length > visibleLimit && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 80)}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold transition-colors"
                  >
                    عرض {Math.min(80, filteredTerms.length - visibleLimit).toLocaleString()} نتيجة إضافية (المتبقي {(filteredTerms.length - visibleLimit).toLocaleString()})
                  </button>
                  {filteredTerms.length - visibleLimit > 80 && (
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleLimit((prev) => Math.min(filteredTerms.length, prev + 250))
                      }
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-colors"
                    >
                      +{Math.min(250, filteredTerms.length - visibleLimit).toLocaleString()} نتيجة
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
