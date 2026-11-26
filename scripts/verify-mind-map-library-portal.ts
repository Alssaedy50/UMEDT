import fs from 'node:fs';
import path from 'node:path';
import { parseMindMapInput, MIND_MAP_AI_PROMPTS } from '../src/services/mindMapImportService';
import { computeMindMapLayout } from '../src/services/mindMapLayoutEngine';
import { buildStandaloneMindMapSvg } from '../src/services/mindMapStorageService';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error('MIND MAP LIBRARY TEST FAILED: ' + message);
}

const canonicalPrompt = MIND_MAP_AI_PROMPTS.json;
const schemaStart = canonicalPrompt.indexOf('{', canonicalPrompt.indexOf('المخطط الإلزامي:'));
const schemaEnd = canonicalPrompt.indexOf('\n\nقواعد صحة البيانات:', schemaStart);
assert(schemaStart >= 0 && schemaEnd > schemaStart, 'Canonical prompt must contain one JSON schema example.');
const schema = JSON.parse(canonicalPrompt.slice(schemaStart, schemaEnd));
const schemaIds = new Set<string>(schema.nodes.map((node: { id: string }) => node.id));
assert(schema.nodes.filter((node: { parentId: string | null }) => node.parentId === null).length === 1, 'Canonical schema must contain exactly one root.');
assert(schema.nodes.every((node: { parentId: string | null }) => node.parentId === null || schemaIds.has(node.parentId)), 'Canonical schema parent references must resolve.');
assert(schema.edges.every((edge: { sourceId: string; targetId: string }) => schemaIds.has(edge.sourceId) && schemaIds.has(edge.targetId)), 'Canonical schema edge references must resolve.');
const longExplanation = Array.from({ length: 120 }, (_, i) => `Paragraph ${i + 1}: detailed medical explanation.`).join('\\n\\n');
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
assert(Boolean(doc.nodes[1].note) && doc.nodes[1].note!.length > 3000 && doc.nodes[1].note!.startsWith('Paragraph 1: detailed medical explanation.') && doc.nodes[1].note!.includes('\\n\\n'), 'Long node explanation must be preserved without truncation.');
assert(doc.nodes[0].shape === 'pill' && doc.nodes[0].color === '#0f766e', 'Root shape and color must be preserved.');
assert(doc.nodes[1].shape === 'diamond' && doc.nodes[1].color === '#2563eb', 'Child shape and color must be preserved.');
const svg = buildStandaloneMindMapSvg(doc, computeMindMapLayout(doc));
assert(svg.includes('<polygon') && svg.includes('fill="#2563eb"'), 'Custom shape and color must render in SVG.');
const portalPath = path.join(process.cwd(), 'src/components/LibraryMindMapsPortal.tsx');
const portal = fs.readFileSync(portalPath, 'utf8');
assert(portal.includes('السابق') && portal.includes('التالي'), 'Sequential previous/next controls must exist.');
assert(portal.includes('textarea') && portal.includes('نص غير محدود'), 'Unlimited explanation editor must exist.');
assert(portal.includes('buildStandaloneMindMapHtmlV2'), 'Standalone HTML sharing must be wired.');
assert(portal.includes('MindMapFullScreenViewer') && portal.includes('عرض الرسم الكامل'), 'Full graph viewer must be accessible from the Library portal.');
assert(portal.includes('MIND_MAP_AI_PROMPTS') && portal.includes('const PROMPT = MIND_MAP_AI_PROMPTS.json;'), 'Library portal must use the shared canonical prompt.');
console.log('[PASS] Library mind map import, unlimited node notes, sequential navigation, styling and sharing.');
