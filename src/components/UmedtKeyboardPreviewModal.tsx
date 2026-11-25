import React, { useState, useMemo, useRef } from 'react';
import { X, Copy, CheckCircle2, Keyboard } from 'lucide-react';
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

// Global Standard 4-Row Layouts matching UMEDTKeyboardService.java
const EN_ROWS: string[][] = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫'],
  ['?123', 'LANG', ',', 'SPACE', '.', '⏎']
];

const AR_ROWS: string[][] = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ذ', 'ء', 'ر', 'لا', 'ى', 'ة', 'و', 'ز', 'ظ', 'د', '⌫'],
  ['?123', 'LANG', '،', 'SPACE', '.', '⏎']
];

const SYM_ROWS_1: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '%', '&', '-', '+', '(', ')', '/'],
  ['=\\<', '*', '"', "'", ':', ';', '!', '?', '=', '⌫'],
  ['ABC', 'LANG', ',', 'SPACE', '.', '⏎']
];

const SYM_ROWS_2: string[][] = [
  ['١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '٠'],
  ['°', '±', 'μ', '≤', '≥', '≠', '≈', '÷', '×', '‰'],
  ['?123', '~', '`', '|', '{', '}', '[', ']', '^', '⌫'],
  ['ABC', 'LANG', '،', 'SPACE', '.', '⏎']
];

const KEY_CORNER_HINTS: Record<string, string> = {
  ض: '1',
  ص: '2',
  ث: '3',
  ق: '4',
  ف: '5',
  غ: '6',
  ع: '7',
  ه: '8',
  خ: '9',
  ح: '0',
  ج: 'چ',
  ي: 'ى',
  ب: 'پ',
  ل: 'لا',
  ا: 'أ إ آ',
  ت: 'ة',
  ن: 'ـ',
  م: 'μ',
  ك: 'گ',
  ط: 'ظ',
  ذ: 'ّ',
  ء: 'ئ ؤ',
  لا: 'لأ',
  ى: 'ئ',
  ة: 'ه',
  و: 'ؤ',
  ز: 'ژ',
  د: 'ذ',
  '،': 'ّ',
  '.': '؟',
  ',': "'",
  q: '1',
  w: '2',
  e: '3',
  r: '4',
  t: '5',
  y: '6',
  u: '7',
  i: '8',
  o: '9',
  p: '0'
};

const KEY_POPUP_OPTIONS: Record<string, string[]> = {
  ض: ['1', '١', 'ض'],
  ص: ['2', '٢', 'ص'],
  ث: ['3', '٣', 'ث'],
  ق: ['4', '٤', 'ڤ', 'ق'],
  ف: ['5', '٥', 'ڤ', 'ف'],
  غ: ['6', '٦', 'غ'],
  ع: ['7', '٧', 'ع'],
  ه: ['8', '٨', 'ة', 'هـ'],
  خ: ['9', '٩', 'خ'],
  ح: ['0', '٠', 'ح'],
  ج: ['چ', 'د', 'ذ', '-'],
  ي: ['ى', 'ئ', 'ي'],
  ب: ['پ', 'ب'],
  ل: ['لا', 'لأ', 'لإ', 'لآ'],
  ا: ['أ', 'إ', 'آ', 'ٱ', 'لا', 'لأ', 'لإ', 'لآ'],
  ت: ['ة', 'ت'],
  ن: ['ـ', 'ن'],
  م: ['mg', 'mL', 'mmHg', 'μ'],
  ك: ['گ', 'ك', ':'],
  ط: ['ظ', 'ط'],
  ذ: ['ّ', 'ْ', 'َ', 'ُ', 'ِ', 'ذ'],
  ء: ['أ', 'إ', 'آ', 'ئ', 'ؤ', 'ء'],
  لا: ['لأ', 'لإ', 'لآ', 'لا'],
  ى: ['ئ', 'ي', 'ى'],
  ة: ['ه', 'ة'],
  و: ['ؤ', 'و'],
  ز: ['ژ', 'ز'],
  د: ['ذ', 'د'],
  '،': ['َ', 'ً', 'ُ', 'ٌ', 'ِ', 'ٍ', 'ّ', 'ْ', '؛', '؟'],
  '.': ['؟', '!', '؛', ':', '/', '-', '(', ')', '%', '°', '±', 'μ'],
  ',': ["'", '"', ';', ':', '(', ')', '/', '-', '@', '#'],
  q: ['1', '%'],
  w: ['2', '@'],
  e: ['3', 'é', 'è'],
  r: ['4', '#'],
  t: ['5', '$'],
  y: ['6', '^'],
  u: ['7', 'μ', '&'],
  i: ['8', '*'],
  o: ['9', '°', '('],
  p: ['0', '±', ')']
};

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
  const [activePopup, setActivePopup] = useState<{
    type: 'tools' | 'tashkeel' | 'medical' | 'key';
    title: string;
    options?: string[];
  } | null>(null);

  const lastShiftTapRef = useRef<number>(0);
  const lastSpaceTapRef = useRef<number>(0);
  const holdTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<boolean>(false);

  const currentWordBeforeCursor = useMemo(() => {
    const before = textValue.slice(0, cursorPos);
    const match = before.match(/[\p{L}\p{N}-]+$/u);
    return match ? match[0] : '';
  }, [textValue, cursorPos]);

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
      ? AR_ROWS
      : EN_ROWS;

  const insertAtCursor = (str: string) => {
    setTextValue((prev) => {
      const safePos = Math.max(0, Math.min(prev.length, cursorPos));
      const before = prev.slice(0, safePos);
      const after = prev.slice(safePos);
      const next = `${before}${str}${after}`;
      setCursorPos(before.length + str.length);
      return next;
    });
  };

  const handleBackspace = () => {
    setTextValue((prev) => {
      if (prev.length === 0) return prev;
      const safePos = cursorPos > 0 ? Math.min(prev.length, cursorPos) : prev.length;
      if (safePos <= 0) return prev;
      const next = `${prev.slice(0, safePos - 1)}${prev.slice(safePos)}`;
      setCursorPos(Math.max(0, safePos - 1));
      return next;
    });
  };

  const handleKeyPress = (label: string) => {
    setActivePopup(null);
    if (label === 'LANG') {
      setArabicLayout((prev) => !prev);
      setSymbolMode('letters');
      setShiftActive(false);
      setCapsLockActive(false);
      return;
    }
    if (label === '?123') {
      setSymbolMode('sym1');
      return;
    }
    if (label === '=\\<') {
      setSymbolMode('sym2');
      return;
    }
    if (label === 'ABC') {
      setSymbolMode('letters');
      return;
    }
    if (label === '⇧') {
      const now = Date.now();
      if (now - lastShiftTapRef.current < 380) {
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
    if (label === '⌫') {
      handleBackspace();
      return;
    }
    if (label === 'SPACE') {
      const now = Date.now();
      if (
        now - lastSpaceTapRef.current < 300 &&
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

  const openKeyLongPressPopup = (label: string) => {
    if (label === '⇧') {
      setCapsLockActive((prev) => {
        const next = !prev;
        setShiftActive(next);
        return next;
      });
      return;
    }
    if (label === 'LANG' || label === 'SPACE') {
      const bridge = (window as unknown as {
        UMEDAndroidBridge?: { showUmedtKeyboardPicker?: () => void };
      }).UMEDAndroidBridge;
      if (bridge?.showUmedtKeyboardPicker) {
        bridge.showUmedtKeyboardPicker();
      } else {
        setArabicLayout((prev) => !prev);
      }
      return;
    }
    const opts = KEY_POPUP_OPTIONS[label];
    if (opts && opts.length > 0) {
      setActivePopup({
        type: 'key',
        title: `خيارات الزر «${label}» المنبثقة`,
        options: opts
      });
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[92dvh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4 sm:p-5 space-y-3.5"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                لوحة مفاتيح UMEDT العالمية المدمجة (مع الأزرار المنبثقة)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                تصميم مدمج من 4 صفوف متناسقة · اضغط مطولًا على أي زر أو استخدم أزرار (⊞ / ّ أ / ⚕️) المنبثقة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] min-w-[34px] rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Test Input Area */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
              حقل اختبار الكتابة والحذف والأزرار المنبثقة:
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
                <span>اختبار البطاقة العائمة</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTextValue('');
                  setCursorPos(0);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold"
              >
                مسح الكل
              </button>
            </div>
          </div>

          <MobileSafeInput
            value={textValue}
            onValueChange={(nextVal) => {
              setTextValue(nextVal);
              setCursorPos(nextVal.length);
            }}
            placeholder="جرّب الكتابة، زر الحذف (⌫)، أو الضغط المطول لإظهار الأزرار المنبثقة..."
            className="w-full min-h-[44px] px-3.5 py-2 rounded-2xl bg-slate-50 dark:bg-slate-950 border-2 border-emerald-500/40 text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
          />
        </div>

        {/* ====================================================================
            COMPACT 4-ROW GLOBAL KEYBOARD REPLICA WITH POPUP OVERLAYS
           ==================================================================== */}
        <div
          dir="ltr"
          className="relative rounded-2xl bg-[#111827] p-2 border border-slate-800 shadow-inner space-y-1.5 select-none overflow-hidden"
        >
          {/* 1. Single Slim 36px Smart Header */}
          <div className="flex items-center gap-1 h-9">
            {/* Popup Tools Button (⊞) */}
            <button
              type="button"
              onClick={() =>
                setActivePopup((prev) =>
                  prev?.type === 'tools'
                    ? null
                    : { type: 'tools', title: 'أدوات لوحة مفاتيح UMEDT المنبثقة' }
                )
              }
              className={`h-8 px-2.5 rounded-lg border text-xs font-extrabold transition-colors ${
                activePopup?.type === 'tools'
                  ? 'bg-emerald-600 border-emerald-400 text-white'
                  : 'bg-[#1F2937] border-[#374151] text-[#34D399]'
              }`}
              title="الأدوات المنبثقة"
            >
              ⊞
            </button>

            {/* Popup Tashkeel & Hamzas Button (ّ أ) */}
            <button
              type="button"
              onClick={() =>
                setActivePopup((prev) =>
                  prev?.type === 'tashkeel'
                    ? null
                    : {
                        type: 'tashkeel',
                        title: 'التشكيل والهمزات المنبثقة',
                        options: [
                          'أ',
                          'إ',
                          'آ',
                          'لأ',
                          'لإ',
                          'لآ',
                          'ء',
                          'ئ',
                          'ؤ',
                          'َ',
                          'ً',
                          'ُ',
                          'ٌ',
                          'ِ',
                          'ٍ',
                          'ّ',
                          'ْ',
                          'ـ'
                        ]
                      }
                )
              }
              className={`h-8 px-2.5 rounded-lg border text-xs font-extrabold transition-colors ${
                activePopup?.type === 'tashkeel'
                  ? 'bg-emerald-600 border-emerald-400 text-white'
                  : 'bg-[#1F2937] border-[#374151] text-[#FDE68A]'
              }`}
              title="التشكيل والهمزات المنبثقة"
            >
              ّ أ
            </button>

            {/* Popup Medical Units Button (⚕️) */}
            <button
              type="button"
              onClick={() =>
                setActivePopup((prev) =>
                  prev?.type === 'medical'
                    ? null
                    : {
                        type: 'medical',
                        title: 'الوحدات والرموز الطبية المنبثقة',
                        options: [
                          'mg',
                          'mL',
                          'mmHg',
                          '°C',
                          'μg',
                          'mmol/L',
                          'g/dL',
                          'bpm',
                          'IV',
                          'PO',
                          'IM',
                          '±',
                          '≤',
                          '≥',
                          '°',
                          'μ',
                          '%',
                          '‰'
                        ]
                      }
                )
              }
              className={`h-8 px-2.5 rounded-lg border text-xs font-extrabold transition-colors ${
                activePopup?.type === 'medical'
                  ? 'bg-emerald-600 border-emerald-400 text-white'
                  : 'bg-[#1F2937] border-[#374151] text-[#38BDF8]'
              }`}
              title="الوحدات الطبية المنبثقة"
            >
              ⚕️
            </button>

            {/* Center Scrollable Live Suggestions / Clipboard Match Strip */}
            <div className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto no-scrollbar px-0.5">
              {clipboardMatch && (
                <button
                  type="button"
                  onClick={() => onShowFloatingCard(clipboardMatch)}
                  className="shrink-0 h-7 px-2.5 rounded-md bg-[#064E3B] border border-[#10B981] text-[#A7F3D0] text-[11px] font-extrabold"
                >
                  ⚡ {clipboardMatch.term} ← {clipboardMatch.translation}
                </button>
              )}

              {liveSuggestions.map((item, idx) => (
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
                  className="shrink-0 h-7 px-2.5 rounded-md bg-[#1E293B] border border-[#10B981] text-[#F8FAFC] text-[11px] font-extrabold"
                >
                  📖 {item.term} · {item.translation}
                </button>
              ))}

              {liveSuggestions.length === 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => insertAtCursor(simulatedClipboard)}
                    className="shrink-0 h-7 px-2.5 rounded-md bg-[#1F2937] border border-[#374151] text-[#E2E8F0] text-[11px] font-bold"
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
                    className="shrink-0 h-7 px-2.5 rounded-md bg-[#1F2937] border border-[#374151] text-[#34D399] text-[11px] font-bold"
                  >
                    🔊 نطق
                  </button>
                </>
              )}
            </div>

            {/* Hide Keyboard Button (⌄) */}
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-2.5 rounded-lg bg-[#1F2937] border border-[#374151] text-[#94A3B8] text-xs font-extrabold"
              title="إخفاء الكيبورد"
            >
              ⌄
            </button>
          </div>

          {/* 2. 4 Compact, Symmetrical Global Keyboard Rows (42px height each) */}
          <div className="space-y-1">
            {activeRows.map((row, rIdx) => {
              const isEnglishSecondRow =
                !arabicLayout && symbolMode === 'letters' && rIdx === 1;
              return (
                <div
                  key={rIdx}
                  className={`flex items-center justify-center gap-1 ${
                    isEnglishSecondRow ? 'px-3' : ''
                  }`}
                >
                  {row.map((label, kIdx) => {
                    let displayLabel = label;
                    if (label === 'SPACE') {
                      displayLabel = arabicLayout ? 'العربية' : 'English';
                    } else if (label === 'LANG') {
                      displayLabel = arabicLayout ? '🌐 EN' : '🌐 AR';
                    } else if (label === '⇧') {
                      displayLabel = capsLockActive ? '⇪' : '⇧';
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

                    const hint =
                      symbolMode === 'letters' ? KEY_CORNER_HINTS[label] : undefined;

                    let bgClass = 'bg-[#1E293B] hover:bg-emerald-600/80';
                    if (label === '⏎') {
                      bgClass = 'bg-[#059669] hover:bg-emerald-500';
                    } else if (label === 'LANG') {
                      bgClass = 'bg-[#0F766E] hover:bg-teal-600';
                    } else if (label === '⇧') {
                      bgClass = capsLockActive
                        ? 'bg-[#059669]'
                        : shiftActive
                        ? 'bg-[#0284C7]'
                        : 'bg-[#334155] hover:bg-slate-600';
                    } else if (
                      label === '⌫' ||
                      label === '?123' ||
                      label === 'ABC' ||
                      label === '=\\<'
                    ) {
                      bgClass = 'bg-[#334155] hover:bg-slate-600';
                    }

                    let flexStyle = 'flex-1';
                    if (label === 'SPACE') {
                      flexStyle = 'flex-[3.9]';
                    } else if (
                      label === '⌫' ||
                      label === '⏎' ||
                      label === '⇧'
                    ) {
                      flexStyle = 'flex-[1.4]';
                    } else if (
                      label === '?123' ||
                      label === 'ABC' ||
                      label === '=\\<'
                    ) {
                      flexStyle = 'flex-[1.25]';
                    } else if (label === 'LANG') {
                      flexStyle = 'flex-[1.1]';
                    }

                    return (
                      <button
                        key={`${rIdx}-${kIdx}-${label}`}
                        type="button"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openKeyLongPressPopup(label);
                        }}
                        onMouseDown={() => {
                          longPressTriggeredRef.current = false;
                          if (label === '⌫') {
                            if (holdTimerRef.current)
                              window.clearInterval(holdTimerRef.current);
                            holdTimerRef.current = window.setInterval(
                              handleBackspace,
                              75
                            );
                            return;
                          }
                          if (KEY_POPUP_OPTIONS[label] || label === '⇧' || label === 'LANG') {
                            if (longPressTimerRef.current)
                              window.clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = window.setTimeout(() => {
                              longPressTriggeredRef.current = true;
                              openKeyLongPressPopup(label);
                            }, 420);
                          }
                        }}
                        onMouseUp={() => {
                          if (holdTimerRef.current) {
                            window.clearInterval(holdTimerRef.current);
                            holdTimerRef.current = null;
                          }
                          if (longPressTimerRef.current) {
                            window.clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                        }}
                        onMouseLeave={() => {
                          if (holdTimerRef.current) {
                            window.clearInterval(holdTimerRef.current);
                            holdTimerRef.current = null;
                          }
                          if (longPressTimerRef.current) {
                            window.clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                          }
                        }}
                        onClick={() => {
                          if (longPressTriggeredRef.current) {
                            longPressTriggeredRef.current = false;
                            return;
                          }
                          handleKeyPress(label);
                        }}
                        className={`relative ${flexStyle} ${bgClass} h-[42px] rounded-md border border-[#334155] text-white font-extrabold flex items-center justify-center transition-colors active:scale-95 overflow-hidden`}
                      >
                        {hint && (
                          <span className="absolute top-0.5 right-1 text-[8.5px] font-bold text-slate-400 leading-none pointer-events-none">
                            {hint}
                          </span>
                        )}
                        <span
                          className={`truncate ${
                            label === 'SPACE'
                              ? 'text-xs text-slate-300'
                              : label === '?123' ||
                                label === 'ABC' ||
                                label === '=\\<' ||
                                label === 'LANG'
                              ? 'text-xs'
                              : 'text-[15px]'
                          }`}
                        >
                          {displayLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* 3. FLOATING POPUP OVERLAY (الأزرار المنبثقة) */}
          {activePopup && (
            <div
              onClick={() => setActivePopup(null)}
              className="absolute inset-0 top-10 bg-slate-950/80 backdrop-blur-[2px] p-2.5 flex items-start justify-center z-20"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
                className="w-full rounded-xl bg-[#1E293B] border-2 border-emerald-500 p-2.5 shadow-2xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-emerald-300">
                    {activePopup.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActivePopup(null)}
                    className="px-2 py-0.5 rounded-md bg-slate-700 text-white text-[11px] font-bold"
                  >
                    ✕ إغلاق
                  </button>
                </div>

                {activePopup.type === 'tools' ? (
                  <div className="grid grid-cols-3 gap-1.5" dir="rtl">
                    <button
                      type="button"
                      onClick={() => {
                        insertAtCursor(simulatedClipboard);
                        setActivePopup(null);
                      }}
                      className="h-9 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-xs font-extrabold"
                    >
                      📋 لصق
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onTriggerTTS(
                          currentWordBeforeCursor ||
                            clipboardMatch?.term ||
                            'Thrombocytopenia',
                          'kb-popup-tts'
                        );
                        setActivePopup(null);
                      }}
                      className="h-9 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 text-xs font-extrabold"
                    >
                      🔊 نطق
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (clipboardMatch) onShowFloatingCard(clipboardMatch);
                        setActivePopup(null);
                      }}
                      className="h-9 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-200 text-xs font-extrabold"
                    >
                      ⚡ ترجمة المنسوخ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCursorPos((p) => Math.min(textValue.length, p + 1))
                      }
                      className="h-9 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-extrabold"
                    >
                      ▶ مؤشر يمين
                    </button>
                    <button
                      type="button"
                      onClick={() => setCursorPos((p) => Math.max(0, p - 1))}
                      className="h-9 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-extrabold"
                    >
                      ◀ مؤشر يسار
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        openKeyLongPressPopup('LANG');
                        setActivePopup(null);
                      }}
                      className="h-9 rounded-lg bg-slate-900 border border-slate-700 text-sky-400 text-xs font-extrabold"
                    >
                      🌐 تغيير الكيبورد
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-6 gap-1.5" dir="ltr">
                    {(activePopup.options || []).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          insertAtCursor(
                            opt.length > 1 && /^[a-zA-Z°μ]/.test(opt)
                              ? `${opt} `
                              : opt
                          );
                          setActivePopup(null);
                        }}
                        className="h-9 rounded-lg bg-slate-900 border border-emerald-500/70 text-white text-sm font-extrabold hover:bg-emerald-600 transition-colors"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Checklist of Verified Keyboard Improvements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950/70 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>تصميم عالمي مدمج (4 صفوف متساوية الارتفاع 42dp بدون تمدد)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>أزرار منبثقة (Popup) للأرقام والهمزات والتشكيل والوحدات الطبية</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>حماية كاملة من تداخل شريط تنقل الأندرويد السفلي (WindowInsets)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>زر حذف (⌫) فوري وموثوق 100% مع دعم الضغط المطول للحذف السريع</span>
          </div>
        </div>
      </div>
    </div>
  );
};
