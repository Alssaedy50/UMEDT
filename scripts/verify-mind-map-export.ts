import { createBlankMindMap, buildStandaloneMindMapSvg } from '../src/services/mindMapStorageService';
import { computeMindMapLayout } from '../src/services/mindMapLayoutEngine';
import { buildStandaloneMindMapHtml } from '../src/services/mindMapStandaloneExportService';
function assert(ok: boolean, message: string): void { if (!ok) throw new Error('MIND MAP EXPORT TEST FAILED: ' + message); }
const map=createBlankMindMap({title:'Atherosclerosis',style:'medical_flow'});
map.nodes[1].note='Endothelial injury and lipid accumulation';
const layout=computeMindMapLayout(map),svg=buildStandaloneMindMapSvg(map,layout),html=buildStandaloneMindMapHtml(map,layout);
assert(svg.includes('class="mm-node"'),'SVG node groups must be addressable.');
assert(svg.includes('class="mm-edge"')||layout.edges.length===0,'SVG relationship groups must be addressable.');
assert(html.startsWith('<!doctype html>'),'Complete HTML document required.');
assert(html.includes('Atherosclerosis')&&html.includes('Endothelial injury and lipid accumulation'),'Map content must be preserved.');
assert(html.includes('id="in"')&&html.includes('id="out"')&&html.includes('id="expand"')&&html.includes('id="collapse"'),'Interactive controls required.');
assert(html.includes('pointermove')&&html.includes('pointerdown'),'Touch/mouse pan required.');
assert(!html.includes('<script src=') && !html.includes('https://') && !html.includes('http://'), 'No external dependencies are allowed.');
const unsafe=createBlankMindMap({title:'<script>alert(1)</script>'});
const safe=buildStandaloneMindMapHtml(unsafe,computeMindMapLayout(unsafe));
assert(!safe.includes('<script>alert(1)</script>'),'User title must be escaped.');
assert(safe.includes('application/json'),'Map data must be embedded as inert JSON.');
console.log('[PASS] Standalone Mind Map HTML export and offline interaction.');
