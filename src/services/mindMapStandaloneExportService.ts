import { MindMapDocument, MindMapLayoutResult } from '../types/mindMap';
import { buildStandaloneMindMapSvg } from './mindMapStorageService';

function escapeHtml(value: string): string {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Builds a self-contained interactive HTML map that works offline without UMEDT. */
export function buildStandaloneMindMapHtml(doc: MindMapDocument, layout: MindMapLayoutResult, isDark = false): string {
  const svg = buildStandaloneMindMapSvg(doc, layout, isDark).replace(/^<\?xml[^>]*\?>\s*/, '');
  const payload = JSON.stringify({
    svg,
    nodes: layout.nodes.map((item) => item.node),
    edges: layout.edges.map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId }))
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = escapeHtml(doc.title || 'UMEDT Mind Map');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><title>${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:${isDark?'#0f172a':'#f8fafc'};color:${isDark?'#e2e8f0':'#0f172a'}}
header{padding:12px;background:${isDark?'#111c30':'#fff'};border-bottom:1px solid #94a3b8}h1{font-size:16px;margin:0 0 9px}
.toolbar{display:flex;gap:7px;flex-wrap:wrap}button{border:1px solid #94a3b8;border-radius:9px;padding:8px 11px;min-height:36px;font-weight:700;background:${isDark?'#1e293b':'#fff'};color:inherit}
#viewport{height:calc(100dvh - 105px);min-height:300px;overflow:hidden;position:relative;touch-action:none;cursor:grab}
#stage{position:absolute;top:0;left:0;transform-origin:0 0}#stage svg{display:block;max-width:none;overflow:visible}
.mm-node{cursor:pointer}.mm-node.selected rect{stroke:#10b981!important;stroke-width:4!important}
#details{display:none;position:fixed;bottom:10px;left:10px;right:10px;padding:10px;border-radius:12px;background:${isDark?'#172338':'#fff'};box-shadow:0 4px 24px #0003;z-index:5}
</style></head><body>
<header><h1>${title}</h1><div class="toolbar">
<button id="out">− Zoom</button><button id="in">+ Zoom</button><button id="fit">Center</button>
<button id="expand">Expand all</button><button id="collapse">Collapse all</button><button id="full">Fullscreen</button>
</div></header>
<main id="viewport"><div id="stage"></div></main><aside id="details"><b id="nodeTitle"></b><div id="nodeNote"></div></aside>
<script type="application/json" id="map-data">${payload}</script>
<script>
(function(){
var data=JSON.parse(document.getElementById('map-data').textContent),view=document.getElementById('viewport'),stage=document.getElementById('stage');
stage.innerHTML=data.svg;var svg=stage.querySelector('svg'),els=[].slice.call(svg.querySelectorAll('.mm-node')),edgeEls=[].slice.call(svg.querySelectorAll('.mm-edge'));
var nodes=new Map(),children=new Map(),collapsed=new Set(),hidden=new Set(),scale=1,x=0,y=0,drag=null,selected=null;
data.nodes.forEach(function(n,i){var el=els[i];if(!el)return;nodes.set(n.id,{data:n,el:el});if(n.parentId){if(!children.has(n.parentId))children.set(n.parentId,[]);children.get(n.parentId).push(n.id);}
el.setAttribute('tabindex','0');el.setAttribute('role','button');el.addEventListener('click',function(){if(selected)nodes.get(selected).el.classList.remove('selected');selected=n.id;el.classList.add('selected');document.getElementById('nodeTitle').textContent=n.label||'';document.getElementById('nodeNote').textContent=n.note||n.sublabel||'';document.getElementById('details').style.display='block';});
el.addEventListener('dblclick',function(){if(!children.has(n.id))return;if(collapsed.has(n.id))collapsed.delete(n.id);else collapsed.add(n.id);refresh();});});
data.edges.forEach(function(e,i){if(edgeEls[i]){edgeEls[i].dataset.from=e.sourceId;edgeEls[i].dataset.to=e.targetId;}});
function descendants(id){(children.get(id)||[]).forEach(function(c){if(hidden.has(c))return;hidden.add(c);descendants(c);});}
function refresh(){hidden.clear();collapsed.forEach(descendants);nodes.forEach(function(v,id){v.el.style.display=hidden.has(id)?'none':'';});edgeEls.forEach(function(el){el.style.display=hidden.has(el.dataset.from)||hidden.has(el.dataset.to)?'none':'';});}
function transform(){stage.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';}
function fit(){var a=(svg.getAttribute('viewBox')||'0 0 800 600').split(/[ ,]+/).map(Number),w=a[2]||800,h=a[3]||600;scale=Math.max(.2,Math.min(1.5,Math.min(view.clientWidth/w,view.clientHeight/h)*.9));x=(view.clientWidth-w*scale)/2-a[0]*scale;y=(view.clientHeight-h*scale)/2-a[1]*scale;transform();}
document.getElementById('in').onclick=function(){scale=Math.min(3,scale*1.15);transform();};document.getElementById('out').onclick=function(){scale=Math.max(.2,scale/1.15);transform();};document.getElementById('fit').onclick=fit;
document.getElementById('expand').onclick=function(){collapsed.clear();refresh();};document.getElementById('collapse').onclick=function(){children.forEach(function(v,k){if(v.length)collapsed.add(k);});refresh();};
document.getElementById('full').onclick=function(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();};
view.addEventListener('pointerdown',function(e){if(e.target.closest&&e.target.closest('.mm-node'))return;drag={x:e.clientX,y:e.clientY,ox:x,oy:y};if(view.setPointerCapture)view.setPointerCapture(e.pointerId);});
view.addEventListener('pointermove',function(e){if(!drag)return;x=drag.ox+e.clientX-drag.x;y=drag.oy+e.clientY-drag.y;transform();});
function stop(){drag=null;}view.addEventListener('pointerup',stop);view.addEventListener('pointercancel',stop);
view.addEventListener('wheel',function(e){e.preventDefault();scale=Math.max(.2,Math.min(3,scale*(e.deltaY<0?1.1:.9)));transform();},{passive:false});
window.addEventListener('resize',fit);refresh();setTimeout(fit,40);
})();
</script></body></html>`;
