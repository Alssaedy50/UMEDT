import { createBlankMindMap, buildStandaloneMindMapSvg } from '../src/services/mindMapStorageService';
import { computeMindMapLayout } from '../src/services/mindMapLayoutEngine';
import { buildStandaloneMindMapHtmlV2 as buildStandaloneMindMapHtml } from '../src/services/mindMapStandaloneExportServiceV2';
function assert(ok: boolean, message: string): void { if (!ok) throw new Error('MIND MAP EXPORT TEST FAILED: ' + message); }
const map=createBlankMindMap({title:'Atherosclerosis',style:'medical_flow'});
map.nodes[1].note='Endothelial injury and lipid accumulation';
const layout=computeMindMapLayout(map),svg=buildStandaloneMindMapSvg(map,layout),html=buildStandaloneMindMapHtml(map,layout);
assert(svg.includes('class="mm-node"') && svg.includes('data-node-id='),'SVG node groups must be addressable and selectable.');
assert(svg.includes('class="mm-edge"')||layout.edges.length===0,'SVG relationship groups must be addressable.');
assert(html.startsWith('<!doctype html>'),'Complete HTML document required.');
assert(html.includes('Atherosclerosis')&&html.includes('Endothelial injury and lipid accumulation'),'Map content must be preserved.');
assert(html.includes('id="fit"')&&html.includes('id="expand"')&&html.includes('id="collapse"'),'Map navigation controls required.');
assert(html.includes('pointermove')&&html.includes('pointerdown')&&html.includes("type:'pinch'"),'Touch pan and two-finger pinch zoom required.');
assert(html.includes('touch-action:none') && html.includes('100dvh'),'Full-screen touch-first layout required.');
assert(!html.includes('id="in"') && !html.includes('id="out"'),'Viewer must not require zoom buttons.');
assert(!/<script\\s+src=/i.test(html) && !/<link[^>]+href=[\"']https?:/i.test(html), 'No external dependencies are allowed.');
const unsafe=createBlankMindMap({title:'<script>alert(1)</script>'});
const safe=buildStandaloneMindMapHtml(unsafe,computeMindMapLayout(unsafe));
assert(!safe.includes('<script>alert(1)</script>'),'User title must be escaped.');
assert(safe.includes('application/json'),'Map data must be embedded as inert JSON.');

const largeMap=createBlankMindMap({title:'Mobile hierarchy',style:'hierarchical'});
const rootId=largeMap.rootNodeId;
const foldedBranchIds=new Set<string>();
for(let branch=0;branch<12;branch++){
  const branchId=`branch-${branch}`;
  foldedBranchIds.add(branchId);
  largeMap.nodes.push({id:branchId,label:`Branch ${branch+1}`,parentId:rootId,role:'concept',order:branch});
  for(let leaf=0;leaf<3;leaf++){
    largeMap.nodes.push({id:`leaf-${branch}-${leaf}`,label:`Detail ${branch+1}.${leaf+1}`,parentId:branchId,role:'mechanism',order:leaf});
  }
}
const mobileOverview=computeMindMapLayout(largeMap,foldedBranchIds);
const firstLevelIds=largeMap.nodes.filter((node)=>node.parentId===rootId).map((node)=>node.id);
assert(mobileOverview.nodes.length===firstLevelIds.length+1,'Mobile overview must show exactly the root and all first-level branches without flooding the viewport with deeper descendants.');
assert(mobileOverview.nodes.some((node)=>node.node.id===rootId),'Mobile overview must keep the root concept visible.');
assert(firstLevelIds.every((id)=>mobileOverview.nodes.some((node)=>node.node.id===id)),'Every first-level branch must remain visible in the mobile overview.');
assert(!mobileOverview.nodes.some((node)=>node.node.id==='leaf-0-0'),'Deeper descendants must stay folded until their branch is opened.');

console.log('[PASS] Standalone Mind Map HTML export and offline interaction.');
