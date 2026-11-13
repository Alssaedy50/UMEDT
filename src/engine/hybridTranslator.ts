import {
  DictionaryTerm,
  MorphologicalAffix,
  ClinicalAbbreviation,
  LinkedSentence
} from '../types/lexicon';
import {
  CLINICAL_ABBREVIATIONS,
  MORPHOLOGICAL_AFFIXES,
  INITIAL_LINKED_SENTENCES,
  CLINICAL_PHRASEBOOK
} from '../data/medicalLexiconData';
import {
  extractDetailedTermMatchesFromText,
  isLinkableSpecializedTerm
} from './knowledgeLinker';

export interface MaskedEntityRecord {
  placeholder: string;
  originalText: string;
  resolvedEn: string;
  translationAr: string;
  sourceLayer:
    | 'Layer 1: Aho-Corasick Lexicon'
    | 'Layer 1: Context Disambiguator'
    | 'Layer 2: Morphological Decomposer';
  disambiguationNote?: string;
  morphologyNote?: string;
  termId?: string;
}

export interface HybridTranslationResult {
  rawInput: string;
  layer1MaskedText: string;
  layer2MorphologyText: string;
  layer3NmtStructuralAr: string;
  layer4FinalOutputAr: string;
  executionTimeMs: number;
  maskedEntities: MaskedEntityRecord[];
}

export interface MorphologicalPart {
  affix: string;
  meaningAr: string;
  meaningEn: string;
}

export interface MorphologicalDecompositionResult {
  word: string;
  foundInStaticLexicon: boolean;
  prefix?: MorphologicalPart;
  root?: MorphologicalPart;
  roots?: MorphologicalPart[];
  suffix?: MorphologicalPart;
  synthesizedAr: string;
  confidence: 'High (Rule-Matched)' | 'Lexicon Verified' | 'Partial Heuristic';
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanPrimaryArMeaning(meaningAr: string): string {
  return meaningAr
    .split(/[/(،·]/)[0]
    .trim();
}

/**
 * Words that are common non-compound English clinical/structural tokens and should
 * not be falsely decomposed by Layer 2 heuristic affix matching.
 */
const NON_COMPOUND_ENGLISH_STOPWORDS = new Set([
  'patient',
  'patients',
  'presented',
  'presenting',
  'history',
  'physical',
  'examination',
  'admission',
  'revealed',
  'reveals',
  'consistent',
  'bilateral',
  'crackles',
  'following',
  'treatment',
  'paroxysmal',
  'showed',
  'elevation',
  'indicative',
  'coronary',
  'ventricular',
  'computed',
  'tomography',
  'without',
  'contrast',
  'excluded',
  'laboratory',
  'evaluation',
  'decompensated',
  'started',
  'empirical',
  'intravenous',
  'antibiotics',
  'adjustment',
  'according',
  'informed',
  'consent',
  'obtained',
  'laparoscopic',
  'symptomatic',
  'biliary',
  'differential',
  'diagnosis',
  'includes',
  'immediate',
  'intramuscular',
  'epinephrine',
  'airway',
  'protection',
  'resolved',
  'prevented',
  'progression',
  'discharged',
  'stable',
  'condition',
  'outpatient',
  'instructions',
  'relapsing',
  'remitting',
  'auscultation',
  'diastolic',
  'systolic',
  'murmur',
  'rheumatic',
  'administered',
  'severe',
  'ultrasound',
  'demonstrated',
  'conjugated',
  'combining',
  'quantized',
  'guarantees',
  'overhead',
  'during',
  'plaques',
  'confirmed',
  'secondary',
  'emergency',
  'department',
  'significant',
  'normal',
  'limits',
  'within',
  'chronic',
  'multiple',
  'status',
  'acute',
  'increased',
  'decreased',
  'synthesis',
  'failure',
  'dietary',
  'starvation',
  'demands',
  'growing',
  'infants',
  'children',
  'puberty',
  'pregnancy',
  'lactation',
  'congenital',
  'called',
  'saturation',
  'types',
  'causes',
  'caused',
  'deficiency',
  'deficient',
  'transferrin',
  'ferritin',
  'women',
  'woman',
  'before',
  'inside',
  'palaces',
  'bitterness',
  'loneliness',
  'university',
  'canals'
]);

/**
 * Synthesizes natural Arabic medical terminology from decomposed Prefix + Root(s) + Suffix:
 * - Standard Arabic clinical rule: `[معنى اللاحقة] + [معنى الجذر/الجذور] + [معنى السابقة]`
 * - Adjectival cellular/pigment/blast descriptors (`-cytic`, `-chromic`, `-blastic`, `-lytic`):
 *   `[معنى البادئة/الصفة] + [معنى اللاحقة بالجمع]` (e.g., `صغير الكريات`, `ناقص الصباغ`, `حديدي الأرومات`, `انحلالي الدم`)
 * - Quantitative/Directional Prefix with Fluid/State Suffix (`-emia`, `-uria`, `-pnea`, `-ia`):
 *   `[معنى السابقة] + [معنى الجذر/الجذور] + [معنى اللاحقة]`
 */
function buildArabicMorphologicalSynthesis(
  prefix: MorphologicalAffix | undefined,
  roots: MorphologicalAffix[],
  suffix: MorphologicalAffix | undefined
): string {
  const prefixAr = prefix ? cleanPrimaryArMeaning(prefix.meaningAr) : '';
  const suffixAr = suffix ? cleanPrimaryArMeaning(suffix.meaningAr) : '';
  const rootMeanings = roots.map((r) => cleanPrimaryArMeaning(r.meaningAr));

  // Combine multiple roots naturally in Arabic
  let combinedRootsAr = '';
  if (rootMeanings.length === 1) {
    combinedRootsAr = rootMeanings[0];
  } else if (rootMeanings.length === 2) {
    const [r1, r2] = rootMeanings;
    if (r1.includes('عضلة') || r2.includes('عضلة')) {
      combinedRootsAr = r2.includes('عضلة') ? `${r2} ${r1}` : `${r1} ${r2}`;
    } else if (r2.includes('حصاة') || r2.includes('الحصاة')) {
      combinedRootsAr =
        suffix?.cleanKey === 'otomy'
          ? `${r1} لاستخراج ${r2}`
          : `${r1} و${r2}`;
    } else if (r2.includes('خلية') || r2.includes('الخلايا')) {
      combinedRootsAr = `${r2} (${r1})`;
    } else {
      combinedRootsAr = `${r1} و${r2}`;
    }
  } else if (rootMeanings.length > 2) {
    combinedRootsAr =
      rootMeanings.slice(0, -1).join(' و') + ' و' + rootMeanings[rootMeanings.length - 1];
  }

  // Case 0: Adjectival hematology/cellular/pigment/blast descriptors (-cytic, -chromic, -blastic, -lytic)
  // Or prefix + cyt/chrom/blast root without pathology suffix (e.g., Microcytic -> صغير الكريات)
  const pKey = prefix?.cleanKey || '';
  const sKey = suffix?.cleanKey || '';
  const firstRootKey = roots[0]?.cleanKey || '';

  if (sKey === 'cytic' || (!suffix && firstRootKey === 'cyt')) {
    if (pKey === 'micro') return 'صغير الكريات';
    if (pKey === 'macro') return 'كبير الكريات';
    if (pKey === 'normo' || pKey === 'eu') return 'سويّ الكريات';
    if (pKey === 'aniso') return 'متفاوت الكريات';
    if (pKey === 'poikilo') return 'متفاوت أشكال الكريات';
    return `${prefixAr || combinedRootsAr} الكريات`.trim();
  }

  if (sKey === 'chromic' || (!suffix && firstRootKey === 'chrom')) {
    if (pKey === 'hypo') return 'ناقص الصباغ';
    if (pKey === 'hyper') return 'مفرط الصباغ';
    if (pKey === 'normo' || pKey === 'eu') return 'سويّ الصباغ';
    return `${prefixAr || combinedRootsAr} الصباغ`.trim();
  }

  if (sKey === 'blastic' || (!suffix && firstRootKey === 'blast')) {
    if (firstRootKey === 'sider' || pKey === 'sider') return 'حديدي الأرومات';
    if (pKey === 'megalo' || pKey === 'macro') return 'ضخم الأرومات';
    return `${prefixAr || combinedRootsAr} الأرومات`.trim();
  }

  if (sKey === 'lytic') {
    if (firstRootKey === 'hem' || firstRootKey === 'hemat') return 'انحلالي الدم';
    if (firstRootKey === 'thromb') return 'حالّ للخثرة';
    return `انحلالي ${combinedRootsAr || prefixAr}`.trim();
  }

  // Case 1: Quantitative/directional prefix with fluid/condition suffix (-emia, -uria, -pnea, -ia)
  const quantitativePrefixKeys = new Set([
    'hyper',
    'hypo',
    'tachy',
    'brady',
    'dys',
    'a',
    'an',
    'oligo',
    'pan',
    'hemi',
    'para',
    'auto',
    'micro',
    'macro',
    'normo',
    'megalo'
  ]);
  const fluidOrConditionSuffixKeys = new Set([
    'emia',
    'uria',
    'pnea',
    'oxia',
    'capnia',
    'glycemia',
    'kalemia',
    'natremia',
    'calcemia'
  ]);

  if (
    prefix &&
    suffix &&
    quantitativePrefixKeys.has(prefix.cleanKey) &&
    fluidOrConditionSuffixKeys.has(suffix.cleanKey)
  ) {
    const parts = [prefixAr, combinedRootsAr, suffixAr].filter(Boolean);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  // Case 2: Standard Arabic pathology / surgical synthesis:
  // [معنى اللاحقة] + [معنى الجذر] + [معنى السابقة]
  const orderedParts: string[] = [];
  if (suffixAr) {
    orderedParts.push(suffixAr);
  }
  if (combinedRootsAr) {
    orderedParts.push(combinedRootsAr);
  }
  if (prefixAr) {
    if (prefix?.cleanKey === 'poly' && suffixAr) {
      orderedParts.push('المتعدد');
    } else if (prefix?.cleanKey === 'pan' && suffixAr) {
      orderedParts.push('الشامل');
    } else if (prefix?.cleanKey === 'endo' && suffixAr) {
      orderedParts.push('الداخلي (الشغاف/البطانة)');
    } else if (prefix?.cleanKey === 'peri' && suffixAr) {
      orderedParts.push('المحيطي (التامور)');
    } else {
      orderedParts.push(prefixAr);
    }
  }

  return orderedParts.join(' ').replace(/\s+/g, ' ').trim() || 'مركب طبي قياسي';
}

/**
 * Layer 2 Standalone Rule-Based Morphological Decomposer
 * Splits complex Greek/Latin medical compounds into Prefix + Root(s) + Suffix.
 * Sorts prefixes, roots, and suffixes descending by `cleanKey.length` before matching,
 * supports multi-root compounds (`Choledocholithotomy`, `Esophagogastroduodenoscopy`,
 * `Gastroenteritis`, `Hepatosplenomegaly`), and synthesizes Arabic translations in proper grammar order:
 * `[معنى اللاحقة] + [معنى الجذر] + [معنى السابقة]`.
 */
export function decomposeMedicalWord(
  rawWord: string,
  terms: DictionaryTerm[],
  customAffixes: MorphologicalAffix[] = []
): MorphologicalDecompositionResult {
  const cleaned = rawWord.trim().replace(/[.,;:!?()[\]"]/g, '');
  const lower = cleaned.toLowerCase();

  if (!lower) {
    return {
      word: cleaned,
      foundInStaticLexicon: false,
      synthesizedAr: 'مصطلح غير محدد',
      confidence: 'Partial Heuristic'
    };
  }

  // 1. Check static lexicon first if it has explicit morphology
  const existing = terms.find((t) => t.termNormalized === lower);
  if (existing && existing.morphology) {
    const rootsList: MorphologicalPart[] = existing.morphology.root
      ? [existing.morphology.root]
      : [];
    return {
      word: cleaned,
      foundInStaticLexicon: true,
      prefix: existing.morphology.prefix,
      root: existing.morphology.root,
      roots: rootsList,
      suffix: existing.morphology.suffix,
      synthesizedAr: `${existing.translation} (${existing.morphology.literalSynthesisAr})`,
      confidence: 'Lexicon Verified'
    };
  }

  // 2. Sort all prefixes, roots, and suffixes strictly descending by `cleanKey.length`
  // so longer compound stems (e.g., `cholecyst`, `choledoch`, `thrombocyt`) match before shorter stems (`chol`, `thromb`).
  const allAffixes = [...MORPHOLOGICAL_AFFIXES, ...customAffixes];

  const sortedPrefixes = allAffixes
    .filter((a) => a.type === 'prefix' && a.cleanKey.length >= 1)
    .sort((a, b) => b.cleanKey.length - a.cleanKey.length);

  const sortedRoots = allAffixes
    .filter((a) => a.type === 'root' && a.cleanKey.length >= 2)
    .sort((a, b) => b.cleanKey.length - a.cleanKey.length);

  const sortedSuffixes = allAffixes
    .filter((a) => a.type === 'suffix' && a.cleanKey.length >= 2)
    .sort((a, b) => b.cleanKey.length - a.cleanKey.length);

  // Step A: Identify longest matching suffix that leaves at least 3 characters for stem/root
  let matchedSuffix: MorphologicalAffix | undefined;
  let remainingAfterSuffix = lower;

  for (const s of sortedSuffixes) {
    if (lower.endsWith(s.cleanKey) && lower.length - s.cleanKey.length >= 3) {
      matchedSuffix = s;
      remainingAfterSuffix = lower.slice(0, lower.length - s.cleanKey.length);
      break;
    }
  }

  // Strip trailing connecting vowel ('o' or 'i') left before suffix if stem is still >= 3 chars
  const trimConnectingVowelEnd = (stem: string): string => {
    if (stem.length > 4 && (stem.endsWith('o') || stem.endsWith('i'))) {
      const isDirectRoot = sortedRoots.some((r) => r.cleanKey === stem);
      if (!isDirectRoot) {
        return stem.slice(0, -1);
      }
    }
    return stem;
  };

  // Step B: Check if `remainingAfterSuffix` starts with a known root FIRST before assuming a prefix
  let matchedPrefix: MorphologicalAffix | undefined;
  let stemForRoots = remainingAfterSuffix;

  const startsWithLongRoot = sortedRoots.find(
    (r) => r.cleanKey.length >= 5 && remainingAfterSuffix.startsWith(r.cleanKey)
  );

  if (!startsWithLongRoot) {
    for (const p of sortedPrefixes) {
      const remAfterPrefix = remainingAfterSuffix.slice(p.cleanKey.length);
      const isExactPrefixWithRootBearingSuffix =
        Boolean(matchedSuffix) &&
        (remAfterPrefix === '' || remAfterPrefix === 'o' || remAfterPrefix === 'i');

      if (
        remainingAfterSuffix.startsWith(p.cleanKey) &&
        (remainingAfterSuffix.length - p.cleanKey.length >= 3 ||
          isExactPrefixWithRootBearingSuffix)
      ) {
        const candidateStem = remAfterPrefix;
        const hasKnownRootInRemaining = sortedRoots.some((r) =>
          candidateStem.includes(r.cleanKey)
        );
        if (
          p.cleanKey.length >= 3 ||
          isExactPrefixWithRootBearingSuffix ||
          (hasKnownRootInRemaining && matchedSuffix)
        ) {
          matchedPrefix = p;
          stemForRoots = isExactPrefixWithRootBearingSuffix ? '' : candidateStem;
          break;
        }
      }
    }
  }

  // Step C: Multi-Root Extraction across `stemForRoots`
  // Scans from left to right (longest root first) to support 1, 2, 3+ roots in a single compound word
  // (e.g., `esophag` + `o` + `gastr` + `o` + `duoden` -> `[esophago, gastro, duodeno]`;
  //  `choledoch` + `o` + `lith` -> `[choledocho, litho]`).
  const matchedRoots: MorphologicalAffix[] = [];
  let cursor = trimConnectingVowelEnd(stemForRoots);

  let guard = 0;
  while (cursor.length >= 2 && guard < 6) {
    guard += 1;
    if (
      matchedRoots.length > 0 &&
      cursor.length >= 3 &&
      (cursor.startsWith('o') || cursor.startsWith('i'))
    ) {
      const withoutVowel = cursor.slice(1);
      if (sortedRoots.some((r) => withoutVowel.startsWith(r.cleanKey))) {
        cursor = withoutVowel;
      }
    }

    const rootAtStart = sortedRoots.find((r) => cursor.startsWith(r.cleanKey));
    if (rootAtStart) {
      if (!matchedRoots.some((mr) => mr.cleanKey === rootAtStart.cleanKey)) {
        matchedRoots.push(rootAtStart);
      }
      cursor = cursor.slice(rootAtStart.cleanKey.length);
      if (cursor.startsWith('o') || cursor.startsWith('i')) {
        cursor = cursor.slice(1);
      }
    } else {
      const rootInside = sortedRoots.find(
        (r) => r.cleanKey.length >= 3 && cursor.includes(r.cleanKey)
      );
      if (rootInside) {
        if (!matchedRoots.some((mr) => mr.cleanKey === rootInside.cleanKey)) {
          matchedRoots.push(rootInside);
        }
        const idx = cursor.indexOf(rootInside.cleanKey);
        cursor = cursor.slice(idx + rootInside.cleanKey.length);
      } else {
        break;
      }
    }
  }

  if (matchedRoots.length === 0 && matchedPrefix) {
    const fullRootMatch = sortedRoots.find(
      (r) => r.cleanKey.length >= 3 && remainingAfterSuffix.includes(r.cleanKey)
    );
    if (fullRootMatch) {
      matchedPrefix = undefined;
      matchedRoots.push(fullRootMatch);
    }
  }

  if (matchedPrefix || matchedRoots.length > 0 || matchedSuffix) {
    const rootsParts: MorphologicalPart[] = matchedRoots.map((r) => ({
      affix: r.affix,
      meaningAr: r.meaningAr,
      meaningEn: r.meaningEn
    }));

    const combinedRootPart: MorphologicalPart =
      rootsParts.length === 0
        ? {
            affix: stemForRoots || cleaned,
            meaningAr: 'جذر طبي قيد التحليل',
            meaningEn: 'Clinical stem'
          }
        : rootsParts.length === 1
          ? rootsParts[0]
          : {
              affix: rootsParts.map((r) => r.affix).join(' + '),
              meaningAr: rootsParts
                .map((r) => cleanPrimaryArMeaning(r.meaningAr))
                .join(' + '),
              meaningEn: rootsParts.map((r) => r.meaningEn).join(' + ')
            };

    const synthesizedAr = existing
      ? `${existing.translation} (${buildArabicMorphologicalSynthesis(
          matchedPrefix,
          matchedRoots,
          matchedSuffix
        )})`
      : buildArabicMorphologicalSynthesis(matchedPrefix, matchedRoots, matchedSuffix);

    const isHighConfidence =
      (matchedRoots.length >= 1 && Boolean(matchedPrefix || matchedSuffix)) ||
      Boolean(matchedPrefix && matchedSuffix) ||
      matchedRoots.length >= 2;

    return {
      word: cleaned,
      foundInStaticLexicon: Boolean(existing),
      prefix: matchedPrefix
        ? {
            affix: matchedPrefix.affix,
            meaningAr: matchedPrefix.meaningAr,
            meaningEn: matchedPrefix.meaningEn
          }
        : undefined,
      root: combinedRootPart,
      roots: rootsParts,
      suffix: matchedSuffix
        ? {
            affix: matchedSuffix.affix,
            meaningAr: matchedSuffix.meaningAr,
            meaningEn: matchedSuffix.meaningEn
          }
        : undefined,
      synthesizedAr,
      confidence: existing
        ? 'Lexicon Verified'
        : isHighConfidence
          ? 'High (Rule-Matched)'
          : 'Partial Heuristic'
    };
  }

  return {
    word: cleaned,
    foundInStaticLexicon: Boolean(existing),
    root: {
      affix: cleaned,
      meaningAr: 'لم يتم رصد سوابق أو لواحق قياسية منفصلة',
      meaningEn: 'Base lexeme'
    },
    roots: [],
    synthesizedAr: existing ? existing.translation : '',
    confidence: existing ? 'Lexicon Verified' : 'Partial Heuristic'
  };
}

/**
 * PHASE 6.1: Layer 1 Context-Aware Abbreviation Disambiguator
 * Evaluates a `[-7, +7]` word context window around the abbreviation inside the sentence/clause
 * to resolve polysemous clinical abbreviations (`MS`, `PT`, `PE`, `MI`, `CA`, `RA`).
 * Falls back to the highest-priority default expansion (`priority`) when no trigger matches (`bestScore === 0`).
 */
export function resolveAbbreviationInContext(
  abbrStr: string,
  surroundingClause: string,
  customAbbreviations: ClinicalAbbreviation[] = []
): {
  expansionEn: string;
  translationAr: string;
  specialty: string;
  score: number;
  matchedTriggers: string[];
} | null {
  const targetLower = abbrStr.trim().toLowerCase();
  const allAbbreviations = [...CLINICAL_ABBREVIATIONS, ...customAbbreviations].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
  );
  const matchingEntries = allAbbreviations.filter(
    (a) => a.abbr.toLowerCase() === targetLower
  );
  if (matchingEntries.length === 0) return null;

  // Pick highest-priority entry
  const entry = matchingEntries[0];

  if (!entry.isAmbiguous || entry.candidates.length === 0) {
    return {
      expansionEn: entry.defaultExpansionEn,
      translationAr: entry.defaultTranslationAr,
      specialty: entry.category,
      score: entry.priority || 100,
      matchedTriggers: [`حتمي · أولوية (${entry.priority || 90})`]
    };
  }

  // Tokenize clause and extract a [-7, +7] word context window around the abbreviation
  const allClauseTokens = surroundingClause
    .toLowerCase()
    .split(/[^a-z0-9/%.-]+/)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ''))
    .filter(Boolean);

  const abbrTokenIdx = allClauseTokens.findIndex((tok) => tok === targetLower);
  const windowTokens =
    abbrTokenIdx !== -1
      ? allClauseTokens.slice(
          Math.max(0, abbrTokenIdx - 7),
          Math.min(allClauseTokens.length, abbrTokenIdx + 8)
        )
      : allClauseTokens;
  const windowText = windowTokens.join(' ');

  let bestCandidate = entry.candidates[0];
  let bestScore = 0;
  let bestTriggers: string[] = [];

  for (const cand of entry.candidates) {
    let score = 0;
    const hitTriggers: string[] = [];
    for (const trig of cand.triggers) {
      const trigLower = trig.token.toLowerCase();
      if (
        windowTokens.includes(trigLower) ||
        (trigLower.includes(' ') && windowText.includes(trigLower)) ||
        allClauseTokens.includes(trigLower)
      ) {
        score += trig.weight;
        hitTriggers.push(`${trig.token} (+${trig.weight})`);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = cand;
      bestTriggers = hitTriggers;
    }
  }

  // Fallback to default highest-priority expansion when no contextual trigger matches (bestScore === 0)
  if (bestScore === 0) {
    return {
      expansionEn: entry.defaultExpansionEn,
      translationAr: entry.defaultTranslationAr,
      specialty: entry.category,
      score: entry.priority || 15,
      matchedTriggers: [
        `التفسير الافتراضي الأعلى أولوية (Priority ${entry.priority || 90} · نافذة [-7, +7])`
      ]
    };
  }

  return {
    expansionEn: bestCandidate.expansionEn,
    translationAr: bestCandidate.translationAr,
    specialty: bestCandidate.specialty,
    score: bestScore,
    matchedTriggers: bestTriggers
  };
}

/**
 * Splits clinical text into clauses/sentences without breaking on:
 * - Decimal numbers (e.g., `4.5 mg`, `0.9% NaCl`, `38.2 C`)
 * - Dotted clinical/Latin abbreviations (e.g., `q.d.`, `b.i.d.`, `t.i.d.`, `q.i.d.`, `Dr.`, `Pt.`, `vs.`, `e.g.`, `i.e.`)
 */
export function splitClinicalClausesSafely(text: string): string[] {
  if (!text.trim()) return [];

  const DOT_TOKEN = '__DOT_PROTECTED__';
  let protectedText = text;

  // 1. Protect decimal points between digits (e.g., 4.5, 0.9) and numbered list markers (1., 2., 3.)
  protectedText = protectedText.replace(/(\d)\.(\d)/g, `$1${DOT_TOKEN}$2`);
  protectedText = protectedText.replace(/(^|\s)(\d+)\.(?=\s)/gm, `$1$2${DOT_TOKEN}`);

  // 2. Protect common dotted medical & Latin abbreviations
  const dottedAbbreviations = [
    'q.d.',
    'b.i.d.',
    't.i.d.',
    'q.i.d.',
    'q.o.d.',
    'p.r.n.',
    'p.o.',
    'i.v.',
    'i.m.',
    's.c.',
    's.l.',
    'n.p.o.',
    'c.o.',
    'h.o.',
    'dr.',
    'pt.',
    'pts.',
    'vs.',
    'mg.',
    'ml.',
    'mcg.',
    'approx.',
    'e.g.',
    'i.e.',
    'st.',
    'jr.',
    'sr.'
  ];

  for (const abbr of dottedAbbreviations) {
    const escaped = escapeRegExp(abbr);
    const regex = new RegExp(`(?<![a-z0-9])${escaped}`, 'gi');
    protectedText = protectedText.replace(regex, (m) => m.replace(/\./g, DOT_TOKEN));
  }

  const rawClauses = protectedText.split(/(?<=[.!?])\s+/);
  return rawClauses.map((c) => c.replace(new RegExp(DOT_TOKEN, 'g'), '.'));
}

/**
 * PHASE 6.3: Builds phrasebook templates from `CLINICAL_PHRASEBOOK`, `INITIAL_LINKED_SENTENCES`,
 * and expanded clinical structural rules so that full sentences or recurring clinical phrase
 * templates are translated while keeping `[MED_XXX]` and `[MORPH_XXX]` intact.
 */
function applyLayer3PhrasebookAndStructuralNmt(
  maskedInput: string,
  _terms: DictionaryTerm[],
  sentences: LinkedSentence[] = INITIAL_LINKED_SENTENCES,
  maskedEntities: MaskedEntityRecord[] = []
): string {
  let working = maskedInput;

  // Step 3A: Match longest clinical phrasebook templates first (from CLINICAL_PHRASEBOOK + sentences)
  const combinedPhraseSeeds = [
    ...CLINICAL_PHRASEBOOK.map((p) => ({ en: p.en, ar: p.ar })),
    ...sentences.map((s) => ({ en: s.ar ? s.en : '', ar: s.ar }))
  ]
    .filter((s) => s.en.length >= 18)
    .sort((a, b) => b.en.length - a.en.length);

  for (const seed of combinedPhraseSeeds) {
    const cleanSeedEn = seed.en.trim();
    const escapedSeed = escapeRegExp(cleanSeedEn);
    const exactRegex = new RegExp(escapedSeed, 'gi');
    if (exactRegex.test(working)) {
      working = working.replace(exactRegex, seed.ar);
    }
  }

  // Step 3B: Normalize OCR artifacts (e.g., standalone 'g' between words from PDF copy-paste) and arrow chains
  working = working.replace(/\s*>>>+\s*/g, ' ← ');
  working = working.replace(/\s*>>\s*/g, ' ← ');
  working = working.replace(/\s*-->?\s*/g, ' ← ');
  working = working.replace(/\s*=>\s*/g, ' ← ');
  working = working.replace(/\bin\s+g\s+(?=[a-z[])/gi, 'in growing ');
  working = working.replace(/(?<=[a-z\]])\s+g\s+(?=[a-z[])/gi, ' and ');
  working = working.replace(/\s+-lactation\b/gi, ' and lactation');

  // Step 3C: Reorder English Adjective(s) + Medical Entity Noun into Arabic Noun + Adjective(s) order
  // (تقديم الموصوف على الصفة في العربية: مثل Microcytic anemia -> [فقر الدم] [صغير الكريات])
  const morphAdjectiveSet = new Set(
    maskedEntities
      .filter(
        (e) =>
          e.sourceLayer === 'Layer 2: Morphological Decomposer' &&
          /(?:ic|al|ar|ous|oid)$/i.test(e.originalText)
      )
      .map((e) => e.placeholder)
  );

  // Pattern 1: "congenital [MORPH_XXX] [MED_YYY]" -> "[MED_YYY] [MORPH_XXX] الخلقي"
  working = working.replace(
    /\bcongenital\s+(\[MORPH_\d+\])\s+(\[MED_\d+\])/gi,
    (_m, morphTok: string, medTok: string) => `${medTok} ${morphTok} الخلقي`
  );

  // Pattern 2: "[MORPH_XXX], [MORPH_YYY] [MED_ZZZ]" -> "[MED_ZZZ] [MORPH_XXX] و[MORPH_YYY]"
  working = working.replace(
    /(\[MORPH_\d+\])\s*,\s*(\[MORPH_\d+\])\s+(\[MED_\d+\])/g,
    (full, m1: string, m2: string, medTok: string) => {
      if (morphAdjectiveSet.has(m1) || morphAdjectiveSet.has(m2)) {
        return `${medTok} ${m1} و${m2}`;
      }
      return full;
    }
  );

  // Pattern 3: "[MORPH_XXX] [MED_YYY]" -> "[MED_YYY] [MORPH_XXX]"
  working = working.replace(
    /(\[MORPH_\d+\])\s+(\[MED_\d+\])/g,
    (full, morphTok: string, medTok: string) => {
      if (morphAdjectiveSet.has(morphTok)) {
        return `${medTok} ${morphTok}`;
      }
      return full;
    }
  );

  // Pattern 3B: Reorder "[MED_serum] [MED_target]" -> "[MED_target] في [MED_serum]" and "[MED_serum] iron" -> "حديد [MED_serum]"
  const serumPlaceholders = new Set(
    maskedEntities
      .filter((e) => e.originalText.toLowerCase() === 'serum')
      .map((e) => e.placeholder)
  );
  if (serumPlaceholders.size > 0) {
    working = working.replace(
      /(\[MED_\d+\])\s+(\[MED_\d+\])/g,
      (full, firstMed: string, secondMed: string) => {
        if (serumPlaceholders.has(firstMed)) {
          return `${secondMed} في ${firstMed}`;
        }
        return full;
      }
    );
    working = working.replace(
      /(\[MED_\d+\])\s+iron\b/gi,
      (full, firstMed: string) => {
        if (serumPlaceholders.has(firstMed)) {
          return `حديد ${firstMed}`;
        }
        return full;
      }
    );
  }

  // Pattern 4: Common clinical English adjective immediately preceding a [MED_XXX] noun
  const preMedAdjectiveMap: [RegExp, string][] = [
    [/\bcongenital\s+hemolytic\s+(\[MED_\d+\])/gi, '$1 الانحلالي الخلقي'],
    [/\bsideroblastic\s+(\[MED_\d+\])/gi, '$1 حديدي الأرومات'],
    [/\bmegaloblastic\s+(\[MED_\d+\])/gi, '$1 ضخم الأرومات'],
    [/\bhemolytic\s+(\[MED_\d+\])/gi, '$1 الانحلالي'],
    [/\bmicrocytic\s*,\s*hypochromic\s+(\[MED_\d+\])/gi, '$1 صغيرة الحجم ناقصة الصباغ'],
    [/\bmicrocytic\s+hypochromic\s+(\[MED_\d+\])/gi, '$1 صغيرة الحجم ناقصة الصباغ'],
    [/\bmicrocytic\s+(\[MED_\d+\])/gi, '$1 صغير الكريات'],
    [/\bmacrocytic\s+(\[MED_\d+\])/gi, '$1 كبير الكريات'],
    [/\bnormocytic\s+(\[MED_\d+\])/gi, '$1 سويّ الكريات'],
    [/\bhypochromic\s+(\[MED_\d+\])/gi, '$1 ناقص الصباغ'],
    [/\bacute\s+ventricular\s+(\[MED_\d+\])/gi, '$1 البطيني الحاد'],
    [/\bventricular\s+(\[MED_\d+\])/gi, '$1 البطيني'],
    [/\bsupraventricular\s+(\[MED_\d+\])/gi, '$1 فوق البطيني'],
    [/\batrial\s+(\[MED_\d+\])/gi, '$1 الأذيني'],
    [/\bcoronary\s+(\[MED_\d+\])/gi, '$1 التاجي'],
    [/\bacute\s+(\[MED_\d+\])/gi, '$1 الحاد'],
    [/\bchronic\s+(\[MED_\d+\])/gi, '$1 المزمن'],
    [/\bsevere\s+(\[MED_\d+\])/gi, '$1 الشديد'],
    [/\bmild\s+(\[MED_\d+\])/gi, '$1 الطفيف'],
    [/\bmoderate\s+(\[MED_\d+\])/gi, '$1 المتوسط'],
    [/\bcongenital\s+(\[MED_\d+\])/gi, '$1 الخلقي'],
    [/\bhereditary\s+(\[MED_\d+\])/gi, '$1 الوراثي'],
    [/\bautoimmune\s+(\[MED_\d+\])/gi, '$1 المناعي الذاتي'],
    [/\bdecompensated\s+(\[MED_\d+\])/gi, '$1 اللاتعاوضي'],
    [/\brheumatic\s+(\[MED_\d+\])/gi, '$1 الرثوي'],
    [/\brelapsing\s+(\[MED_\d+\])/gi, '$1 الناكس'],
    [/\bserum\s+(\[MED_\d+\])/gi, '$1 في المصل']
  ];

  for (const [adjPattern, adjReplacement] of preMedAdjectiveMap) {
    working = working.replace(adjPattern, adjReplacement);
  }

  // Step 3D: High-precision multi-word clinical & educational phrasebook patterns (sorted longest-first)
  const phrasebookClauses: [RegExp, string][] = [
    [
      /\bThe patient presented to the emergency department with\b/gi,
      'حضر المريض إلى قسم الطوارئ وهو يشكو من'
    ],
    [
      /\bpresented to the emergency department with\b/gi,
      'حضر إلى قسم الطوارئ وهو يعاني من'
    ],
    [
      /\bPast medical history is significant for\b/gi,
      'التاريخ المرضي السابق حافل بالإصابة بـ'
    ],
    [
      /\bPhysical examination on admission revealed bilateral basal crackles consistent with\b/gi,
      'أظهر الفحص السريري عند القبول وجود خراخر قاعدية ثنائية الجانب متوافقة مع'
    ],
    [
      /\bPhysical examination on admission revealed\b/gi,
      'أظهر الفحص السريري عند القبول وجود'
    ],
    [
      /\bVital signs were stable and within normal limits following treatment of\b/gi,
      'كانت العلامات الحيوية مستقرة وضمن الحدود الطبيعية عقب معالجة'
    ],
    [
      /\bVital signs were stable and within normal limits\b/gi,
      'كانت العلامات الحيوية مستقرة وضمن الحدود الطبيعية'
    ],
    [
      /\bElectrocardiogram showed sinus\b/gi,
      'أظهر تخطيط كهربية القلب نظماً جيبياً من'
    ],
    [
      /\bwith ST-segment elevation indicative of\b/gi,
      'مع ارتفاع في القطعة ST مما يدل على'
    ],
    [
      /\bComputed tomography of the brain without contrast excluded\b/gi,
      'نفى التصوير المقطعي المحوسب للدماغ بدون حقن وجود'
    ],
    [
      /\bprior to thrombolysis for\b/gi,
      'قبل إعطاء حالّات الخثرة لعلاج'
    ],
    [
      /\bLaboratory evaluation revealed\b/gi,
      'أظهرت الفحوص المخبرية وجود'
    ],
    [
      /\bThe patient was started on empirical intravenous broad-spectrum antibiotics with dose adjustment according to\b/gi,
      'تم البدء بإعطاء المريض مضادات حيوية وريدية واسعة الطيف بصورة تجريبية مع تعديل الجرعة وفق'
    ],
    [
      /\bInformed consent was obtained prior to laparoscopic\b/gi,
      'تم الحصول على الموافقة المستنيرة قبل إجراء الجراحة التنظيرية لـ'
    ],
    [
      /\bDifferential Diagnosis in acute chest pain and dyspnea includes\b/gi,
      'يشمل التشخيص التفريقي في ألم الصدر الحاد والزلة التنفسية كلاً من'
    ],
    [
      /\bImmediate intramuscular epinephrine and airway protection resolved\b/gi,
      'أدى حقن الإبينفرين العضلي الفوري وحماية الطريق الهوائي إلى معالجة'
    ],
    [
      /\band prevented progression to\b/gi,
      'ومنع التدهور نحو'
    ],
    [
      /\bDischarged in stable condition with outpatient Neurology follow-up instructions for\b/gi,
      'تخرّج المريض بحالة مستقرة مع تعليمات المتابعة في العيادة العصبية الخارجية لحالة'
    ],
    [
      /\bAuscultation at the apex revealed a diastolic murmur consistent with rheumatic\b/gi,
      'أظهر الإصغاء عند قمة القلب نفخة انبساطية متوافقة مع إصابة رثوية بـ'
    ],
    [
      /\bMRI brain plaques and optic neuritis confirmed relapsing\b/gi,
      'أكدت اللويحات الدماغية في الرنين المغناطيسي (MRI) والتهاب العصب البصري الإصابة الناكسة بـ'
    ],
    [
      /\bBrain plaques and optic neuritis confirmed relapsing\b/gi,
      'أكدت اللويحات الدماغية والتهاب العصب البصري الإصابة الناكسة بـ'
    ],
    [
      /\bThere are four types of\b/gi,
      'توجد أربعة أنواع من'
    ],
    [
      /\bThere are three types of\b/gi,
      'توجد ثلاثة أنواع من'
    ],
    [
      /\bThere are two types of\b/gi,
      'يوجد نوعان من'
    ],
    [
      /\bThere are several types of\b/gi,
      'توجد عدة أنواع من'
    ],
    [
      /\bThere are\b/gi,
      'توجد'
    ],
    [
      /\bThere is\b/gi,
      'يوجد'
    ],
    [
      /\btypes of\b/gi,
      'أنواع من'
    ],
    [
      /\bis caused by\b/gi,
      'ينتج عن'
    ],
    [
      /\bare caused by\b/gi,
      'تنتج عن'
    ],
    [
      /\bcaused by\b/gi,
      'الناتج عن'
    ],
    [
      /\bCauses of iron deficiency\b/gi,
      'أسباب عوز الحديد'
    ],
    [
      /\bCauses of\b/gi,
      'أسباب'
    ],
    [
      /\bfailure of heme synthesis\b/gi,
      'فشل تصنيع الهيم'
    ],
    [
      /\bfailure heme synthesis\b/gi,
      'فشل تصنيع الهيم'
    ],
    [
      /\bheme synthesis\b/gi,
      'تصنيع الهيم'
    ],
    [
      /\bdecreased synthesis of\b/gi,
      'انخفاض تصنيع'
    ],
    [
      /\bincreased synthesis of\b/gi,
      'زيادة تصنيع'
    ],
    [
      /\bdecreased\s*%\s*saturation of\b/gi,
      'انخفاض نسبة إشباع'
    ],
    [
      /\bincreased\s*%\s*saturation of\b/gi,
      'زيادة نسبة إشباع'
    ],
    [
      /%\s*saturation of\b/gi,
      'نسبة إشباع'
    ],
    [
      /\bsaturation of\b/gi,
      'إشباع'
    ],
    [
      /\bDietary iron deficiency\b/gi,
      'عوز الحديد الغذائي'
    ],
    [
      /\biron deficiency\b/gi,
      'عوز الحديد'
    ],
    [
      /\biron-deficiency\b/gi,
      'نقص الحديد'
    ],
    [
      /\bvegan diet\b/gi,
      'النظام الغذائي النباتي الصرف'
    ],
    [
      /\bvegetarian diet\b/gi,
      'النظام الغذائي النباتي'
    ],
    [
      /\bstarvation\b/gi,
      'المجاعة أو سوء التغذية'
    ],
    [
      /\bIncreased demands for iron\b/gi,
      'زيادة الاحتياج للحديد'
    ],
    [
      /\bincreased demands for\b/gi,
      'زيادة الاحتياج لـ'
    ],
    [
      /\bdecreased demands for\b/gi,
      'انخفاض الاحتياج لـ'
    ],
    [
      /\bin growing infants and children\b/gi,
      'لدى الرضّع والأطفال في طور النمو'
    ],
    [
      /\bin growing infants\b/gi,
      'لدى الرضّع في طور النمو'
    ],
    [
      /\bgrowing infants and children\b/gi,
      'الرضّع والأطفال في طور النمو'
    ],
    [
      /\bgrowing infants\b/gi,
      'الرضّع في طور النمو'
    ],
    [
      /\binfants and children\b/gi,
      'الرضّع والأطفال'
    ],
    [
      /\bat puberty\b/gi,
      'عند البلوغ'
    ],
    [
      /\bin women at pregnancy and lactation\b/gi,
      'لدى النساء أثناء الحمل والرضاعة'
    ],
    [
      /\bat pregnancy and lactation\b/gi,
      'أثناء الحمل والرضاعة'
    ],
    [
      /\bduring pregnancy and lactation\b/gi,
      'أثناء الحمل والرضاعة'
    ],
    [
      /\bpregnancy and lactation\b/gi,
      'الحمل والرضاعة'
    ],
    [
      /\bin women\b/gi,
      'لدى النساء'
    ],
    [
      /\bin men\b/gi,
      'لدى الرجال'
    ],
    [
      /\bin children\b/gi,
      'لدى الأطفال'
    ],
    [
      /\bin infants\b/gi,
      'لدى الرضّع'
    ],
    [
      /\bchronic blood loss\b/gi,
      'فقدان الدم المزمن'
    ],
    [
      /\bacute blood loss\b/gi,
      'فقدان الدم الحاد'
    ],
    [
      /\bblood loss\b/gi,
      'فقدان الدم'
    ],
    [
      /\bdecreased serum iron\b/gi,
      'انخفاض حديد المصل'
    ],
    [
      /\bincreased serum iron\b/gi,
      'ارتفاع حديد المصل'
    ],
    [
      /\bserum iron\b/gi,
      'حديد المصل'
    ],
    [
      /\bECG revealed\b/gi,
      'أظهر تخطيط القلب الكهربائي (ECG) وجود'
    ],
    [
      /\bUltrasound demonstrated\b/gi,
      'أظهر التصوير بالأمواج فوق الصوتية وجود'
    ],
    [
      /\bCombining a quantized\b/gi,
      'إن دمج نموذج مكمّم من'
    ],
    [
      /\bfor severe chest pain\b/gi,
      'لتسكين ألم الصدر الشديد'
    ],
    [
      /\boverhead during high\b/gi,
      'أثناء الضغط العالي من'
    ],
    [
      /\bCase A:/gi,
      'الحالة (أ):'
    ],
    [
      /\bCase B:/gi,
      'الحالة (ب):'
    ],
    [
      /\bCase C:/gi,
      'الحالة (ج):'
    ],
    [
      /\bin a patient with decompensated\b/gi,
      'لدى مريض مصاب بحالة لاتعاوضية من'
    ],
    [
      /\bin a patient with\b/gi,
      'لدى مريض مصاب بـ'
    ],
    [
      /\bsecondary to\b/gi,
      'ثانوي لحالة'
    ],
    [
      /\bconsistent with\b/gi,
      'متوافق مع'
    ],
    [
      /\bindicative of\b/gi,
      'دالّ على'
    ],
    [
      /\bprior to\b/gi,
      'قبل إجراء'
    ],
    [
      /\bfollowing treatment of\b/gi,
      'عقب معالجة'
    ],
    [
      /\bchest pain\b/gi,
      'ألم صدري'
    ],
    [
      /\bdyspnea\b/gi,
      'زلة تنفسية (ضيق النفس)'
    ],
    [
      /\brelapsing-remitting\b/gi,
      'ناكس هاجع'
    ],
    [
      /\bparoxysmal\b/gi,
      'انتيابي'
    ],
    [
      /\bsymptomatic\b/gi,
      'عرضي'
    ],
    [
      /\bbiliary\b/gi,
      'صفراوي'
    ],
    [
      /\brelapsing\b/gi,
      'ناكس'
    ],
    [
      /\brheumatic\b/gi,
      'رثوي'
    ],
    [
      /\bAdministered\b/gi,
      'تم إعطاء'
    ],
    [
      /\brevealed\b/gi,
      'أظهر وجود'
    ],
    [
      /\bdemonstrated\b/gi,
      'أظهر'
    ],
    [
      /\bconfirmed\b/gi,
      'أكد'
    ],
    [
      /\bresolved\b/gi,
      'عالج وأزال'
    ],
    [
      /\bexcluded\b/gi,
      'استبعد'
    ],
    [
      /\bguarantees\b/gi,
      'يضمن'
    ],
    [
      /\bconjugated\b/gi,
      'مقترن'
    ],
    [
      /\bDecreased\b/g,
      'انخفاض'
    ],
    [
      /\bdecreased\b/g,
      'انخفاض'
    ],
    [
      /\bIncreased\b/g,
      'ارتفاع'
    ],
    [
      /\bincreased\b/g,
      'ارتفاع'
    ],
    [
      /\bcalled\b/gi,
      'المسمّى'
    ],
    [
      /\bsynthesis\b/gi,
      'تصنيع'
    ],
    [
      /\bfailure\b/gi,
      'فشل'
    ],
    [
      /\bheme\b/gi,
      'الهيم'
    ],
    [
      /\biron\b/gi,
      'الحديد'
    ],
    [
      /\bserum\b/gi,
      'المصل'
    ],
    [
      /\bdietary\b/gi,
      'غذائي'
    ],
    [
      /\bcongenital\b/gi,
      'خلقي'
    ],
    [
      /\bpregnancy\b/gi,
      'الحمل'
    ],
    [
      /\blactation\b/gi,
      'الرضاعة'
    ],
    [
      /\bpuberty\b/gi,
      'البلوغ'
    ],
    [
      /\binfants\b/gi,
      'الرضّع'
    ],
    [
      /\bchildren\b/gi,
      'الأطفال'
    ],
    [
      /\bwomen\b/gi,
      'النساء'
    ],
    [
      /\bmen\b/gi,
      'الرجال'
    ],
    [
      /\bcoronary\b/gi,
      'تاجي'
    ],
    [
      /\bventricular\b/gi,
      'بطيني'
    ],
    [
      /\brenal\b/gi,
      'كلوي'
    ],
    [
      /\bhepatic\b/gi,
      'كبدي'
    ],
    [
      /\bcerebral\b/gi,
      'دماغي'
    ],
    [
      /\bpulmonary\b/gi,
      'رئوي'
    ],
    [
      /\bacute\b/gi,
      'حاد'
    ],
    [
      /\bchronic\b/gi,
      'مزمن'
    ],
    [
      /\bsevere\b/gi,
      'شديد'
    ],
    [
      /\bmild\b/gi,
      'طفيف'
    ],
    [
      /\blow\b/gi,
      'انخفاض عبء'
    ],
    [
      /\bprior\b/gi,
      'سابق من'
    ],
    [
      /\bwith\b/gi,
      'مع'
    ],
    [
      /\band\b/gi,
      'و'
    ],
    [
      /\bfor\b/gi,
      'لـ'
    ],
    [
      /\bof\b/gi,
      'من'
    ],
    [
      /\bin\b/gi,
      'في'
    ],
    [
      /\bat\b/gi,
      'عند'
    ]
  ];

  for (const [pattern, replacementAr] of phrasebookClauses) {
    working = working.replace(pattern, replacementAr);
  }

  return working;
}

/**
 * Formats laboratory numbers and clinical measurement units cleanly in Layer 4
 * (e.g., `4.5 mg`, `120/80 mmHg`, `14.2 mg/dL`, `150,000/µL`, `98%`).
 */
export function formatClinicalNumbersAndUnits(text: string): string {
  return text.replace(
    /(\d+(?:[.,/]\d+)*)\s*(mg\/dL|mmol\/L|mEq\/L|g\/dL|mmHg|cells\/µL|\/µL|µL|bpm|mcg|mg|mL|%)\b/gi,
    (_m, num: string, unit: string) => {
      const normalizedUnit =
        unit.toLowerCase() === 'mg/dl'
          ? 'mg/dL'
          : unit.toLowerCase() === 'mmol/l'
            ? 'mmol/L'
            : unit.toLowerCase() === 'meq/l'
              ? 'mEq/L'
              : unit.toLowerCase() === 'g/dl'
                ? 'g/dL'
                : unit.toLowerCase() === 'mmhg'
                  ? 'mmHg'
                  : unit.toLowerCase() === 'ml'
                    ? 'mL'
                    : unit;
      return unit === '%' ? `${num}%` : `${num} ${normalizedUnit}`;
    }
  );
}

/**
 * PHASE 6.3: Layer 4 Post-Injection: replaces all `[MED_XXX]` and `[MORPH_XXX]` placeholders
 * with `${entity.translationAr} (${entity.resolvedEn})` according to WHO UMD dual-formatting,
 * and formats clinical numbers and laboratory units cleanly.
 */
export function injectMaskedEntitiesLayer4(
  layer3Text: string,
  maskedEntities: MaskedEntityRecord[]
): string {
  let finalOutput = layer3Text;
  for (const entity of maskedEntities) {
    finalOutput = finalOutput.replace(
      entity.placeholder,
      `${entity.translationAr} (${entity.resolvedEn})`
    );
  }
  return formatClinicalNumbersAndUnits(finalOutput);
}

/**
 * Optional Layer 3 AI-Assisted Structural Translator (`translateWithGeminiAI`):
 * Sends the masked clinical sentence (`[MED_001]`, `[MORPH_001]`, ...) to `/api/translate-clinical`
 * which uses `@google/genai` on the backend (when `GEMINI_API_KEY` is available) to translate
 * complex clinical grammar into fluent Arabic while strictly preserving every `[MED_XXX]` and `[MORPH_XXX]` token,
 * then executes Layer 4 post-injection.
 */
export async function translateWithGeminiAI(
  maskedText: string,
  maskedEntities: MaskedEntityRecord[],
  fallbackLayer3Ar?: string
): Promise<{
  layer3NmtStructuralAr: string;
  layer4FinalOutputAr: string;
  usedGemini: boolean;
  error?: string;
}> {
  const safeFallbackL3 = fallbackLayer3Ar || maskedText;
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // 1. Try Server Proxy (/api/translate-clinical) ONLY if it returns valid JSON (guards against APK index.html `<!doctype`)
  if (isOnline) {
    try {
      const response = await fetch('/api/translate-clinical', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          maskedText,
          placeholders: maskedEntities.map((e) => ({
            placeholder: e.placeholder,
            meaningAr: e.translationAr,
            resolvedEn: e.resolvedEn
          }))
        })
      });

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const rawText = await response.text();
        const trimmed = rawText.trim();
        if (!trimmed.startsWith('<') && !trimmed.toLowerCase().startsWith('<!doctype')) {
          const data = JSON.parse(trimmed) as {
            translatedMaskedAr?: string;
            error?: string;
          };
          if (response.ok && data.translatedMaskedAr) {
            const aiLayer3 = data.translatedMaskedAr.trim() || safeFallbackL3;
            const aiLayer4 = injectMaskedEntitiesLayer4(aiLayer3, maskedEntities);
            return {
              layer3NmtStructuralAr: aiLayer3,
              layer4FinalOutputAr: aiLayer4,
              usedGemini: true
            };
          }
        }
      }
    } catch {
      // Fall through to local offline fallback
    }
  }

  // 3. Built-in Local Fallback (Never throws `<!doctype` error)
  return {
    layer3NmtStructuralAr: safeFallbackL3,
    layer4FinalOutputAr: injectMaskedEntitiesLayer4(safeFallbackL3, maskedEntities),
    usedGemini: false,
    error:
      'يتطلب التوليد اتصالاً بالإنترنت ومفتاح API — تم تفعيل المحرك السريري المحلي المدمج تلقائياً.'
  };
}

/**
 * Complete 4-Layer GC-NMT Hybrid Translation Engine Execution
 */
export function runHybridGcNmtPipeline(
  inputEn: string,
  terms: DictionaryTerm[],
  sentences: LinkedSentence[] = INITIAL_LINKED_SENTENCES,
  customAffixes: MorphologicalAffix[] = [],
  customAbbreviations: ClinicalAbbreviation[] = []
): HybridTranslationResult {
  const startTime = performance.now();
  const maskedEntities: MaskedEntityRecord[] = [];
  let medCounter = 1;
  let morphCounter = 1;

  const nextMedPlaceholder = () => {
    const id = `[MED_${String(medCounter).padStart(3, '0')}]`;
    medCounter += 1;
    return id;
  };

  const nextMorphPlaceholder = () => {
    const id = `[MORPH_${String(morphCounter).padStart(3, '0')}]`;
    morphCounter += 1;
    return id;
  };

  let workingText = inputEn;

  // =========================================================================
  // LAYER 1A: Longest-Match-First Multi-Word & Single-Word Lexicon Masking
  // Uses specialized medical/technical terms sorted by length descending
  // (excludes everyday general stopwords such as "There", "women", "children", "can")
  // =========================================================================
  const specializedTerms = terms.filter(isLinkableSpecializedTerm);
  const sortedTerms = [...specializedTerms].sort((a, b) => b.term.length - a.term.length);
  const termById = new Map<string, DictionaryTerm>();
  for (const t of specializedTerms) {
    termById.set(t.id, t);
  }

  for (const dictTerm of sortedTerms) {
    const escaped = escapeRegExp(dictTerm.term);
    const regex = new RegExp(`(?<![A-Za-z0-9_])(${escaped})(?![A-Za-z0-9_])`, 'gi');
    workingText = workingText.replace(regex, (match) => {
      const placeholder = nextMedPlaceholder();
      maskedEntities.push({
        placeholder,
        originalText: match,
        resolvedEn: dictTerm.term,
        translationAr: dictTerm.translation,
        sourceLayer: 'Layer 1: Aho-Corasick Lexicon',
        termId: dictTerm.id,
        morphologyNote: dictTerm.morphology?.literalSynthesisAr
      });
      return placeholder;
    });
  }

  // Also check any remaining unmasked synonyms/aliases via knowledgeLinker
  const remainingMatches = extractDetailedTermMatchesFromText(workingText, specializedTerms);
  for (const synMatch of remainingMatches) {
    if (synMatch.matchSource === 'term_ar') continue;
    const dictTerm = termById.get(synMatch.termId);
    if (!dictTerm) continue;
    const escaped = escapeRegExp(synMatch.matchedSurface);
    const regex = new RegExp(`(?<![A-Za-z0-9_\\[])(${escaped})(?![A-Za-z0-9_\\]])`, 'gi');
    workingText = workingText.replace(regex, (match) => {
      const placeholder = nextMedPlaceholder();
      maskedEntities.push({
        placeholder,
        originalText: match,
        resolvedEn: dictTerm.term,
        translationAr: dictTerm.translation,
        sourceLayer: 'Layer 1: Aho-Corasick Lexicon',
        termId: dictTerm.id,
        morphologyNote: dictTerm.morphology?.literalSynthesisAr
      });
      return placeholder;
    });
  }

  // =========================================================================
  // LAYER 1B: Context-Aware Clinical Abbreviation Disambiguation ([-7, +7] Window)
  // Uses safe clause splitting that protects decimal numbers (4.5 mg) and dotted abbreviations (q.d., Dr.)
  // while preserving paragraph line breaks (\n) for long multi-paragraph texts.
  // =========================================================================
  const allAbbreviations = [...CLINICAL_ABBREVIATIONS, ...customAbbreviations].sort(
    (a, b) => b.abbr.length - a.abbr.length || (b.priority ?? 0) - (a.priority ?? 0)
  );

  const paragraphs = workingText.split('\n');
  const processedParagraphs = paragraphs.map((para) => {
    if (!para.trim()) return para;
    const clauses = splitClinicalClausesSafely(para);
    const processedClauses = clauses.map((clause) => {
      let updatedClause = clause;

      for (const abbrItem of allAbbreviations) {
        const escapedAbbr = escapeRegExp(abbrItem.abbr);
        const regex = new RegExp(`(?<![A-Za-z0-9_\\[])(${escapedAbbr})(?![A-Za-z0-9_\\]])`, 'gi');
        updatedClause = updatedClause.replace(regex, (match) => {
          if (
            ['in', 'as', 'at', 'or', 'on', 'to', 'be'].includes(match.toLowerCase()) &&
            match === match.toLowerCase()
          ) {
            return match;
          }
          const resolved = resolveAbbreviationInContext(
            match,
            clause,
            customAbbreviations
          );
          if (!resolved) return match;
          const placeholder = nextMedPlaceholder();
          maskedEntities.push({
            placeholder,
            originalText: match,
            resolvedEn: `${match} — ${resolved.expansionEn}`,
            translationAr: resolved.translationAr,
            sourceLayer: 'Layer 1: Context Disambiguator',
            disambiguationNote: `السياق (${resolved.specialty}): ${resolved.matchedTriggers.join('، ')}`
          });
          return placeholder;
        });
      }
      return updatedClause;
    });
    return processedClauses.join(' ');
  });

  const layer1MaskedText = processedParagraphs.join('\n');

  // =========================================================================
  // LAYER 2: Generalized OOV Morphological Affix & Multi-Root Decomposer
  // Automatically inspects any English word of length >= 6 not yet masked by [MED_XXX]
  // and masks decomposed OOV compound words with [MORPH_XXX]
  // =========================================================================
  const layer2MorphologyText = layer1MaskedText.replace(
    /\[(?:MED|MORPH)_\d+\]|\b([A-Za-z]{6,})\b/g,
    (fullMatch, candidateWord?: string) => {
      if (!candidateWord) {
        return fullMatch;
      }

      const lowerCandidate = candidateWord.toLowerCase();
      if (NON_COMPOUND_ENGLISH_STOPWORDS.has(lowerCandidate)) {
        return fullMatch;
      }

      const decomp = decomposeMedicalWord(candidateWord, specializedTerms, customAffixes);
      if (
        decomp.confidence === 'High (Rule-Matched)' ||
        decomp.confidence === 'Lexicon Verified'
      ) {
        const placeholder = nextMorphPlaceholder();
        const morphFormulaParts = [
          decomp.prefix?.affix,
          ...(decomp.roots && decomp.roots.length > 0
            ? decomp.roots.map((r) => r.affix)
            : []),
          decomp.suffix?.affix
        ].filter(Boolean);

        maskedEntities.push({
          placeholder,
          originalText: candidateWord,
          resolvedEn: candidateWord,
          translationAr: decomp.synthesizedAr,
          sourceLayer: 'Layer 2: Morphological Decomposer',
          morphologyNote: morphFormulaParts.join(' + ')
        });
        return placeholder;
      }

      return fullMatch;
    }
  );

  // =========================================================================
  // LAYER 3: Phrasebook Templates & Structural Clinical NMT Grammar
  // Translates structural clinical English while keeping [MED_XXX] & [MORPH_XXX] intact
  // =========================================================================
  const layer3NmtStructuralAr = applyLayer3PhrasebookAndStructuralNmt(
    layer2MorphologyText,
    specializedTerms,
    sentences,
    maskedEntities
  );

  // =========================================================================
  // LAYER 4: Clinical Post-Injection & Dual Formatting (UMD Standard)
  // =========================================================================
  const layer4FinalOutputAr = injectMaskedEntitiesLayer4(
    layer3NmtStructuralAr,
    maskedEntities
  );

  const endTime = performance.now();
  const executionTimeMs = Math.max(0.8, Number((endTime - startTime).toFixed(2)));

  return {
    rawInput: inputEn,
    layer1MaskedText,
    layer2MorphologyText,
    layer3NmtStructuralAr,
    layer4FinalOutputAr,
    executionTimeMs,
    maskedEntities
  };
}

export const QUICK_CLINICAL_AND_GENERAL_GLOSSARY: Record<string, string> = {
  small: 'صغير / صغير الحجم',
  smaller: 'أصغر حجماً',
  large: 'كبير / كبير الحجم',
  larger: 'أكبر حجماً',
  tiny: 'دقيق / ضئيل جداً',
  normal: 'طبيعي / سويّ',
  abnormal: 'غير طبيعي / شاذ',
  low: 'منخفض / قليل',
  lower: 'أقل / منخفض',
  high: 'مرتفع / عالٍ',
  higher: 'أعلى / مرتفع',
  mild: 'خفيف / طفيف',
  moderate: 'متوسط الشدة',
  severe: 'شديد / حاد',
  acute: 'حاد',
  chronic: 'مزمن',
  early: 'مبكر',
  late: 'متأخر',
  primary: 'أولي / أساسي',
  secondary: 'ثانوي',
  common: 'شائع',
  rare: 'نادر',
  blood: 'الدم',
  cell: 'خلية',
  cells: 'خلايا',
  red: 'أحمر / حمراء',
  white: 'أبيض / بيضاء',
  bone: 'عظم',
  marrow: 'نخاع العظم / النقي',
  iron: 'الحديد',
  oxygen: 'الأكسجين',
  acid: 'حمض',
  protein: 'بروتين',
  proteins: 'بروتينات',
  enzyme: 'إنزيم',
  enzymes: 'إنزيمات',
  gene: 'جين / مورثة',
  genes: 'جينات / مورثات',
  genetic: 'وراثي / جيني',
  inherited: 'موروث / وراثي',
  acquired: 'مكتسب',
  congenital: 'خلقي',
  deficiency: 'نقص / عوز',
  deficient: 'ناقص / معوز',
  excess: 'فرط / زيادة',
  production: 'إنتاج / تصنيع',
  destruction: 'تدمير / تحطم',
  synthesis: 'تخليق / تصنيع',
  absorption: 'امتصاص',
  storage: 'تخزين / مخزون',
  stores: 'مخازن / مخزون',
  transport: 'نقل',
  release: 'إفراز / إطلاق',
  level: 'مستوى',
  levels: 'مستويات',
  count: 'تعداد / عدد',
  size: 'حجم',
  shape: 'شكل',
  pale: 'شاحب / باهت',
  pallor: 'شحوب',
  fatigue: 'إرهاق / تعب',
  weakness: 'ضعف / وهن',
  pain: 'ألم',
  fever: 'حمى',
  swelling: 'تورم / انتفاخ',
  bleeding: 'نزيف',
  clot: 'جلطة / خثرة',
  clotting: 'تخثر',
  infection: 'عدوى',
  infections: 'عدوى / إصابات',
  infected: 'مصاب بعدوى',
  inflammation: 'التهاب',
  inflammatory: 'التهابي',
  immune: 'مناعي',
  disease: 'مرض',
  diseases: 'أمراض',
  disorder: 'اضطراب',
  disorders: 'اضطرابات',
  syndrome: 'متلازمة',
  symptom: 'عرض',
  symptoms: 'أعراض',
  sign: 'علامة سريرية',
  signs: 'علامات سريرية',
  cause: 'سبب',
  causes: 'أسباب',
  caused: 'ناجم عن / مُسبَّب',
  risk: 'خطر / اختطار',
  factor: 'عامل',
  factors: 'عوامل',
  test: 'فحص / اختبار',
  tests: 'فحوصات / اختبارات',
  diagnosis: 'تشخيص',
  diagnostic: 'تشخيصي',
  treatment: 'علاج',
  therapy: 'علاج / مداواة',
  management: 'تدبير علاجي / إدارة',
  dose: 'جرعة',
  oral: 'فموي / عن طريق الفم',
  intravenous: 'وريدي',
  diet: 'نظام غذائي',
  dietary: 'غذائي',
  pregnancy: 'الحمل',
  infant: 'رضيع',
  infants: 'الرضّع',
  child: 'طفل',
  children: 'الأطفال',
  adult: 'بالغ',
  adults: 'البالغون',
  patient: 'مريض',
  patients: 'مرضى',
  clinical: 'سريري',
  laboratory: 'مخبري',
  peripheral: 'محيطي / طرفي',
  central: 'مركزي',
  smear: 'لطاخة',
  biopsy: 'خزعة',
  serum: 'مصل الدم',
  plasma: 'بلازما الدم',
  urine: 'البول',
  stool: 'البراز',
  liver: 'الكبد',
  spleen: 'الطحال',
  kidney: 'الكلية',
  heart: 'القلب',
  lung: 'الرئة',
  brain: 'الدماغ',
  tissue: 'نسيج',
  tissues: 'أنسجة',
  organ: 'عضو',
  vessel: 'وعاء دموي',
  vessels: 'أوعية دموية',
  membrane: 'غشاء',
  nucleus: 'نواة',
  nuclear: 'نووي',
  cytoplasm: 'سيتوبلازم / هيولى',
  cytoplasmic: 'هيولي / سيتوبلازمي',
  folate: 'الفولات / حمض الفوليك',
  vitamin: 'فيتامين',
  ferritin: 'الفيريتين',
  transferrin: 'الترانسفيرين',
  hemoglobin: 'الهيموغلوبين',
  heme: 'الهيم',
  globin: 'الغلوبين',
  chain: 'سلسلة',
  chains: 'سلاسل',
  mutation: 'طفرة',
  mutations: 'طفرات',
  sickle: 'منجلي',
  crisis: 'أزمة',
  crises: 'أزمات',
  parasite: 'طفيلي',
  parasites: 'طفيليات',
  larva: 'يرقة',
  larvae: 'يرقات',
  egg: 'بيضة',
  eggs: 'بيض',
  cyst: 'كيسة',
  cysts: 'كيسات',
  host: 'عائل / مضيف',
  vector: 'ناقل',
  transmission: 'انتقال العدوى',
  prevention: 'وقاية',
  complication: 'مضاعفة',
  complications: 'مضاعفات',
  failure: 'فشل / قصور',
  loss: 'فقدان',
  lack: 'نقص / غياب',
  reduced: 'منخفض / مختزل',
  increased: 'مرتفع / متزايد',
  decreased: 'منخفض / متناقص',
  elevated: 'مرتفع',
  absent: 'غائب / معدوم',
  present: 'موجود / حاضر',
  positive: 'إيجابي',
  negative: 'سلبي',
  mean: 'متوسط',
  volume: 'حجم',
  rate: 'معدل',
  index: 'مؤشر',
  ratio: 'نسبة',
  range: 'نطاق / مدى',
  stage: 'مرحلة',
  phase: 'طور / مرحلة',
  type: 'نوع / نمط',
  types: 'أنواع / أنماط',
  form: 'شكل / صيغة',
  group: 'مجموعة',
  system: 'جهاز / نظام',
  pathway: 'مسار',
  mechanism: 'آلية',
  function: 'وظيفة',
  response: 'استجابة',
  outcome: 'نتيجة / مآل',
  prognosis: 'إنذار المرض / مآل',
  shortness: 'ضيق / قصر',
  breath: 'نَفَس',
  dizziness: 'دوخة / دوار',
  jaundice: 'يرقان',
  enlarged: 'متضخم',
  enlargement: 'تضخم',
  lesion: 'آفة',
  mass: 'كتلة',
  nodule: 'عقيدة',
  ulcer: 'قرحة',
  rash: 'طفح جلدي',
  edema: 'وذمة',
  shock: 'صدمة',
  stroke: 'سكتة دماغية',
  ischemia: 'نقص تروية',
  infarction: 'احتشاء',
  embolism: 'انصمام',
  thrombosis: 'تخثر / خثار',
  dyspnea: 'ضيق التنفس / زلة تنفسية',
  tachypnea: 'تسرع التنفس',
  tachycardia: 'تسرع القلب',
  bradycardia: 'بطء القلب',
  hypotension: 'انخفاض ضغط الدم',
  hypertension: 'ارتفاع ضغط الدم',
  malaria: 'الملاريا',
  plasmodium: 'المتصورة',
  giardia: 'الجيارديا',
  amebiasis: 'داء الأميبات',
  schistosomiasis: 'البلهارسيا / داء المنشقات',
  leishmaniasis: 'داء الليشمانيات',
  toxoplasmosis: 'داء المقوسات'
};

export function buildEnglishInflectionCandidates(rawWord: string): string[] {
  const lower = rawWord.trim().toLowerCase();
  if (!lower) return [];
  const candidates = new Set<string>([lower]);

  if (lower.includes('-')) {
    candidates.add(lower.replace(/-/g, ' '));
  }
  if (lower.length > 3 && lower.endsWith('s') && !lower.endsWith('ss')) {
    candidates.add(lower.slice(0, -1));
  }
  if (lower.length > 4 && lower.endsWith('es')) {
    candidates.add(lower.slice(0, -2));
  }
  if (lower.length > 4 && lower.endsWith('ies')) {
    candidates.add(`${lower.slice(0, -3)}y`);
  }
  if (lower.length > 4 && lower.endsWith('ves')) {
    candidates.add(`${lower.slice(0, -3)}f`);
    candidates.add(`${lower.slice(0, -3)}fe`);
  }
  if (lower.length > 4 && lower.endsWith('ed')) {
    candidates.add(lower.slice(0, -2));
    candidates.add(lower.slice(0, -1));
  }
  if (lower.length > 5 && lower.endsWith('ied')) {
    candidates.add(`${lower.slice(0, -3)}y`);
  }
  if (lower.length > 5 && lower.endsWith('ing')) {
    const base = lower.slice(0, -3);
    candidates.add(base);
    candidates.add(`${base}e`);
  }
  if (lower.length > 4 && lower.endsWith('ly')) {
    candidates.add(lower.slice(0, -2));
  }
  return Array.from(candidates);
}

/**
 * Extracts inline bilingual translations already present inside topic text, e.g.
 * `Small bowel (الأمعاء الدقيقة)` or `Iron Deficiency — نقص الحديد`.
 */
export function extractInlineBilingualPairsFromText(
  text: string
): Record<string, string> {
  const pairs: Record<string, string> = {};
  if (!text) return pairs;

  const parenRegex = /([A-Za-z][A-Za-z0-9\s/-]{1,48})\s*\(([^)]*[\u0600-\u06FF][^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = parenRegex.exec(text)) !== null) {
    const en = match[1].trim().toLowerCase();
    const ar = match[2].trim();
    if (en.length >= 2 && ar.length >= 2 && !pairs[en]) {
      pairs[en] = ar;
    }
  }
  return pairs;
}

/**
 * Fast, accurate offline lookup for any clicked/double-tapped English word or phrase.
 * Never returns `'مصطلح أحادي الجذر'`.
 */
export function lookupQuickWordOrPhraseAr(
  rawWord: string,
  terms: DictionaryTerm[],
  customAbbreviations: ClinicalAbbreviation[] = [],
  contextClause = '',
  inlineTopicPairs: Record<string, string> = {}
): {
  translationAr: string;
  expansionEn?: string;
  definitionAr?: string;
  matchedTerm?: DictionaryTerm;
} | null {
  const cleaned = rawWord
    .replace(/^[.,;:!?()[\]{}"'«»“”‘’—–-]+|[.,;:!?()[\]{}"'«»“”‘’—–-]+$/g, '')
    .trim();
  if (!cleaned) return null;

  const candidates = buildEnglishInflectionCandidates(cleaned);

  // 1. Dictionary terms + synonyms across inflection variants
  for (const cand of candidates) {
    const matched = terms.find(
      (t) =>
        t.term.toLowerCase() === cand ||
        (t.relations?.synonyms || []).some((syn) => syn.toLowerCase() === cand)
    );
    if (matched) {
      return {
        translationAr: matched.translation,
        definitionAr: matched.definitionAr,
        matchedTerm: matched
      };
    }
  }

  // 2. Inline bilingual pairs from the active topic
  for (const cand of candidates) {
    if (inlineTopicPairs[cand]) {
      return {
        translationAr: inlineTopicPairs[cand],
        definitionAr: `ترجمة مستخرجة مباشرة من سياق الموضوع لـ "${cleaned}".`
      };
    }
  }

  // 3. Clinical abbreviations (including plural abbreviations like RBCs -> RBC)
  const abbrCandidates = [cleaned];
  if (cleaned.length > 2 && cleaned.endsWith('s')) {
    abbrCandidates.push(cleaned.slice(0, -1));
  }
  for (const abbrCand of abbrCandidates) {
    const resolvedAbbr = resolveAbbreviationInContext(
      abbrCand,
      contextClause || cleaned,
      customAbbreviations
    );
    if (resolvedAbbr) {
      return {
        translationAr: resolvedAbbr.translationAr,
        expansionEn: resolvedAbbr.expansionEn,
        definitionAr: `اختصار سريري (${resolvedAbbr.specialty}): ${resolvedAbbr.expansionEn}.`
      };
    }
  }

  // 4. Built-in clinical & general English glossary
  for (const cand of candidates) {
    const gloss = QUICK_CLINICAL_AND_GENERAL_GLOSSARY[cand];
    if (gloss) {
      return {
        translationAr: gloss,
        definitionAr: `معنى طبي/لغوي فوري للمصطلح "${cleaned}".`
      };
    }
  }

  // 5. Structural clinical phrasebook lookup
  for (const cand of candidates) {
    const phraseEntry = CLINICAL_PHRASEBOOK.find(
      (p) => p.en.trim().toLowerCase() === cand
    );
    if (phraseEntry) {
      return {
        translationAr: phraseEntry.ar
      };
    }
  }

  // 6. Morphological decomposition (only if genuine prefix/roots/suffix detected)
  const morph = decomposeMedicalWord(cleaned, terms);
  const hasRealMorph = Boolean(
    morph.prefix || (morph.roots && morph.roots.length > 0) || morph.suffix
  );
  if (
    hasRealMorph &&
    morph.synthesizedAr &&
    morph.synthesizedAr !== 'مصطلح أحادي الجذر'
  ) {
    return {
      translationAr: morph.synthesizedAr
    };
  }

  // 7. Layer 3 structural pass if it actually translates to Arabic
  const structural = applyLayer3PhrasebookAndStructuralNmt(cleaned, terms, [], []).trim();
  if (
    structural &&
    structural.toLowerCase() !== cleaned.toLowerCase() &&
    /[\u0600-\u06FF]/.test(structural)
  ) {
    return {
      translationAr: structural
    };
  }

  return null;
}

