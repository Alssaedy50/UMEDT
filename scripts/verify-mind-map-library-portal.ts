import fs from 'node:fs';
import path from 'node:path';
import { parseMindMapInput, MIND_MAP_AI_PROMPTS, buildMindMapGenerationPrompt } from '../src/services/mindMapImportService';
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
const canonicalParsed = parseMindMapInput(JSON.stringify(schema));
assert(canonicalParsed.success && canonicalParsed.document?.nodes.length === schema.nodes.length, 'Canonical prompt JSON must be fully readable by the UMEDT importer.');
assert(canonicalParsed.document?.edges.length === schema.edges.length, 'Canonical prompt relationships must survive importer parsing.');
const configuredTextPrompt = buildMindMapGenerationPrompt({ topic: 'Atherosclerosis', nodeCount: 32, style: 'hierarchical', outputFormat: 'text' });
assert(configuredTextPrompt.includes('Atherosclerosis') && configuredTextPrompt.includes('32 عقدة') && configuredTextPrompt.includes('"style": "hierarchical"'), 'Configured prompt must include topic, requested node count, and selected layout.');
const configuredFilePrompt = buildMindMapGenerationPrompt({ topic: 'Myocardial Infarction', nodeCount: 18, style: 'medical_flow', outputFormat: 'file' });
assert(configuredFilePrompt.includes('medical-mind-map.json') && configuredFilePrompt.includes('Myocardial Infarction') && configuredFilePrompt.includes('"style": "medical_flow"'), 'File prompt must request a downloadable JSON file with the selected topic and layout.');
const optionalCountPrompt = buildMindMapGenerationPrompt({ topic: 'Heart Failure', style: 'hierarchical', outputFormat: 'text' });
assert(optionalCountPrompt.includes('Heart Failure') && optionalCountPrompt.includes('لا يوجد عدد محدد للعقد') && !optionalCountPrompt.includes('العدد المستهدف:'), 'Node count must remain optional when omitted.');

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

const collisionDoc = {
  ...doc,
  style: 'hierarchical' as const,
  nodes: [
    { id: 'root', label: 'Root', parentId: null, role: 'root' as const },
    { id: 'a', label: 'Branch A', parentId: 'root', role: 'concept' as const, position: { x: 0, y: 0 } },
    { id: 'b', label: 'Branch B', parentId: 'root', role: 'concept' as const, position: { x: 0, y: 0 } },
    { id: 'a1', label: 'Child A1', parentId: 'a', role: 'mechanism' as const, position: { x: 0, y: 0 } },
    { id: 'b1', label: 'Child B1', parentId: 'b', role: 'mechanism' as const, position: { x: 0, y: 0 } }
  ],
  edges: []
};
const collisionLayout = computeMindMapLayout(collisionDoc);
for (let i = 0; i < collisionLayout.nodes.length; i++) {
  for (let j = i + 1; j < collisionLayout.nodes.length; j++) {
    const a = collisionLayout.nodes[i];
    const b = collisionLayout.nodes[j];
    const overlapX = Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 16;
    const overlapY = Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 16;
    assert(!(overlapX && overlapY), 'Visible node cards must not overlap after layout collision resolution.');
  }
}
const parentAwareSvg = buildStandaloneMindMapSvg(collisionDoc, collisionLayout);
assert(parentAwareSvg.includes('↳ Root') || parentAwareSvg.includes('↳ Branch'), 'Child cards must display their parent label.');

const studioPath = path.join(process.cwd(), 'src/components/MindMapStudioModal.tsx');
const studio = fs.readFileSync(studioPath, 'utf8');
assert(studio.includes("useState<'list' | 'create' | 'import' | 'canvas'>('list')"), 'The dedicated mind-map page must open on its central list.');
assert(studio.includes('sortMode') && studio.includes('localeCompare') && studio.includes("sortMode === 'created'"), 'Mind maps must be sortable by name and timestamps.');
assert(studio.includes('CalendarClock') && studio.includes('Clock3'), 'Map cards must show creation and last-update timestamps.');
assert(studio.includes('إنشاء يدوي') && studio.includes('استيراد خريطة'), 'The compact add menu must expose only manual creation and import.');
assert(studio.includes('creationTopicId') && studio.includes('importLinkedTopicId'), 'Manual creation and import must independently support topic linking.');
assert(studio.includes('InteractiveMindMapCanvas') && studio.includes('نمط التخطيط'), 'Manual maps must open in the interactive editor with layout settings.');
assert(studio.includes('حفظ الخريطة') && studio.includes('handleSaveActiveMap'), 'The active mind-map editor must expose an explicit save action.');
assert(studio.includes("useState('')") && !studio.includes('fallbackOnBlur={24}'), 'The AI node-count field must be optional and stay empty when cleared.');
assert(studio.includes('parseMindMapInput') && studio.includes('رفع ملف'), 'The dedicated import page must parse pasted content and uploaded files.');
const libraryPath = path.join(process.cwd(), 'src/components/LibraryView.tsx');
const library = fs.readFileSync(libraryPath, 'utf8');
assert(!library.includes('LibraryMindMapsPortal') && !library.includes('setIsMindMapsPortalOpen'), 'Library must not expose a separate mind-map manager.');
assert(library.includes('mindMapCount') && library.includes('إجمالي الخرائط المحفوظة'), 'Library may show only the mind-map count summary.');
assert(!fs.existsSync(path.join(process.cwd(), 'src/components/LibraryMindMapsPortal.tsx')), 'Legacy duplicate Library mind-map portal must be removed.');
const clipboardPath = path.join(process.cwd(), 'android/app/src/main/java/org/umed2/dictengine/UMEDTClipboardMonitorService.java');
const clipboardService = fs.readFileSync(clipboardPath, 'utf8');
assert(clipboardService.includes('getRecentSelectedText(5000L)') && clipboardService.includes('isSingleWordLookup(selectedWord)'), 'Confirmed copy events must fall back to the fresh single-word selection when Android blocks clipboard reads.');
console.log('[PASS] Central mind-map manager, optional node count, explicit save, and copy-triggered translation fallback.');
