import fs from 'node:fs';
import path from 'node:path';
import { parseMindMapInput } from '../src/services/mindMapImportService';
import { computeMindMapLayout } from '../src/services/mindMapLayoutEngine';
import { buildStandaloneMindMapSvg } from '../src/services/mindMapStorageService';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('MIND MAP LIBRARY TEST FAILED: ' + message);
}

const longExplanation = 'Detailed medical explanation. '.repeat(120);
const parsed = parseMindMapInput(JSON.stringify({
  title: 'Hypertension',
  style: 'hierarchical',
  nodes: [
    { id: 'root', label: 'Hypertension', parentId: null, role: 'root', shape: 'pill', color: '#0f766e' },
    { id: 'n1', label: 'Pathophysiology', parentId: 'root', role: 'mechanism', shape: 'diamond', color: '#2563eb', note: longExplanation }
  ],
  edges: [{ id: 'e1', sourceId: 'root', targetId: 'n1', label: 'causes' }]
}));
assert(parsed.success && Boolean(parsed.document), 'JSON map should be recognized.');
const doc = parsed.document!;
assert(doc.nodes[1].note === longExplanation, 'Long node explanation must be preserved without truncation.');
assert(doc.nodes[0].shape === 'pill' && doc.nodes[0].color === '#0f766e', 'Root shape and color must be preserved.');
assert(doc.nodes[1].shape === 'diamond' && doc.nodes[1].color === '#2563eb', 'Child shape and color must be preserved.');
const svg = buildStandaloneMindMapSvg(doc, computeMindMapLayout(doc));
assert(svg.includes('<polygon') && svg.includes('fill="#2563eb"'), 'Custom shape and color must render in SVG.');
const portalPath = path.join(process.cwd(), 'src/components/LibraryMindMapsPortal.tsx');
const portal = fs.readFileSync(portalPath, 'utf8');
assert(portal.includes('السابق') && portal.includes('التالي'), 'Sequential previous/next controls must exist.');
assert(portal.includes('textarea') && portal.includes('نص غير محدود'), 'Unlimited explanation editor must exist.');
assert(portal.includes('buildStandaloneMindMapHtmlV2'), 'Standalone HTML sharing must be wired.');
assert(portal.includes('MIND_MAP_AI_PROMPTS') && portal.includes('JSON'), 'Import and prompt instructions must be included.');
console.log('[PASS] Library mind map import, unlimited node notes, sequential navigation, styling and sharing.');
