import React, { useState, useMemo, useRef } from 'react';
import { X, Volume2, Copy, Sparkles, CheckCircle2, Keyboard } from 'lucide-react';
import { DictionaryTerm, ClinicalAbbreviation } from '../types/lexicon';
import { MobileSafeInput } from './MobileSafeInput';

interface UmedtKeyboardPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  terms: DictionaryTerm[];
  abbreviations: ClinicalAbbreviation[];
  onTriggerTTS: (text: string, key: string) => void;
  onShowFloatingCard: (card: {
    id?: string;
    term: string;
    translation: string;
    phonetic?: string;
    pos?: string;
    category?: string;
    definitionAr?: string;
    definitionEn?: string;
    exampleEn?: string;
    exampleAr?: string;
    matchedInput?: string;
  }) => void;
  showToast: (msg: string, type?: string) => void;
}

const EN_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
  ['123', '🌐', 'AR', ',', 'SPACE', '.', '/', '⏎']
];

const AR_ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['⇧', 'ذ', 'ئ', 'ء', 'ؤ', 'ر', 'لا', 'ى', 'ة', 'و', 'ز', 'ظ', '⌫'],
  ['123', '🌐', 'EN', '،', 'SPACE', '.', '؟', '⏎']
];

const AR_SHIFT_ROWS: string[][] = [
  ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '٠'],
  ['َ', 'ً', 'ُ', 'ٌ', 'لإ', 'إ', '‘', '÷', '×', '؛', '<', '>'],
  ['ِ', 'ٍ', ']', '[', 'لأ', 'أ', 'ـ', '،', '/', ':', '"'],
  ['⇧', '~', 'ْ', 'ّ', 'لآ', 'آ', '’', ',', '.', '؟', '!', '⌫'],
  ['123', '🌐', 'EN', '،', 'SPACE', '.', '؟', '⏎']
];

const SYM_ROWS_1: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '%', '&', '-', '+', '(', ')', '/'],
  ['#+=', '*', '"', "'", ':', ';', '!', '?', '=', '⌫'],
  ['ABC', '🌐', 'AR/EN', ',', 'SPACE', '.', '_', '⏎']
];

const SYM_ROWS_2: string[][] = [
  ['~', '`', '|', '•', '√', 'π', '÷', '×', '¶', '∆'],
  ['°', '±', 'μ', '≤', '≥', '≠', '≈', '∞', '%', '‰'],
  ['123', '\\', '{', '}', '[', ']', '<', '>', '^', '⌫'],
  ['ABC', '🌐', 'AR/EN', ',', 'SPACE', '.', '-', '⏎']
];

export const UmedtKeyboardPreviewModal: React.FC<UmedtKeyboardPreviewModalProps> = ({
  isOpen,
  onClose,
  terms,
  abbreviations,
  onTriggerTTS,
  onShowFloatingCard,
  showToast
}) => {
  const [arabicLayout, setArabicLayout] = useState<boolean>(true);
  const [symbolMode, setSymbolMode] = useState<'letters' | 'sym1' | 'sym2'>('letters');
  const [shiftActive, setShiftActive] = useState<boolean>(false);
  const [capsLockActive, setCapsLockActive] = useState<boolean>(false);
  const [textValue, setTextValue] = useState<string>('');
  const [cursorPos, setCursorPos] = useState<number>(0);
  const [simulatedClipboard, setSimulatedClipboard] = useState<string>(() =>
    terms[0]?.term || 'Thrombocytopenia'
  );
  const lastShiftTapRef = useRef<number>(0);
  const lastSpaceTapRef = useRef<number>(0);
  const holdTimerRef = useRef<number | null>(null);

  // Determine current word before cursor for live medical autocomplete
  const currentWordBeforeCursor = useMemo(() => {
    const before = textValue.slice(0, cursorPos);
    const match = before.match(/[\p{L}\p{N}-]+$/u);
    return match ? match[0] : '';
  }, [textValue, cursorPos]);

  // Live dictionary suggestions matching currentWordBeforeCursor
  const liveSuggestions = useMemo(() => {
    const q = currentWordBeforeCursor.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: Array<{
      id?: string;
      term: string;
      translation: string;
      phonetic?: string;
      pos?: string;
      category?: string;
      definitionAr?: string;
      definitionEn?: string;
    }> = [];

    for (const t of terms) {
      if (
        t.term.toLowerCase().startsWith(q) ||
        t.translation.toLowerCase().startsWith(q) ||
        t.term.toLowerCase().includes(q)
      ) {
        results.push({
          id: t.id,
          term: t.term,
          translation: t.translation,
          phonetic: t.phonetic,
          pos: t.pos,
          category: t.category,
          definitionAr: t.definitionAr,
          definitionEn: t.definitionEn
        });
        if (results.length >= 4) break;
      }
    }
    if (results.length < 4) {
      for (const a of abbreviations) {
        if (!a?.abbr) continue;
        const expEn = a.defaultExpansionEn || a.candidates?.[0]?.expansionEn || '';
        const transAr = a.defaultTranslationAr || a.candidates?.[0]?.translationAr || a.abbr;
        if (
          a.abbr.toLowerCase().startsWith(q) ||
          expEn.toLowerCase().startsWith(q) ||
          transAr.toLowerCase().startsWith(q)
        ) {
          results.push({
            term: a.abbr,
            translation: transAr,
            phonetic: expEn,
            pos: 'Abbr',
            category: a.category || 'Medical',
            definitionAr: `${transAr} (${expEn})`,
            definitionEn: expEn
          });
          if (results.length >= 4) break;
        }
      }
    }
    return results;
  }, [currentWordBeforeCursor, terms, abbreviations]);

  // Match for the current simulated clipboard
  const clipboardMatch = useMemo(() => {
    const q = simulatedClipboard.trim().toLowerCase();
    if (!q) return null;
    const hit = terms.find(
      (t) =>
        t.term.toLowerCase() === q ||
        t.translation.toLowerCase() === q ||
        (t.relations?.synonyms || []).some((s) => s.toLowerCase() === q)
    );
    if (hit) {
      return {
        id: hit.id,
        term: hit.term,
        translation: hit.translation,
        phonetic: hit.phonetic,
        pos: hit.pos,
        category: hit.category,
        definitionAr: hit.definitionAr,
        definitionEn: hit.definitionEn,
        exampleEn: hit.examples?.[0]?.en,
        exampleAr: hit.examples?.[0]?.ar
      };
    }
    const abbrHit = abbreviations.find((a) => a?.abbr?.toLowerCase() === q);
    if (abbrHit) {
      const expEn = abbrHit.defaultExpansionEn || abbrHit.candidates?.[0]?.expansionEn || '';
      const transAr =
        abbrHit.defaultTranslationAr || abbrHit.candidates?.[0]?.translationAr || abbrHit.abbr;
      return {
        term: abbrHit.abbr,
        translation: transAr,
        phonetic: expEn,
        pos: 'Abbr',
        category: abbrHit.category || 'Medical',
        definitionAr: `${transAr} (${expEn})`,
        definitionEn: expEn
      };
    }
    return {
      term: 'Thrombocytopenia',
      translation: 'نقص الصفيحات الدموية',
      phonetic: '/ˌθrɒmboʊˌsaɪtoʊˈpiːniə/',
      pos: 'Noun',
      category: 'Medical',
      definitionAr: 'انخفاض غير طبيعي في عدد الصفيحات الدموية في الدم مما يزيد قابلية النزف.',
      definitionEn: 'Abnormally low level of platelets in the circulating blood.'
    };
  }, [simulatedClipboard, terms, abbreviations]);

  if (!isOpen) return null;

  const activeRows =
    symbolMode === 'sym1'
      ? SYM_ROWS_1
      : symbolMode === 'sym2'
      ? SYM_ROWS_2
      : arabicLayout
      ? shiftActive || capsLockActive
        ? AR_SHIFT_ROWS
        : AR_ROWS
      : EN_ROWS;

  const insertAtCursor = (str: string) => {
    const before = textValue.slice(0, cursorPos);
    const after = textValue.slice(cursorPos);
    const next = `${before}${str}${after}`;
    setTextValue(next);
    setCursorPos(before.length + str.length);
  };

  const handleBackspace = () => {
    setTextValue((prev) => {
      if (cursorPos <= 0 || prev.length === 0) return prev;
      const next = `${prev.slice(0, cursorPos - 1)}${prev.slice(cursorPos)}`;
      setCursorPos((pos) => Math.max(0, pos - 1));
      return next;
    });
  };

  const handleKeyPress = (label: string) => {
    if (label === 'AR' || label === 'EN' || label === 'AR/EN') {
      setArabicLayout((prev) => !prev);
      setSymbolMode('letters');
      setShiftActive(false);
      setCapsLockActive(false);
      return;
    }
    if (label === '123') {
      setSymbolMode('sym1');
      return;
    }
    if (label === '#+=') {
      setSymbolMode('sym2');
      return;
    }
    if (label === 'ABC') {
      setSymbolMode('letters');
      return;
    }
    if (label === '⇧') {
      const now = Date.now();
      if (!arabicLayout && now - lastShiftTapRef.current < 380) {
        setCapsLockActive(true);
        setShiftActive(true);
      } else if (capsLockActive) {
        setCapsLockActive(false);
        setShiftActive(false);
      } else {
        setShiftActive((prev) => !prev);
      }
      lastShiftTapRef.current = now;
      return;
    }
    if (label === '🌐') {
      const bridge = (window as unknown as {
        UMEDAndroidBridge?: { showUmedtKeyboardPicker?: () => void };
      }).UMEDAndroidBridge;
      if (bridge?.showUmedtKeyboardPicker) {
        bridge.showUmedtKeyboardPicker();
      } else {
        setArabicLayout((prev) => !prev);
        showToast('تم تبديل لغة لوحة مفاتيح UMEDT', 'info');
      }
      return;
    }
    if (label === '⌫') {
      handleBackspace();
      return;
    }
    if (label === 'SPACE') {
      const now = Date.now();
      if (
        now - lastSpaceTapRef.current < 320 &&
        cursorPos >= 2 &&
        textValue[cursorPos - 1] === ' ' &&
        /[\p{L}\p{N}]/u.test(textValue[cursorPos - 2])
      ) {
        const before = textValue.slice(0, cursorPos - 1);
        const after = textValue.slice(cursorPos);
        setTextValue(`${before}. ${after}`);
        setCursorPos(before.length + 2);
        lastSpaceTapRef.current = 0;
        return;
      }
      lastSpaceTapRef.current = now;
      insertAtCursor(' ');
      return;
    }
    if (label === '⏎') {
      const match = liveSuggestions[0] || clipboardMatch;
      if (match) {
        onShowFloatingCard(match);
        showToast(`تم عرض بطاقة المصطلح: ${match.term}`);
      } else {
        insertAtCursor('\n');
      }
      return;
    }

    let out = label;
    if (
      symbolMode === 'letters' &&
      !arabicLayout &&
      label.length === 1 &&
      /[a-zA-Z]/.test(label)
    ) {
      out = shiftActive || capsLockActive ? label.toUpperCase() : label.toLowerCase();
    }
    insertAtCursor(out);
    if (shiftActive && !capsLockActive) {
      setShiftActive(false);
    }
  };

  const quickTokens = arabicLayout
    ? ['أ', 'إ', 'آ', 'ة', 'ى', '؟', '،', 'mg', 'mL', '%']
    : ['mg', 'mL', 'mmHg', '°C', 'IV', 'PO', 'bid', 'tid', '/', '%'];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                فحص ومعاينة لوحة مفاتيح UMEDT الطبية الكاملة
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                جرّب جميع الأزرار (العربية الكاملة 28 حرفًا + الهمزات والتشكيل + الإنجليزية + الأرقام + الرموز الطبية + الإكمال التلقائي)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Test Input Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
              حقل اختبار الكتابة المباشر والإكمال التلقائي:
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const toCopy = textValue.trim() || simulatedClipboard;
                  setSimulatedClipboard(toCopy);
                  showToast(`تم نسخ "${toCopy}" إلى حافظة الكيبورد`);
                  if (clipboardMatch) {
                    onShowFloatingCard(clipboardMatch);
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-extrabold flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>نسخ النص واختبار البطاقة العائمة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTextValue('');
                  setCursorPos(0);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold"
              >
                مسح
              </button>
            </div>
          </div>

          <MobileSafeInput
            value={textValue}
            onValueChange={(nextVal) => {
              setTextValue(nextVal);
              setCursorPos(nextVal.length);
            }}
            placeholder="اضغط على أزرار لوحة مفاتيح UMEDT بالأسفل للكتابة أو اختبار الإكمال الطبي..."
            className="w-full min-h-[46px] px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 border-emerald-500/40 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
          />
        </div>

        {/* ====================================================================
            EXACT UMEDT NATIVE KEYBOARD REPLICA & LIVE TESTER
           ==================================================================== */}
        <div
          dir="ltr"
          className="rounded-2xl bg-[#0B1320] p-2 sm:p-2.5 border border-slate-800 shadow-inner space-y-1.5 select-none"
        >
          {/* 1. Top Smart Medical Toolbar */}
          <div dir="rtl" className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                if (clipboardMatch) {
                  onShowFloatingCard(clipboardMatch);
                }
              }}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#064E3B] border border-[#10B981] text-[#A7F3D0] text-[11px] font-extrabold truncate text-right hover:bg-emerald-900 transition-colors"
            >
              ⚡ {clipboardMatch?.term} ← {clipboardMatch?.translation} (اضغط للبطاقة)
            </button>

            <button
              type="button"
              onClick={() => insertAtCursor(simulatedClipboard)}
              className="px-2 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#E2E8F0] text-[11px] font-extrabold hover:bg-slate-700"
              title="لصق من الحافظة"
            >
              📋 لصق
            </button>

            <button
              type="button"
              onClick={() =>
                onTriggerTTS(
                  currentWordBeforeCursor || clipboardMatch?.term || 'Thrombocytopenia',
                  'kb-preview-tts'
                )
              }
              className="px-2 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#34D399] text-[11px] font-extrabold hover:bg-slate-700"
              title="نطق صوتي"
            >
              🔊
            </button>

            <button
              type="button"
              onClick={() => setCursorPos((p) => Math.max(0, p - 1))}
              className="px-2 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[11px] font-extrabold hover:bg-slate-700"
              title="تحريك المؤشر لليسار"
            >
              ◀
            </button>

            <button
              type="button"
              onClick={() => setCursorPos((p) => Math.min(textValue.length, p + 1))}
              className="px-2 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#CBD5E1] text-[11px] font-extrabold hover:bg-slate-700"
              title="تحريك المؤشر لليمين"
            >
              ▶
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress('🌐')}
              className="px-2 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#38BDF8] text-[11px] font-extrabold hover:bg-slate-700"
              title="تبديل الكيبورد"
            >
              🌐
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] text-[#94A3B8] text-[11px] font-extrabold hover:bg-slate-700"
              title="إخفاء الكيبورد"
            >
              ⌄
            </button>
          </div>

          {/* 2. Live Autocomplete & Medical Quick Tokens Strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
            {liveSuggestions.length > 0
              ? liveSuggestions.map((item, idx) => (
                  <button
                    key={`${item.term}-${idx}`}
                    type="button"
                    onClick={() => {
                      const beforeWordStart = cursorPos - currentWordBeforeCursor.length;
                      const isAr = /[\u0600-\u06FF]/.test(currentWordBeforeCursor);
                      const replacement = `${isAr ? item.translation : item.term} `;
                      const next = `${textValue.slice(0, beforeWordStart)}${replacement}${textValue.slice(cursorPos)}`;
                      setTextValue(next);
                      setCursorPos(beforeWordStart + replacement.length);
                      onShowFloatingCard(item);
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-[#1E293B] border border-[#10B981] text-[#E2E8F0] text-[11px] font-extrabold hover:bg-emerald-950 transition-colors"
                  >
                    📖 {item.term} · {item.translation}
                  </button>
                ))
              : quickTokens.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => insertAtCursor(tok.length > 1 ? `${tok} ` : tok)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-[#162032] border border-[#26354D] text-[#CBD5E1] text-[11px] font-extrabold hover:bg-slate-700 transition-colors"
                  >
                    {tok}
                  </button>
                ))}
          </div>

          {/* 3. Keyboard Key Rows */}
          <div className="space-y-1.5 pt-0.5">
            {activeRows.map((row, rIdx) => {
              const isNumberRow = rIdx === 0 && symbolMode === 'letters';
              return (
                <div key={rIdx} className="flex items-center justify-center gap-1">
                  {row.map((label, kIdx) => {
                    let displayLabel = label;
                    if (label === 'SPACE') {
                      displayLabel =
                        symbolMode !== 'letters'
                          ? arabicLayout
                            ? 'مسافة · ١٢٣'
                            : 'SPACE · 123'
                          : arabicLayout
                          ? 'مسافة · UMEDT الطبية'
                          : 'UMEDT Medical · Space';
                    } else if (label === '⇧') {
                      displayLabel = arabicLayout
                        ? shiftActive || capsLockActive
                          ? 'أ ب ت'
                          : 'أ إ ّ'
                        : capsLockActive
                        ? '⇪'
                        : '⇧';
                    } else if (
                      symbolMode === 'letters' &&
                      !arabicLayout &&
                      label.length === 1 &&
                      /[a-zA-Z]/.test(label)
                    ) {
                      displayLabel =
                        shiftActive || capsLockActive
                          ? label.toUpperCase()
                          : label.toLowerCase();
                    }

                    const isAccent =
                      label === '⏎' || label === 'AR' || label === 'EN' || label === 'AR/EN';
                    const isShift = label === '⇧';
                    const isMod =
                      label === '⌫' ||
                      label === '123' ||
                      label === 'ABC' ||
                      label === '#+=' ||
                      label === '🌐';

                    let bgClass = 'bg-[#1E293B] hover:bg-emerald-600/80';
                    if (isNumberRow) {
                      bgClass = 'bg-[#152033] hover:bg-emerald-600/80';
                    } else if (isAccent) {
                      bgClass = 'bg-[#059669] hover:bg-emerald-500';
                    } else if (isShift) {
                      bgClass = capsLockActive
                        ? 'bg-[#059669]'
                        : shiftActive
                        ? 'bg-[#0284C7]'
                        : 'bg-[#334155] hover:bg-slate-600';
                    } else if (isMod) {
                      bgClass = 'bg-[#334155] hover:bg-slate-600';
                    }

                    let flexStyle = 'flex-1';
                    if (label === 'SPACE') {
                      flexStyle = 'flex-[3.8]';
                    } else if (
                      label === '⌫' ||
                      label === '⏎' ||
                      label === '⇧' ||
                      label === '123' ||
                      label === 'ABC' ||
                      label === '#+='
                    ) {
                      flexStyle = 'flex-[1.35]';
                    }

                    return (
                      <button
                        key={`${rIdx}-${kIdx}-${label}`}
                        type="button"
                        onMouseDown={() => {
                          if (label === '⌫') {
                            if (holdTimerRef.current) window.clearInterval(holdTimerRef.current);
                            holdTimerRef.current = window.setInterval(handleBackspace, 75);
                          }
                        }}
                        onMouseUp={() => {
                          if (holdTimerRef.current) {
                            window.clearInterval(holdTimerRef.current);
                            holdTimerRef.current = null;
                          }
                        }}
                        onMouseLeave={() => {
                          if (holdTimerRef.current) {
                            window.clearInterval(holdTimerRef.current);
                            holdTimerRef.current = null;
                          }
                        }}
                        onClick={() => handleKeyPress(label)}
                        className={`${flexStyle} ${bgClass} ${
                          isNumberRow ? 'min-h-[32px] text-xs' : 'min-h-[40px] text-sm'
                        } rounded-lg border border-[#334155] text-white font-extrabold flex items-center justify-center transition-colors active:scale-95`}
                      >
                        {displayLabel}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* Checklist of Verified Keyboard Features */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/70 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>جميع الحروف العربية 28 حرفًا (بما فيها د، ذ، لا، ة، ى، ء، ئ، ؤ)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>طبقة الهمزات والتشكيل الكاملة (أ، إ، آ، لأ، لإ، لآ، َ ً ُ ٌ ِ ٍ ْ ّ)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>صف أرقام علوي دائم (1-0 و ١-٠) + صفحتا رموز طبية (°، ±، μ، ≤، ≥)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>حذف مستمر عند الضغط المطوّل (⌫) + أسهم تنقل المؤشر (◀ / ▶)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>إكمال تلقائي طبي حيّ مع عرض بطاقة الترجمة العائمة بضغطة واحدة</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>زر لصق فوري (📋) + نطق صوتي (🔊) + تبديل الكيبورد (🌐) + إخفاء (⌄)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
