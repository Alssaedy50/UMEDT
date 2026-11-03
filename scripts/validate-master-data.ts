import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  INITIAL_TERMS,
  INITIAL_LINKED_SENTENCES,
  MORPHOLOGICAL_AFFIXES,
  CLINICAL_ABBREVIATIONS
} from '../src/data/medicalLexiconData';
import { INITIAL_TOPICS } from '../src/data/topicsSeedData';
import type {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  MorphologicalAffix,
  ClinicalAbbreviation
} from '../src/types/lexicon';

export interface MasterMedicalRepository {
  terms: DictionaryTerm[];
  sentences: LinkedSentence[];
  topics: TopicArticle[];
  customAffixes: MorphologicalAffix[];
  customAbbreviations: ClinicalAbbreviation[];
}

type MasterFileName =
  | 'terms.json'
  | 'sentences.json'
  | 'topics.json'
  | 'custom-affixes.json'
  | 'custom-abbreviations.json';

function readArray<T>(root: string, fileName: MasterFileName, fallback: T[]): T[] {
  const filePath = path.join(root, 'data', 'master', fileName);
  if (!fs.existsSync(filePath)) return [...fallback];

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in data/master/${fileName}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`data/master/${fileName} must contain a JSON array.`);
  }
  return parsed as T[];
}

function assertUniqueIds<T extends { id?: unknown }>(records: T[], label: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id.trim()) {
      throw new Error(`${label}: every record must have a non-empty string id.`);
    }
    const id = record.id.trim();
    if (seen.has(id)) throw new Error(`${label}: duplicate id "${id}".`);
    seen.add(id);
  }
}

function normalizeTerm(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, ' ')
    .trim();
}

export function loadMasterMedicalRepository(rootDir = process.cwd()): MasterMedicalRepository {
  const terms = readArray<DictionaryTerm>(rootDir, 'terms.json', INITIAL_TERMS);
  const sentences = readArray<LinkedSentence>(rootDir, 'sentences.json', INITIAL_LINKED_SENTENCES);
  const topics = readArray<TopicArticle>(rootDir, 'topics.json', INITIAL_TOPICS);
  const customAffixes = readArray<MorphologicalAffix>(rootDir, 'custom-affixes.json', MORPHOLOGICAL_AFFIXES);
  const customAbbreviations = readArray<ClinicalAbbreviation>(rootDir, 'custom-abbreviations.json', CLINICAL_ABBREVIATIONS);

  assertUniqueIds(terms, 'terms');
  assertUniqueIds(sentences, 'sentences');
  assertUniqueIds(topics, 'topics');
  assertUniqueIds(customAffixes, 'custom-affixes');
  assertUniqueIds(customAbbreviations, 'custom-abbreviations');

  const termKeys = new Set<string>();
  for (const term of terms) {
    if (!term || typeof term.term !== 'string' || !term.term.trim()) {
      throw new Error('terms: every record must have a non-empty term.');
    }
    const key = normalizeTerm(term.term);
    if (!key) throw new Error(`terms: invalid normalized term for "${term.term}".`);
    if (termKeys.has(key)) throw new Error(`terms: duplicate normalized term "${term.term}".`);
    termKeys.add(key);
  }

  return { terms, sentences, topics, customAffixes, customAbbreviations };
}
