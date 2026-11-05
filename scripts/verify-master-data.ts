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
assert(bundled.topics.length > 0, 'missing topic file must fall back to bundled topics');
assert(bundled.customAffixes.length > 0, 'missing affix file must fall back to bundled affixes');
assert(bundled.customAbbreviations.length > 0, 'missing abbreviation file must fall back to bundled abbreviations');

const parasitologyIds = [
  'pt-parasito-01-foundations',
  'pt-parasito-02-nematodes-intestinal',
  'pt-parasito-03-nematodes-filaria',
  'pt-parasito-04-cestodes',
  'pt-parasito-05-trematodes',
  'pt-parasito-06-practical-spotter',
  'pt-parasito-07-one-day-plan',
  'pt-parasito-08-mcq-viva'
];
for (const id of parasitologyIds) {
  assert(bundled.topics.some((topic) => topic.id === id), `missing Parasitology course topic: ${id}`);
}
const parasitology = bundled.topics.filter((topic) => parasitologyIds.includes(topic.id));
assert(parasitology.reduce((n, topic) => n + topic.images.length, 0) >= 20, 'Parasitology course must include at least 20 learning images/diagrams');
assert(parasitology.reduce((n, topic) => n + topic.links.length, 0) >= 25, 'Parasitology course must include external reference and 3D model links');
const mcqTopic = bundled.topics.find((topic) => topic.id === 'pt-parasito-08-mcq-viva');
assert(Boolean(mcqTopic?.sections.some((section) => section.paragraphs.some((p) => p.startsWith('Q22.')))), 'MCQ topic must contain the full 22-question bank');


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
