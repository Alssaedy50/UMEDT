/**
 * Strict BiDi (Bidirectional) text direction detection, Unicode isolation,
 * and Arabic counter formatting utilities for bilingual (Arabic RTL + English LTR) medical UI.
 */

const LATIN_LETTER_RE = /[A-Za-z]/;
const ARABIC_LETTER_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

/**
 * Determines whether a string should be laid out as LTR or RTL.
 * Strings that begin with optional digits/numbering/punctuation followed by a Latin character
 * (e.g. "1. Resting Membrane Polarization", "(-70 mV)", "Na+ / K+ ATPase")
 * MUST be rendered in strict LTR direction so numbers, periods, parentheses, and ion symbols
 * never flip to the wrong side inside an RTL container.
 */
export function detectTextDirection(text?: string | null): 'ltr' | 'rtl' {
  const clean = String(text || '').trim();
  if (!clean) return 'rtl';

  // Find first strong alphabetical character (Latin vs Arabic)
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (LATIN_LETTER_RE.test(ch)) return 'ltr';
    if (ARABIC_LETTER_RE.test(ch)) return 'rtl';
  }

  // Fallback for numeric/symbolic expressions like "(-70 mV)" or "+30 mV"
  return 'ltr';
}

/**
 * Returns true if the text starts with (or primarily consists of) Latin characters,
 * useful for applying text-left and proper end-truncation on English medical titles.
 */
export function isLatinLeadText(text?: string | null): boolean {
  return detectTextDirection(text) === 'ltr';
}

/**
 * Wraps a text segment in explicit Unicode Directional Isolate characters:
 * - LRI (\u2066) ... PDI (\u2069) for LTR strings
 * - RLI (\u2067) ... PDI (\u2069) for RTL strings
 * This guarantees that SVG <text> nodes and plain text attributes render numbering
 * like "1. Resting Membrane Polarization", "4. Repolarization & Hyperpolarization",
 * "(-70 mV)", and "Na+, K+, Ca2+" without BiDi punctuation/number inversion.
 */
export function isolateBidiString(text?: string | null): string {
  const raw = String(text || '').trim();
  if (!raw) return '';
  // Strip any existing explicit isolate markers to keep idempotent
  const stripped = raw.replace(/[\u2066\u2067\u2068\u2069]/g, '');
  const dir = detectTextDirection(stripped);
  return dir === 'ltr' ? `\u2066${stripped}\u2069` : `\u2067${stripped}\u2069`;
}

/**
 * Formats Arabic node & edge counts cleanly in natural RTL reading order:
 * e.g. "10 عقد • 9 علاقات" instead of reversed "عقدة: 9 علاقة: 10".
 */
export function formatMindMapCountsAr(nodeCount: number, edgeCount: number): string {
  const n = Math.max(0, Math.floor(nodeCount));
  const e = Math.max(0, Math.floor(edgeCount));

  const nodeWord =
    n === 1
      ? 'عقدة واحدة'
      : n === 2
        ? 'عقدتان'
        : n >= 3 && n <= 10
          ? `${n} عقد`
          : `${n} عقدة`;

  const edgeWord =
    e === 0
      ? '0 علاقة'
      : e === 1
        ? 'علاقة واحدة'
        : e === 2
          ? 'علاقتان'
          : e >= 3 && e <= 10
            ? `${e} علاقات`
            : `${e} علاقة`;

  return `${nodeWord} • ${edgeWord}`;
}
