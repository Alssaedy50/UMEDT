import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadMasterMedicalRepository } from './validate-master-data';

// The app repository must not contain academic master data.
// UMEDT-DATA is the sole source; missing master files must resolve to empty collections.
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Academic-data separation test failed: ${message}`);
}

const root = process.cwd();
const masterDir = path.join(root, 'data', 'master');
assert(!fs.existsSync(masterDir), 'UMEDT/data/master must not exist');

const empty = loadMasterMedicalRepository(root);
assert(empty.terms.length === 0, 'terms fallback must be empty');
assert(empty.sentences.length === 0, 'sentences fallback must be empty');
assert(empty.topics.length === 0, 'topics fallback must be empty');
assert(empty.customAffixes.length === 0, 'affixes fallback must be empty');
assert(empty.customAbbreviations.length === 0, 'abbreviations fallback must be empty');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'umedt-data-validation-'));
try {
  const tempMasterDir = path.join(tempRoot, 'data', 'master');
  fs.mkdirSync(tempMasterDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempMasterDir, 'terms.json'),
    JSON.stringify([
      { id: 'term-a', term: 'Alpha-beta' },
      { id: 'term-b', term: 'Alpha beta' }
    ]),
    'utf8'
  );

  let duplicateRejected = false;
  try {
    loadMasterMedicalRepository(tempRoot);
  } catch (error) {
    duplicateRejected =
      error instanceof Error && error.message.includes('duplicate normalized term');
  }
  assert(duplicateRejected, 'punctuation-normalized duplicate terms must be rejected');

  fs.writeFileSync(
    path.join(tempMasterDir, 'terms.json'),
    JSON.stringify([
      { id: 'same-id', term: 'Alpha' },
      { id: 'same-id', term: 'Beta' }
    ]),
    'utf8'
  );

  let duplicateIdRejected = false;
  try {
    loadMasterMedicalRepository(tempRoot);
  } catch (error) {
    duplicateIdRejected = error instanceof Error && error.message.includes('duplicate id');
  }
  assert(duplicateIdRejected, 'duplicate record IDs must be rejected');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('[PASS] No bundled academic master data; external data validation remains active');
