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
assert(html.includes('class="tools-menu"')&&html.includes('class="tools-content"'),'Standalone viewer controls must be grouped in a responsive dropdown.');
assert(html.includes('toolsMenu.open=false'),'Standalone tools menu must close after selecting an action.');
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

// Routed edge regression coverage: hierarchy ports must sit outside card borders,
// while cross-branch links must use an external three-segment lane with an unclipped label.
const routedMap=createBlankMindMap({title:'Edge routing regression',style:'medical_flow'});
const routedRoot=routedMap.nodes.find((node)=>node.id===routedMap.rootNodeId)!;
routedMap.nodes=[
  routedRoot,
  {id:'route-source',label:'Source concept',parentId:routedRoot.id,role:'concept',order:0},
  {id:'route-target',label:'Target concept',parentId:routedRoot.id,role:'diagnosis',order:1},
  {id:'route-intermediate',label:'Intermediate concept',parentId:routedRoot.id,role:'mechanism',order:2}
];
routedMap.edges=[{id:'cross-sibling',sourceId:'route-source',targetId:'route-target',label:'causes',directed:true}];
const routedLayout=computeMindMapLayout(routedMap);
const rootPosition=routedLayout.nodes.find((node)=>node.node.id===routedRoot.id)!;
const sourcePosition=routedLayout.nodes.find((node)=>node.node.id==='route-source')!;
const hierarchyEdge=routedLayout.edges.find((edge)=>edge.sourceId===routedRoot.id&&edge.targetId==='route-source')!;
const hierarchyStart=hierarchyEdge.path.match(/^M\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/);
const hierarchyEnd=hierarchyEdge.path.match(/(-?[\\d.]+)\\s+(-?[\\d.]+)$/);
assert(Boolean(hierarchyStart&&hierarchyEnd),'Hierarchy connectors must expose explicit SVG boundary ports.');
assert(Math.abs(Number(hierarchyStart![1])-(rootPosition.x+rootPosition.width/2+5))<1,'Hierarchy source port must sit 5px outside the source card.');
assert(Math.abs(Number(hierarchyEnd![1])-(sourcePosition.x-sourcePosition.width/2-5))<1,'Hierarchy target port must sit 5px outside the target card.');
const crossEdge=routedLayout.edges.find((edge)=>edge.id==='cross-sibling')!;
assert((crossEdge.path.match(/ C /g)||[]).length===3,'Cross-branch links must use three smooth external-lane Bezier segments.');
const cardMinY=Math.min(...routedLayout.nodes.map((node)=>node.y-node.height/2));
const cardMaxY=Math.max(...routedLayout.nodes.map((node)=>node.y+node.height/2));
assert(crossEdge.labelY<cardMinY-40||crossEdge.labelY>cardMaxY+40,'Cross-branch label must sit in the external gutter midpoint.');
const cardMaxX=Math.max(...routedLayout.nodes.map((node)=>node.x+node.width/2));
const cardMinX=Math.min(...routedLayout.nodes.map((node)=>node.x-node.width/2));
assert(routedLayout.bounds.maxX>cardMaxX+100||routedLayout.bounds.minX<cardMinX-100,'SVG bounds must include the external cross-link lane.');
const routedSvg=buildStandaloneMindMapSvg(routedMap,routedLayout);
assert(routedSvg.includes('data-layer="base"')&&routedSvg.includes('data-layer="active-overlay"'),'SVG must expose base and active overlay edge layers.');
assert(routedSvg.includes('refX="9"'),'Arrow marker tip must align with the external target port.');

console.log('[PASS] Standalone Mind Map HTML export and offline interaction.');
