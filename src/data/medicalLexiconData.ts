import {
  TermExample,
  TermMorphology,
  SpacedRepetitionData,
  LexiconCategory,
  DictionaryTerm,
  SentenceSourceType,
  LinkedSentence,
  AmbiguousCandidate,
  AbbreviationCategory,
  ClinicalAbbreviation,
  MorphologicalAffix,
  ClinicalBenchmarkCase
} from '../types/lexicon';

export type {
  TermExample,
  TermMorphology,
  SpacedRepetitionData,
  LexiconCategory,
  DictionaryTerm,
  SentenceSourceType,
  LinkedSentence,
  AmbiguousCandidate,
  AbbreviationCategory,
  ClinicalAbbreviation,
  MorphologicalAffix,
  ClinicalBenchmarkCase
};

// The installable application intentionally ships without a medical content database.
// UMEDT-DATA is the only bundled-content source; user-created content remains local.
export const INITIAL_TERMS: DictionaryTerm[] = [];
export const INITIAL_LINKED_SENTENCES: LinkedSentence[] = [];
export const MORPHOLOGICAL_AFFIXES: MorphologicalAffix[] = [];
export const CLINICAL_ABBREVIATIONS: ClinicalAbbreviation[] = [];
export const EXTRA_LINKABLE_ALIASES: string[] = [];
