import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadMasterMedicalRepository } from './validate-master-data';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Master-data validation test failed: ${message}`);
}

const bundled = loadMasterMedicalRepository(process.cwd());
assert(bundled.terms.length > 0, 'missing master files must fall back to bundled terms');
assert(bundled.sentences.length > 0, 'missing sentence file must fall back to bundled sentences');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'umedt-master-data-'));
try {
  const masterDir = path.join(tempRoot, 'data', 'master');
  fs.mkdirSync(masterDir, { recursive: true });
  fs.writeFileSync(
    path.join(masterDir, 'terms.json'),
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
    path.join(masterDir, 'terms.json'),
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

console.log('[PASS] Master medical data fallback, normalized duplicate, and ID validation');
