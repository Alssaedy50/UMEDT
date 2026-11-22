import { DictionaryTerm, TermExample } from '../types/lexicon';

/**
 * ============================================================================
 * UNIFIED MEDICAL TERM IDENTITY, NORMALIZATION & NON-DESTRUCTIVE MERGE ENGINE
 * ============================================================================
 * Single source of truth used across ALL local imports, manual creation,
 * batch staging, backup restores, partial updates, and cloud library syncs.
 *
 * Core Invariants:
 *  1. Duplicate detection is PRIMARY on normalized medical term name.
 *  2. `id` is strictly AUXILIARY (never overwrites an existing different term
 *     when an incoming ID collides with an unrelated local term).
 *  3. Existing local term IDs (`existing.id`) are NEVER mutated or replaced.
 *  4. User study state (`favorite`, `collections`, `srsData`, `studyCount`,
 *     `lastStudiedAt`, `clinicalNote`, `linkedTopicIds`, `linkedSubjectIds`,
 *     `linkedBlockIds`) and rich non-empty term properties are ALWAYS preserved.
 */

export type TermConflictPolicy = 'ignore' | 'merge' | 'overwrite';

/**
 * Canonical medical term normalization:
 * - Unicode NFKC normalization
 * - Lowercase
 * - Strips zero-width & soft-hyphen control characters
 * - Normalizes curly apostrophes and drops apostrophes so `Crohn's` == `Crohn’s` == `Crohns`
 * - Unifies hyphens, dashes (`- ‐ ‑ ‒ – —`), punctuation (`. , / ( ) [ ] : ;`), and multiple spaces
 *   into a single canonical space separator (e.g. `Anti-Inflammatory` == `anti  inflammatory`)
 * - Preserves ASCII letters, digits, Greek medical symbols (`α β γ µ ...`), and Arabic letters
 */
export function normalizeMedicalTermKey(value: string | undefined | null): string {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .toLowerCase()
    .replace(/['’‘`´]/g, '')
    .replace(/[‐‑‒–—-]+/g, ' ')
    .replace(/[^a-z0-9\u0370-\u03ff\u0600-\u06ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Always derives the canonical key primarily from `term` (falling back to `termNormalized`
 * only if `term` is empty) so legacy records with older `termNormalized` values still match
 * accurately without modifying stored data on disk.
 */
export function getCanonicalTermKey(
  record: Pick<DictionaryTerm, 'term'> & { termNormalized?: string }
): string {
  const fromTerm = normalizeMedicalTermKey(record.term);
  if (fromTerm) return fromTerm;
  return normalizeMedicalTermKey(record.termNormalized);
}

export interface TermLookupIndex {
  byNormKey: Map<string, number>;
  byId: Map<string, number>;
}

export interface TermMatchResolution {
  matchIndex: number;
  matchReason: 'normalized-term' | 'id-auxiliary' | 'id-collision-new' | 'new';
  normKey: string;
  safeId: string;
}

export function createTermLookupIndex(existingTerms: DictionaryTerm[]): TermLookupIndex {
  const byNormKey = new Map<string, number>();
  const byId = new Map<string, number>();

  for (let i = 0; i < existingTerms.length; i += 1) {
    const t = existingTerms[i];
    if (!t) continue;
    const normKey = getCanonicalTermKey(t);
    if (normKey && !byNormKey.has(normKey)) {
      byNormKey.set(normKey, i);
    }
    if (t.id && !byId.has(t.id)) {
      byId.set(t.id, i);
    }
  }

  return { byNormKey, byId };
}

export function registerTermInIndex(
  index: TermLookupIndex,
  term: DictionaryTerm,
  arrayIdx: number
): void {
  const normKey = getCanonicalTermKey(term);
  if (normKey && !index.byNormKey.has(normKey)) {
    index.byNormKey.set(normKey, arrayIdx);
  }
  if (term.id && !index.byId.has(term.id)) {
    index.byId.set(term.id, arrayIdx);
  }
}

function generateSafeUniqueTermId(
  preferredId: string | undefined,
  normKey: string,
  byId: Map<string, number>
): string {
  const slug =
    normKey
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36) || 'term';
  const base =
    preferredId && preferredId.trim()
      ? `${preferredId.trim()}-${slug.slice(0, 12)}`
      : `term-${slug}-${Date.now().toString(36)}`;
  let candidate = base;
  let suffix = 2;
  while (byId.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Resolves whether an incoming term matches an existing record:
 *  1. PRIMARY: Match by canonical normalized medical term name (`byNormKey`).
 *  2. AUXILIARY: Check `byId` ONLY if no normalized name match was found.
 *     - If the existing term at `byId` has the same normalized name (or empty name), treat as match.
 *     - If the existing term at `byId` is a DIFFERENT medical term (unrelated ID collision),
 *       protect the existing term and issue a safe non-colliding `safeId` for the incoming term.
 */
export function resolveIncomingTermMatch(
  index: TermLookupIndex,
  workingTerms: DictionaryTerm[],
  incoming: Pick<DictionaryTerm, 'id' | 'term'> & { termNormalized?: string }
): TermMatchResolution {
  const normKey = getCanonicalTermKey(incoming);

  // 1. Primary lookup: Normalized medical term name
  if (normKey) {
    const idxByNorm = index.byNormKey.get(normKey);
    if (idxByNorm !== undefined && workingTerms[idxByNorm]) {
      return {
        matchIndex: idxByNorm,
        matchReason: 'normalized-term',
        normKey,
        safeId: workingTerms[idxByNorm].id
      };
    }
  }

  // 2. Auxiliary lookup: ID match (only when not conflicting with a different medical term)
  if (incoming.id && index.byId.has(incoming.id)) {
    const idxById = index.byId.get(incoming.id)!;
    const existingAtId = workingTerms[idxById];
    if (existingAtId) {
      const existingNorm = getCanonicalTermKey(existingAtId);
      if (!normKey || !existingNorm || existingNorm === normKey) {
        return {
          matchIndex: idxById,
          matchReason: 'id-auxiliary',
          normKey: existingNorm || normKey,
          safeId: existingAtId.id
        };
      }
      // Different medical term accidentally reused an existing ID -> keep existing untouched
      return {
        matchIndex: -1,
        matchReason: 'id-collision-new',
        normKey,
        safeId: generateSafeUniqueTermId(incoming.id, normKey, index.byId)
      };
    }
  }

  return {
    matchIndex: -1,
    matchReason: 'new',
    normKey,
    safeId:
      incoming.id && incoming.id.trim()
        ? incoming.id.trim()
        : generateSafeUniqueTermId(undefined, normKey, index.byId)
  };
}

function mergeStringArrayUnique(
  existingList?: string[],
  incomingList?: string[],
  caseInsensitive = false
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...(existingList || []), ...(incomingList || [])]) {
    const cleaned = String(raw || '').trim();
    if (!cleaned) continue;
    const key = caseInsensitive ? cleaned.toLowerCase() : cleaned;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function mergeExamplesUnique(
  existingExamples?: TermExample[],
  incomingExamples?: TermExample[]
): TermExample[] {
  const result: TermExample[] = [];
  const seen = new Map<string, number>();

  const add = (ex: TermExample) => {
    const en = String(ex?.en || '').trim();
    if (!en) return;
    const ar = String(ex?.ar || '').trim();
    const key = en.toLowerCase().replace(/\s+/g, ' ');
    const prevIdx = seen.get(key);
    if (prevIdx !== undefined) {
      if (!result[prevIdx].ar && ar) {
        result[prevIdx] = { ...result[prevIdx], ar };
      }
      return;
    }
    seen.set(key, result.length);
    result.push({ en, ar });
  };

  for (const ex of existingExamples || []) add(ex);
  for (const ex of incomingExamples || []) add(ex);
  return result;
}

function pickField(
  existingVal: string | undefined,
  incomingVal: string | undefined,
  preferIncoming: boolean
): string {
  const ex = String(existingVal || '').trim();
  const inc = String(incomingVal || '').trim();
  if (preferIncoming) {
    return inc || ex;
  }
  return ex || inc;
}

export interface MergeMatchedTermOptions {
  /**
   * When true (e.g. cloud dictionary refresh or overwrite policy), non-empty incoming
   * textual definitions/translations take precedence while STILL never replacing
   * non-empty existing text with blank strings, and ALWAYS preserving `existing.id`
   * and all user study state.
   */
  preferIncomingContent?: boolean;
  /** Optional override for `ingestedAt` timestamp/label when updated. */
  ingestedAtLabel?: string;
}

/**
 * Non-destructively merges a matched incoming term into an existing local term.
 * GUARANTEES:
 *  - `existing.id` is NEVER changed.
 *  - `favorite`, `collections`, `srsData`, `lastStudiedAt`, `studyCount`,
 *    `linkedTopicIds`, `linkedSubjectIds`, `linkedBlockIds` are ALWAYS preserved/merged.
 *  - Non-empty fields on `existing` are NEVER wiped by blank fields on `incoming`.
 */
export function mergeMatchedTermRecord(
  existing: DictionaryTerm,
  incoming: DictionaryTerm,
  policy: TermConflictPolicy = 'merge',
  options?: MergeMatchedTermOptions
): DictionaryTerm {
  if (policy === 'ignore') {
    return existing;
  }

  const preferIncoming = policy === 'overwrite' || Boolean(options?.preferIncomingContent);
  const canonicalKey = getCanonicalTermKey(existing) || getCanonicalTermKey(incoming);

  const mergedExamples =
    policy === 'overwrite' && Array.isArray(incoming.examples) && incoming.examples.length > 0
      ? mergeExamplesUnique(incoming.examples, existing.examples)
      : mergeExamplesUnique(existing.examples, incoming.examples);

  const mergedRelations = {
    synonyms: mergeStringArrayUnique(
      existing.relations?.synonyms,
      incoming.relations?.synonyms,
      true
    ),
    broader: mergeStringArrayUnique(
      existing.relations?.broader,
      incoming.relations?.broader,
      true
    ),
    related: mergeStringArrayUnique(
      existing.relations?.related,
      incoming.relations?.related,
      true
    )
  };

  const mergedCollections = mergeStringArrayUnique(existing.collections, incoming.collections);
  const mergedLinkedTopics = mergeStringArrayUnique(
    existing.linkedTopicIds,
    incoming.linkedTopicIds
  );
  const mergedLinkedSubjects = mergeStringArrayUnique(
    existing.linkedSubjectIds,
    incoming.linkedSubjectIds
  );
  const mergedLinkedBlocks = mergeStringArrayUnique(
    existing.linkedBlockIds,
    incoming.linkedBlockIds
  );

  const mergedStudyCount =
    existing.studyCount !== undefined || incoming.studyCount !== undefined
      ? Math.max(existing.studyCount ?? 0, incoming.studyCount ?? 0)
      : undefined;

  return {
    ...existing,
    id: existing.id, // STRICT: never alter existing local term ID
    term: existing.term?.trim() || incoming.term?.trim() || existing.term,
    termNormalized: canonicalKey,
    translation: pickField(existing.translation, incoming.translation, preferIncoming),
    phonetic: pickField(existing.phonetic, incoming.phonetic, preferIncoming),
    pos: pickField(existing.pos, incoming.pos, preferIncoming) || 'term',
    category:
      preferIncoming && incoming.category && incoming.category !== 'General'
        ? incoming.category
        : existing.category && existing.category !== 'General'
          ? existing.category
          : incoming.category || existing.category || 'Medical',
    umdCode: pickField(existing.umdCode, incoming.umdCode, preferIncoming) || undefined,
    specialty: pickField(existing.specialty, incoming.specialty, preferIncoming) || undefined,
    keepEnglish: existing.keepEnglish ?? incoming.keepEnglish ?? true,
    favorite: Boolean(existing.favorite || incoming.favorite),
    collections: mergedCollections.length > 0 ? mergedCollections : existing.collections || [],
    ingestedAt: options?.ingestedAtLabel || existing.ingestedAt || incoming.ingestedAt,
    definitionAr: pickField(existing.definitionAr, incoming.definitionAr, preferIncoming),
    definitionEn: pickField(existing.definitionEn, incoming.definitionEn, preferIncoming),
    clinicalNote:
      pickField(existing.clinicalNote, incoming.clinicalNote, false) || undefined,
    morphology: preferIncoming
      ? incoming.morphology || existing.morphology
      : existing.morphology || incoming.morphology,
    examples: mergedExamples,
    relations: mergedRelations,
    srsData: existing.srsData || incoming.srsData,
    lastStudiedAt: existing.lastStudiedAt || incoming.lastStudiedAt,
    studyCount: mergedStudyCount,
    linkedTopicIds: mergedLinkedTopics.length > 0 ? mergedLinkedTopics : undefined,
    linkedSubjectIds: mergedLinkedSubjects.length > 0 ? mergedLinkedSubjects : undefined,
    linkedBlockIds: mergedLinkedBlocks.length > 0 ? mergedLinkedBlocks : undefined
  };
}
