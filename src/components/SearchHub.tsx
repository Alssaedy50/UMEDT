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
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        showToast(
          'متصفحك لا يدعم القراءة المباشرة من الحافظة؛ يرجى اللصق يدوياً داخل حقل البحث',
          'info'
        );
        return;
      }
      const clipText = await navigator.clipboard.readText();
      if (clipText && clipText.trim()) {
        onSearchQueryChange(clipText.trim());
        showToast('تم لصق النص من الحافظة بنجاح');
      } else {
        showToast('الحافظة فارغة حالياً', 'info');
      }
    } catch {
      showToast(
        'رفض المتصفح صلاحية قراءة الحافظة؛ يرجى الضغط مطولاً أو استخدام Ctrl+V للصق',
        'info'
      );
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
      {/* Search Bar + Unified Filter Popover Button */}
      <div className="flex items-center gap-2 w-full">
        <div className="relative flex-1 min-w-0 flex items-center">
          <Search className="w-5 h-5 text-emerald-600 dark:text-emerald-400 absolute right-4 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="ابحث في المصطلحات، الشروحات، الجمل الخاصة بها، أو أكواد UMD..."
            className="w-full pr-11 pl-20 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 focus:border-emerald-500 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-colors shadow-sm"
          />
          <div className="absolute left-2 flex items-center gap-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchQueryChange('')}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                title="مسح"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="min-h-[36px] flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
                title="لصق من الحافظة"
              >
                <ClipboardPaste className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>لصق</span>
              </button>
            )}
          </div>
        </div>

        {/* Unified Filter & Scope Popover Trigger Button */}
        <button
          type="button"
          onClick={onOpenFilterMenu}
          className={`min-h-[50px] px-3.5 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2 shrink-0 transition-colors ${
            selectedCategory !== 'All' || searchScope !== 'all'
              ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-400'
              : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-emerald-500/40'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">{activeFilterSummary}</span>
          <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-75" />
        </button>
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
                  className="text-sm font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 break-words text-left transition-colors"
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
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>آخر المصطلحات التي تم البحث عنها</span>
              </h3>
              <div className="flex items-center gap-2.5">
                {recentTerms.length > 0 && onClearRecentTerms && (
                  <button
                    type="button"
                    onClick={onClearRecentTerms}
                    className="text-[11px] font-semibold text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 flex items-center gap-1 transition-colors"
                    title="مسح سجل البحث الأخير"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>مسح السجل</span>
                  </button>
                )}
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {recentTerms.length}
                </span>
              </div>
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
                        className="text-sm sm:text-[15px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors break-words"
                      >
                        {item.term}
                      </span>
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400/90 text-right sm:text-left truncate">
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
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>

          {filteredTerms.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2.5">
              <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                لا توجد مصطلحات مطابقة في هذا النطاق
              </p>
              <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => onInspectMorphologyForQuery(searchQuery)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 text-white dark:bg-slate-800 text-xs font-semibold"
                >
                  تفكيك الجذور لـ &ldquo;{searchQuery}&rdquo;
                </button>
                <button
                  type="button"
                  onClick={() => onAddNewTermFromQuery(searchQuery)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-bold"
                >
                  إضافة مصطلح جديد
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
                        className="text-sm sm:text-[15px] font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors break-words"
                      >
                        {highlightMatch(item.term, searchQuery)}
                      </span>
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400/90 text-right sm:text-left truncate">
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
