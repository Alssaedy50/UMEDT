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
  Trash2
} from 'lucide-react';
import { DictionaryTerm, LinkedSentence } from '../types/lexicon';

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
  onInspectMorphologyForQuery,
  onAddNewTermFromQuery,
  showToast
}) => {
  const [visibleLimit, setVisibleLimit] = React.useState<number>(250);
  const [draftQuery, setDraftQuery] = React.useState(searchQuery);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(-1);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDraftQuery(searchQuery);
    setActiveSuggestionIndex(-1);
  }, [searchQuery]);

  React.useEffect(() => {
    setVisibleLimit(250);
  }, [searchQuery, searchScope, selectedCategory]);

  const filteredTerms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return terms.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;

      const inTerm =
        item.term.toLowerCase().includes(q) ||
        item.translation.toLowerCase().includes(q) ||
        (item.umdCode && item.umdCode.toLowerCase().includes(q)) ||
        (item.specialty && item.specialty.toLowerCase().includes(q));
      const inDef =
        item.definitionAr.toLowerCase().includes(q) ||
        item.definitionEn.toLowerCase().includes(q) ||
        (item.clinicalNote && item.clinicalNote.toLowerCase().includes(q));
      const inExamples = item.examples.some(
        (ex) => ex.en.toLowerCase().includes(q) || ex.ar.toLowerCase().includes(q)
      );

      if (searchScope === 'terms') return inTerm;
      if (searchScope === 'definitions') return inDef;
      if (searchScope === 'examples') return inExamples;
      return inTerm || inDef || inExamples;
    });
  }, [terms, searchQuery, searchScope, selectedCategory]);

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
      if (clipText?.trim()) {
        setDraftQuery(clipText.trim());
        setIsSearchFocused(true);
        setActiveSuggestionIndex(-1);
        showToast('تم جلب النص من الحافظة؛ اضغط بحث لإظهار النتيجة');
      } else {
        showToast('الحافظة فارغة حالياً', 'info');
      }
    } catch {
      showToast('تعذر الوصول المباشر للحافظة. اضغط مطولاً داخل الحقل واختر «لصق»', 'info');
    }
  };

  const suggestedTerms = useMemo(() => {
    const query = draftQuery.trim().toLocaleLowerCase();
    if (!query) return [];

    return terms
      .filter((item) => selectedCategory === 'All' || item.category === selectedCategory)
      .map((item) => {
        const term = item.term.toLocaleLowerCase();
        const translation = item.translation.toLocaleLowerCase();
        const synonyms = (item.relations?.synonyms || []).map((value) =>
          value.toLocaleLowerCase()
        );
        let score = Number.POSITIVE_INFINITY;

        if (term === query) score = 0;
        else if (term.startsWith(query)) score = 1;
        else if (synonyms.some((value) => value === query)) score = 2;
        else if (synonyms.some((value) => value.startsWith(query))) score = 3;
        else if (translation.startsWith(query)) score = 4;
        else if (term.includes(query) || synonyms.some((value) => value.includes(query))) score = 5;
        else if (translation.includes(query)) score = 6;

        return { item, score };
      })
      .filter((entry) => Number.isFinite(entry.score))
      .sort(
        (a, b) =>
          a.score - b.score ||
          a.item.term.localeCompare(b.item.term, undefined, { sensitivity: 'base' })
      )
      .slice(0, 6)
      .map((entry) => entry.item);
  }, [terms, draftQuery, selectedCategory]);

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

    onSearchQueryChange(query);
    setIsSearchFocused(false);
    setActiveSuggestionIndex(-1);
  };

  const handleSelectSuggestion = (item: DictionaryTerm) => {
    setDraftQuery(item.term);
    onSearchQueryChange(item.term);
    setIsSearchFocused(false);
    setActiveSuggestionIndex(-1);
    onOpenTermDetail(item.id);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
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
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === query.trim().toLowerCase() ? (
        <mark
          key={idx}
          className="bg-emerald-500/25 text-emerald-900 dark:text-emerald-200 px-1 rounded font-semibold"
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
          className="relative w-full flex items-stretch gap-2"
          role="search"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={draftQuery}
              onChange={(event) => {
                setDraftQuery(event.target.value);
                setActiveSuggestionIndex(-1);
                setIsSearchFocused(true);
              }}
              onFocus={() => setIsSearchFocused(true)}
              onPaste={(event) => {
                const pastedText = event.clipboardData.getData('text/plain');
                if (!pastedText) return;
                event.preventDefault();
                const nextQuery = pastedText.trim();
                setDraftQuery(nextQuery);
                setActiveSuggestionIndex(-1);
                setIsSearchFocused(Boolean(nextQuery));
              }}
              onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 320)}
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
              placeholder="ابحث بالإنجليزية أو العربية..."
              className="w-full min-h-[50px] pr-10 pl-16 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-colors shadow-sm [user-select:text] [-webkit-user-select:text]"
            />
            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {draftQuery ? (
                <button
                  type="button"
                  onClick={() => {
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
                  className="min-h-[34px] flex items-center gap-1 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors whitespace-nowrap"
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
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={activeSuggestionIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelectSuggestion(item)}
                    className={`w-full min-h-[54px] px-3.5 py-2 flex items-center justify-between gap-3 text-right border-b last:border-b-0 border-slate-100 dark:border-slate-800 transition-colors ${
                      activeSuggestionIndex === index
                        ? 'bg-emerald-500/10'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/70'
                    }`}
                  >
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
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!draftQuery.trim()}
            className="min-h-[50px] px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow-sm"
            aria-label="إدخال الكلمة والبحث عن ترجمتها"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>بحث</span>
          </button>
        </form>

        <div className="flex items-center justify-between gap-2 pt-0.5">
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

          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
            اكتب أو الصق أي مصطلح طبي أو كلمة للبحث الفوري
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
                  onClick={onShuffleTermOfDay}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                  title="تبديل المصطلح"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => onToggleFavoriteTerm(termOfDay.id, e)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-amber-500"
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
                        onClick={(e) => onToggleFavoriteTerm(item.id, e)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500"
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
                          className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors"
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
                    <button
                      type="button"
                      onClick={(e) => onToggleFavoriteTerm(item.id, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 shrink-0"
                      title="المفضلة"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          item.favorite ? 'fill-amber-400 text-amber-400' : ''
                        }`}
                      />
                    </button>

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
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setVisibleLimit((prev) => prev + 250)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold transition-colors"
                  >
                    عرض 250 نتيجة إضافية (المتبقي {(filteredTerms.length - visibleLimit).toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(filteredTerms.length)}
                    className="px-3.5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold transition-colors"
                  >
                    عرض الكل ({filteredTerms.length.toLocaleString()})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
