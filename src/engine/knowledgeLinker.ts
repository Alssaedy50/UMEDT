import { DictionaryTerm, LinkedSentence } from '../types/lexicon';
import { EXTRA_LINKABLE_ALIASES } from '../data/medicalLexiconData';

export interface LinkedTermMatch {
  termId: string;
  term: string;
  translation: string;
  matchedSurface: string;
  matchSource: 'term_en' | 'term_ar' | 'synonym' | 'alias';
}

export interface TermSentenceOccurrence {
  id: string;
  en: string;
  ar: string;
  sourceType: LinkedSentence['sourceType'] | 'term_example';
  specialty?: string;
  sourceLabel: string;
  sourceTermId?: string;
  coOccurringTermIds: string[];
}

export interface SuggestedTermRelation {
  relatedTermId: string;
  relatedTerm: string;
  relatedTranslation: string;
  sharedSentenceCount: number;
  sampleSentenceEn: string;
  sampleSentenceAr: string;
}

export interface BidirectionalSyncResult {
  updatedSentences: LinkedSentence[];
  termToSentencesMap: Record<string, TermSentenceOccurrence[]>;
  suggestedRelationsMap: Record<string, SuggestedTermRelation[]>;
  totalActiveLinks: number;
}

interface CandidateLookupEntry {
  keyLower: string;
  termId: string;
  term: string;
  translation: string;
  matchSource: 'term_en' | 'term_ar' | 'synonym' | 'alias';
  isArabic: boolean;
  wordRegex?: RegExp;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const candidateCache = new WeakMap<DictionaryTerm[], CandidateLookupEntry[]>();

/**
 * Builds and caches a longest-match-first lookup table covering:
 * 1. Primary English terms (term.term)
 * 2. English & bilingual synonyms (term.relations.synonyms)
 * 3. Extra linkable clinical aliases (EXTRA_LINKABLE_ALIASES)
 * 4. Primary Arabic translations (term.translation)
 */
function buildSortedCandidateEntries(terms: DictionaryTerm[]): CandidateLookupEntry[] {
  const cached = candidateCache.get(terms);
  if (cached) return cached;

  const entries: CandidateLookupEntry[] = [];
  const seenKeys = new Set<string>();
  const termById = new Map<string, DictionaryTerm>();

  for (const t of terms) {
    termById.set(t.id, t);
  }

  // 1. Primary English terms
  for (const t of terms) {
    const cleanEn = t.term.trim();
    const lowerEn = cleanEn.toLowerCase();
    if (cleanEn.length >= 2 && !seenKeys.has(`en:${lowerEn}`)) {
      seenKeys.add(`en:${lowerEn}`);
      entries.push({
        keyLower: lowerEn,
        termId: t.id,
        term: t.term,
        translation: t.translation,
        matchSource: 'term_en',
        isArabic: false,
        wordRegex: new RegExp(`(?<![a-z0-9_])${escapeRegExp(lowerEn)}(?![a-z0-9_])`, 'i')
      });
    }

    // 2. Synonyms from term.relations.synonyms
    const synonyms = t.relations?.synonyms || [];
    for (const syn of synonyms) {
      const cleanSyn = syn.trim();
      const lowerSyn = cleanSyn.toLowerCase();
      if (cleanSyn.length >= 2 && !seenKeys.has(`en:${lowerSyn}`)) {
        seenKeys.add(`en:${lowerSyn}`);
        const isAr = /[\u0600-\u06FF]/.test(cleanSyn);
        entries.push({
          keyLower: lowerSyn,
          termId: t.id,
          term: t.term,
          translation: t.translation,
          matchSource: 'synonym',
          isArabic: isAr,
          wordRegex: isAr
            ? undefined
            : new RegExp(`(?<![a-z0-9_])${escapeRegExp(lowerSyn)}(?![a-z0-9_])`, 'i')
        });
      }
    }

    // 3. Arabic primary translation segments
    const rawAr = t.translation.trim();
    const arSegments = rawAr
      .split(/[/(،·-]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4);

    for (const seg of arSegments) {
      if (!seenKeys.has(`ar:${seg}`)) {
        seenKeys.add(`ar:${seg}`);
        entries.push({
          keyLower: seg,
          termId: t.id,
          term: t.term,
          translation: t.translation,
          matchSource: 'term_ar',
          isArabic: true
        });
      }
    }
  }

  // 4. Extra linkable aliases (e.g., Cardiomyopathy, STEMI, DKA, Afib, etc.)
  for (const [alias, targetId] of Object.entries(EXTRA_LINKABLE_ALIASES)) {
    const targetTerm = termById.get(targetId);
    if (!targetTerm) continue;
    const cleanAlias = alias.trim();
    const lowerAlias = cleanAlias.toLowerCase();
    if (cleanAlias.length >= 2 && !seenKeys.has(`en:${lowerAlias}`)) {
      seenKeys.add(`en:${lowerAlias}`);
      const isAr = /[\u0600-\u06FF]/.test(cleanAlias);
      entries.push({
        keyLower: lowerAlias,
        termId: targetTerm.id,
        term: targetTerm.term,
        translation: targetTerm.translation,
        matchSource: 'alias',
        isArabic: isAr,
        wordRegex: isAr
          ? undefined
          : new RegExp(`(?<![a-z0-9_])${escapeRegExp(lowerAlias)}(?![a-z0-9_])`, 'i')
      });
    }
  }

  // Sort strictly from longest to shortest so multi-word terms match before single words
  const sorted = entries.sort((a, b) => b.keyLower.length - a.keyLower.length);
  candidateCache.set(terms, sorted);
  return sorted;
}

/**
 * Scans any text or sentence (English, Arabic, or mixed) from longest term to shortest,
 * extracting detailed matches of terms, synonyms, and aliases without overlapping sub-matches.
 * Optimized with O(1) pre-compiled candidate lookup and fast native substring pre-filtering.
 */
export function extractDetailedTermMatchesFromText(
  text: string,
  terms: DictionaryTerm[]
): LinkedTermMatch[] {
  if (!text || !text.trim() || terms.length === 0) {
    return [];
  }

  const candidates = buildSortedCandidateEntries(terms);
  const matches: LinkedTermMatch[] = [];
  const matchedTermIds = new Set<string>();

  let workingEn = text.toLowerCase();
  let workingAr = text;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    if (matchedTermIds.has(cand.termId)) {
      continue;
    }

    if (cand.isArabic) {
      if (workingAr.includes(cand.keyLower)) {
        matchedTermIds.add(cand.termId);
        matches.push({
          termId: cand.termId,
          term: cand.term,
          translation: cand.translation,
          matchedSurface: cand.keyLower,
          matchSource: cand.matchSource
        });
        workingAr = workingAr.split(cand.keyLower).join(' '.repeat(cand.keyLower.length));
      }
    } else {
      // Fast substring pre-check before running word-boundary regex
      if (!workingEn.includes(cand.keyLower)) {
        continue;
      }
      const regex =
        cand.wordRegex ||
        new RegExp(`(?<![a-z0-9_])${escapeRegExp(cand.keyLower)}(?![a-z0-9_])`, 'i');
      const found = workingEn.match(regex);
      if (found) {
        matchedTermIds.add(cand.termId);
        matches.push({
          termId: cand.termId,
          term: cand.term,
          translation: cand.translation,
          matchedSurface: found[0],
          matchSource: cand.matchSource
        });
        workingEn = workingEn.replace(regex, (m) => ' '.repeat(m.length));
      }
    }
  }

  return matches;
}

/**
 * Scans any English or Arabic text from longest term to shortest and returns
 * the list of linked term IDs (`termIds`) mentioned via primary terms, translations,
 * synonyms, or clinical aliases.
 */
export function extractLinkedTermsFromText(
  text: string,
  terms: DictionaryTerm[]
): string[] {
  return extractDetailedTermMatchesFromText(text, terms).map((m) => m.termId);
}

/**
 * Synchronizes bidirectional links between `terms` and `sentences`:
 * 1. Updates `linkedTermIds` on each sentence in `sentences` based on English & Arabic text.
 * 2. Builds a reverse lookup map `termToSentencesMap` so any term card can display all
 *    standalone sentences and cross-term contextual examples mentioning it.
 * 3. Computes automatic `related` term suggestions (`suggestedRelationsMap`) for terms
 *    that co-occur within the same clinical sentences.
 */
export function syncBidirectionalLinks(
  terms: DictionaryTerm[],
  sentences: LinkedSentence[]
): BidirectionalSyncResult {
  const validTermIds = new Set(terms.map((t) => t.id));
  const termById = new Map<string, DictionaryTerm>();
  for (const t of terms) {
    termById.set(t.id, t);
  }

  const termToSentencesMap: Record<string, TermSentenceOccurrence[]> = {};
  const seenSentencePerTerm: Record<string, Set<string>> = {};

  for (const t of terms) {
    termToSentencesMap[t.id] = [];
    seenSentencePerTerm[t.id] = new Set<string>();
  }

  // Pairwise co-occurrence tracker: key = "idA::idB"
  const coOccurrenceMap = new Map<
    string,
    {
      termA: string;
      termB: string;
      count: number;
      sampleEn: string;
      sampleAr: string;
    }
  >();

  const recordCoOccurrences = (
    linkedIds: string[],
    sampleEn: string,
    sampleAr: string
  ) => {
    const uniqueIds = Array.from(new Set(linkedIds)).filter((id) => validTermIds.has(id));
    if (uniqueIds.length < 2) return;

    for (let i = 0; i < uniqueIds.length; i++) {
      for (let j = i + 1; j < uniqueIds.length; j++) {
        const [first, second] =
          uniqueIds[i] < uniqueIds[j]
            ? [uniqueIds[i], uniqueIds[j]]
            : [uniqueIds[j], uniqueIds[i]];
        const pairKey = `${first}::${second}`;
        const existing = coOccurrenceMap.get(pairKey);
        if (existing) {
          existing.count += 1;
        } else {
          coOccurrenceMap.set(pairKey, {
            termA: first,
            termB: second,
            count: 1,
            sampleEn,
            sampleAr
          });
        }
      }
    }
  };

  let totalActiveLinks = 0;

  // Step 1: Update standalone sentences and index them in `termToSentencesMap`
  const updatedSentences: LinkedSentence[] = sentences.map((sent) => {
    const combinedText = `${sent.en} || ${sent.ar}`;
    const detectedIds = extractLinkedTermsFromText(combinedText, terms);
    const preservedValidIds = (sent.linkedTermIds || []).filter((id) =>
      validTermIds.has(id)
    );
    const mergedLinkedIds = Array.from(new Set([...preservedValidIds, ...detectedIds]));

    totalActiveLinks += mergedLinkedIds.length;

    const normEnKey = sent.en.trim().toLowerCase();
    for (const termId of mergedLinkedIds) {
      if (!seenSentencePerTerm[termId]) {
        seenSentencePerTerm[termId] = new Set<string>();
        termToSentencesMap[termId] = [];
      }
      if (!seenSentencePerTerm[termId].has(normEnKey)) {
        seenSentencePerTerm[termId].add(normEnKey);
        const otherTerm = mergedLinkedIds
          .map((id) => termById.get(id))
          .find((t) => t && t.id !== termId);

        termToSentencesMap[termId].push({
          id: sent.id,
          en: sent.en,
          ar: sent.ar,
          sourceType: sent.sourceType,
          specialty: sent.specialty,
          sourceLabel: otherTerm
            ? `${otherTerm.term} (${otherTerm.translation})`
            : sent.specialty || sent.createdAt || 'موسوعة الجمل السياقية',
          sourceTermId: otherTerm?.id,
          coOccurringTermIds: mergedLinkedIds.filter((id) => id !== termId)
        });
      }
    }

    recordCoOccurrences(mergedLinkedIds, sent.en, sent.ar);

    return {
      ...sent,
      linkedTermIds: mergedLinkedIds
    };
  });

  // Step 2: Scan all embedded `term.examples` across all terms so every term card
  // sees cross-references from other terms' examples even if not yet in `sentences`
  for (const sourceTerm of terms) {
    for (let idx = 0; idx < sourceTerm.examples.length; idx++) {
      const ex = sourceTerm.examples[idx];
      const combinedText = `${ex.en} || ${ex.ar}`;
      const detectedIds = extractLinkedTermsFromText(combinedText, terms);
      if (!detectedIds.includes(sourceTerm.id)) {
        detectedIds.unshift(sourceTerm.id);
      }

      const normEnKey = ex.en.trim().toLowerCase();
      for (const targetTermId of detectedIds) {
        if (!seenSentencePerTerm[targetTermId]) {
          seenSentencePerTerm[targetTermId] = new Set<string>();
          termToSentencesMap[targetTermId] = [];
        }
        if (!seenSentencePerTerm[targetTermId].has(normEnKey)) {
          seenSentencePerTerm[targetTermId].add(normEnKey);
          termToSentencesMap[targetTermId].push({
            id: `term-ex-${sourceTerm.id}-${idx}`,
            en: ex.en,
            ar: ex.ar,
            sourceType: 'term_example',
            specialty: sourceTerm.specialty,
            sourceLabel: `${sourceTerm.term} (${sourceTerm.translation})`,
            sourceTermId: sourceTerm.id,
            coOccurringTermIds: detectedIds.filter((id) => id !== targetTermId)
          });
        }
      }

      recordCoOccurrences(detectedIds, ex.en, ex.ar);
    }
  }

  // Step 3: Build `suggestedRelationsMap` from sentence co-occurrences
  const suggestedRelationsMap: Record<string, SuggestedTermRelation[]> = {};
  for (const t of terms) {
    suggestedRelationsMap[t.id] = [];
  }

  for (const pair of coOccurrenceMap.values()) {
    const termObjA = termById.get(pair.termA);
    const termObjB = termById.get(pair.termB);
    if (!termObjA || !termObjB) continue;

    suggestedRelationsMap[pair.termA].push({
      relatedTermId: termObjB.id,
      relatedTerm: termObjB.term,
      relatedTranslation: termObjB.translation,
      sharedSentenceCount: pair.count,
      sampleSentenceEn: pair.sampleEn,
      sampleSentenceAr: pair.sampleAr
    });

    suggestedRelationsMap[pair.termB].push({
      relatedTermId: termObjA.id,
      relatedTerm: termObjA.term,
      relatedTranslation: termObjA.translation,
      sharedSentenceCount: pair.count,
      sampleSentenceEn: pair.sampleEn,
      sampleSentenceAr: pair.sampleAr
    });
  }

  for (const termId of Object.keys(suggestedRelationsMap)) {
    suggestedRelationsMap[termId].sort(
      (a, b) => b.sharedSentenceCount - a.sharedSentenceCount
    );
  }

  return {
    updatedSentences,
    termToSentencesMap,
    suggestedRelationsMap,
    totalActiveLinks
  };
}

/**
 * PHASE 5.3: Searches for dictionary terms and synonyms (longest-match-first)
 * inside any definition or contextual example sentence.
 */
export function detectTermsInText(
  text: string,
  terms: DictionaryTerm[]
): LinkedTermMatch[] {
  return extractDetailedTermMatchesFromText(text, terms);
}

/**
 * PHASE 5.3: Inspects a term's definitions (`definitionAr`, `definitionEn`) and
 * contextual example sentences (`examples`), automatically adds any mentioned
 * dictionary term to `term.relations.related`, and updates the counterpart
 * terms in `allTerms` bidirectionally (`counterpart.relations.related`).
 */
export function autoEnrichTermRelations(
  term: DictionaryTerm,
  allTerms: DictionaryTerm[]
): DictionaryTerm[] {
  const combinedCorpus = [
    term.definitionAr || '',
    term.definitionEn || '',
    ...(term.examples || []).map((ex) => `${ex.en} || ${ex.ar}`)
  ].join(' || ');

  const detectedMatches = detectTermsInText(combinedCorpus, allTerms).filter(
    (m) => m.termId !== term.id
  );

  const detectedTermNames = detectedMatches.map((m) => m.term);
  const detectedIdsSet = new Set(detectedMatches.map((m) => m.termId));

  return allTerms.map((item) => {
    if (item.id === term.id) {
      const existingRelated = [...(term.relations?.related || [])];
      const existingLower = new Set(
        [
          ...(term.relations?.synonyms || []),
          ...(term.relations?.broader || []),
          ...existingRelated
        ].map((r) => r.toLowerCase())
      );
      for (const name of detectedTermNames) {
        if (
          name.toLowerCase() !== term.term.toLowerCase() &&
          !existingLower.has(name.toLowerCase())
        ) {
          existingLower.add(name.toLowerCase());
          existingRelated.push(name);
        }
      }
      return {
        ...term,
        relations: {
          synonyms: term.relations?.synonyms || [],
          broader: term.relations?.broader || [],
          related: existingRelated
        }
      };
    }

    if (detectedIdsSet.has(item.id)) {
      const counterpartRelated = [...(item.relations?.related || [])];
      const counterpartLower = new Set(
        [
          ...(item.relations?.synonyms || []),
          ...(item.relations?.broader || []),
          ...counterpartRelated
        ].map((r) => r.toLowerCase())
      );
      if (
        term.term.toLowerCase() !== item.term.toLowerCase() &&
        !counterpartLower.has(term.term.toLowerCase())
      ) {
        counterpartRelated.push(term.term);
        return {
          ...item,
          relations: {
            synonyms: item.relations?.synonyms || [],
            broader: item.relations?.broader || [],
            related: counterpartRelated
          }
        };
      }
    }

    return item;
  });
}

/**
 * Runs relation enrichment across the entire dictionary in a single shared-index pass
 * so every term's definition and example sentences bidirectionally link mentioned terms
 * with O(1) candidate index reuse even on databases of thousands of terms.
 */
export function autoEnrichAllTermsRelations(
  allTerms: DictionaryTerm[]
): DictionaryTerm[] {
  if (allTerms.length === 0) return [];

  // Prime candidate cache once for the entire `allTerms` array reference
  buildSortedCandidateEntries(allTerms);

  const additionsById = new Map<string, string[]>();
  const seenLowerById = new Map<string, Set<string>>();

  for (const t of allTerms) {
    additionsById.set(t.id, [...(t.relations?.related || [])]);
    seenLowerById.set(
      t.id,
      new Set(
        [
          ...(t.relations?.synonyms || []),
          ...(t.relations?.broader || []),
          ...(t.relations?.related || []),
          t.term
        ].map((r) => r.toLowerCase())
      )
    );
  }

  for (let i = 0; i < allTerms.length; i++) {
    const term = allTerms[i];
    const combinedCorpus = [
      term.definitionAr || '',
      term.definitionEn || '',
      ...(term.examples || []).map((ex) => `${ex.en} || ${ex.ar}`)
    ].join(' || ');

    const detectedMatches = extractDetailedTermMatchesFromText(combinedCorpus, allTerms);
    const sourceSeen = seenLowerById.get(term.id)!;
    const sourceList = additionsById.get(term.id)!;

    for (let j = 0; j < detectedMatches.length; j++) {
      const match = detectedMatches[j];
      if (match.termId === term.id) continue;

      const matchLower = match.term.toLowerCase();
      if (!sourceSeen.has(matchLower)) {
        sourceSeen.add(matchLower);
        sourceList.push(match.term);
      }

      const targetSeen = seenLowerById.get(match.termId);
      const targetList = additionsById.get(match.termId);
      const sourceTermLower = term.term.toLowerCase();
      if (targetSeen && targetList && !targetSeen.has(sourceTermLower)) {
        targetSeen.add(sourceTermLower);
        targetList.push(term.term);
      }
    }
  }

  return allTerms.map((item) => ({
    ...item,
    relations: {
      synonyms: item.relations?.synonyms || [],
      broader: item.relations?.broader || [],
      related: additionsById.get(item.id) || item.relations?.related || []
    }
  }));
}

/**
 * Automatically enriches `term.relations.related` with terms that co-occur
 * in the same clinical sentences so the knowledge graph stays bidirectionally connected.
 */
export function applySuggestedRelationsToTerms(
  terms: DictionaryTerm[],
  sentences: LinkedSentence[],
  maxAutoRelatedPerTerm = 10
): DictionaryTerm[] {
  const { suggestedRelationsMap } = syncBidirectionalLinks(terms, sentences);
  const enrichedFromText = autoEnrichAllTermsRelations(terms);

  return enrichedFromText.map((term) => {
    const suggestions = suggestedRelationsMap[term.id] || [];
    if (suggestions.length === 0) return term;

    const existingRelated = [...(term.relations?.related || [])];
    const existingLower = new Set(existingRelated.map((r) => r.toLowerCase()));

    for (const sug of suggestions) {
      if (existingRelated.length >= maxAutoRelatedPerTerm) break;
      if (!existingLower.has(sug.relatedTerm.toLowerCase())) {
        existingLower.add(sug.relatedTerm.toLowerCase());
        existingRelated.push(sug.relatedTerm);
      }
    }

    return {
      ...term,
      relations: {
        ...term.relations,
        related: existingRelated
      }
    };
  });
}

