import { MindMapDocument, MindMapLayoutResult } from '../types/mindMap';
import { buildStandaloneMindMapSvg } from './mindMapStorageService';

function escapeHtml(value: string): string {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A self-contained, offline-first, touch-friendly full-screen map document. */
export function buildStandaloneMindMapHtmlV2(
  doc: MindMapDocument,
  layout: MindMapLayoutResult,
  isDark = false
): string {
  const svg = buildStandaloneMindMapSvg(doc, layout, isDark).replace(/^<\?xml[^>]*>\s*/, '');
  const svg = buildStandaloneMindMapSvg(doc, layout, isDark).replace(/^<\?xml[^>]*>\s*/, '');
  const payload = safeJson({
    svg,
    title: doc.title || 'UMEDT Mind Map',
    nodes: layout.nodes.map((item) => item.node)
  });
  const title = escapeHtml(doc.title || 'UMEDT Mind Map');
  const background = isDark ? '#07111f' : '#eef4f7';
  const foreground = isDark ? '#e5edf7' : '#102033';
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${isDark ? '#07111f' : '#102033'}">
<title>${title}</title>
<style>
:root{color-scheme:${isDark ? 'dark' : 'light'};--bg:${background};--fg:${foreground};--panel:${isDark ? 'rgba(13,27,45,.86)' : 'rgba(255,255,255,.86)'};--line:${isDark ? 'rgba(148,163,184,.18)' : 'rgba(15,35,55,.12)'};--muted:${isDark ? '#9fb0c5' : '#5d7084'};--accent:#10b981}
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden}
body{font-family:system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:radial-gradient(ellipse at 50% -15%,${isDark ? '#123c43' : '#d8f4e9'} 0,transparent 48%),var(--bg);color:var(--fg)}
button{font:inherit;color:inherit;cursor:pointer}
.app{height:100dvh;min-height:100%;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
.topbar{position:relative;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:var(--panel);border-bottom:1px solid var(--line);backdrop-filter:blur(18px)}
.brand{min-width:0}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.16em;color:var(--accent);text-transform:uppercase}.title{font-size:clamp(14px,2vw,18px);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.actions{display:flex;gap:7px;align-items:center;flex-shrink:0}.action{min-height:38px;padding:0 12px;border:1px solid var(--line);border-radius:12px;background:${isDark ? 'rgba(255,255,255,.06)' : '#fff'};font-size:11px;font-weight:800;box-shadow:0 4px 16px rgba(0,0,0,.05)}.action.primary{background:#10b981;color:#06251d;border-color:#10b981}.action.icon{width:38px;padding:0;display:grid;place-items:center;font-size:16px}
.viewport{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;overscroll-behavior:contain;cursor:grab;background-image:radial-gradient(circle,${isDark ? 'rgba(148,163,184,.13)' : 'rgba(71,96,118,.14)'} 1px,transparent 1px);background-size:26px 26px}
.viewport:active{cursor:grabbing}.stage{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}.stage svg{display:block;max-width:none;overflow:visible}
.mm-node{cursor:pointer;outline:none}.mm-node:focus rect,.mm-node.selected rect{stroke:#10b981!important;stroke-width:4!important;filter:drop-shadow(0 4px 10px rgba(16,185,129,.25))}
.details{position:absolute;z-index:3;bottom:18px;left:50%;transform:translateX(-50%);width:min(680px,calc(100% - 28px));padding:13px 16px;border:1px solid var(--line);border-radius:18px;background:var(--panel);backdrop-filter:blur(20px);box-shadow:0 14px 48px rgba(0,0,0,.18);display:none}
.details strong{display:block;font-size:14px;color:var(--accent)}.details p{margin:5px 0 0;font-size:12px;line-height:1.8;color:var(--fg);white-space:pre-wrap}
.hint{position:absolute;z-index:2;bottom:16px;right:16px;padding:7px 11px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:10px;font-weight:700;color:var(--muted);pointer-events:none;backdrop-filter:blur(12px)}
@media(max-width:600px){.topbar{padding:9px 10px}.actions{gap:5px}.action{min-height:36px;padding:0 9px}.action.icon{width:36px}.eyebrow{display:none}.title{font-size:13px}.hint{bottom:10px;right:10px}.details{bottom:48px}}
@media(prefers-reduced-motion:no-preference){.action{transition:transform .16s ease,background .16s ease}.action:active{transform:scale(.97)}}
</style>
</head>
<body>
<div class="app">
<header class="topbar">
  <div class="brand"><div class="eyebrow">UMEDT · INTERACTIVE MIND MAP</div><div class="title">${title}</div></div>
  <div class="actions">
    <button class="action" id="fit" type="button">ملاءمة</button>
    <button class="action" id="expand" type="button">توسيع الكل</button>
    <button class="action" id="collapse" type="button">طي الفروع</button>
    <button class="action icon" id="fullscreen" type="button" aria-label="ملء الشاشة" title="ملء الشاشة">⛶</button>
  </div>
</header>
<main class="viewport" id="viewport">
  <div class="stage" id="stage"></div>
  <aside class="details" id="details"><strong id="node-title"></strong><p id="node-note"></p></aside>
  <div class="hint">اسحب للتحريك · إصبعان للتكبير والتصغير · انقر مرتين لطي الفرع</div>
</main>
</div>
<script type="application/json" id="map-data">${payload}</script>
<script>
(function(){
'use strict';
var data=JSON.parse(document.getElementById('map-data').textContent);
var viewport=document.getElementById('viewport'),stage=document.getElementById('stage'),details=document.getElementById('details');
stage.innerHTML=data.svg;
var svg=stage.querySelector('svg'),nodeEls=Array.prototype.slice.call(svg.querySelectorAll('.mm-node')),edgeEls=Array.prototype.slice.call(svg.querySelectorAll('.mm-edge'));
var nodes=new Map(),children=new Map(),collapsed=new Set(),hidden=new Set(),pointers=new Map();
var scale=1,tx=0,ty=0,gesture=null,selectedId=null;
data.nodes.forEach(function(node){nodes.set(node.id,node);if(node.parentId){if(!children.has(node.parentId))children.set(node.parentId,[]);children.get(node.parentId).push(node.id);}});
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function mid(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function transform(){stage.style.transform='translate3d('+tx+'px,'+ty+'px,0) scale('+scale+')';}
function fit(){var box=(svg.getAttribute('viewBox')||'0 0 900 600').split(/[ ,]+/).map(Number),vx=box[0]||0,vy=box[1]||0,w=Math.max(1,box[2]||900),h=Math.max(1,box[3]||600);scale=clamp(Math.min(viewport.clientWidth/w,viewport.clientHeight/h)*.92,.18,1.45);tx=(viewport.clientWidth-w*scale)/2-vx*scale;ty=(viewport.clientHeight-h*scale)/2-vy*scale;transform();}
function descendants(id){(children.get(id)||[]).forEach(function(child){if(hidden.has(child))return;hidden.add(child);descendants(child);});}
function refresh(){hidden.clear();collapsed.forEach(descendants);nodes.forEach(function(node,id){var el=nodeEls.find(function(item){return item.dataset.nodeId===id;});if(el)el.style.display=hidden.has(id)?'none':'';});edgeEls.forEach(function(el){el.style.display=hidden.has(el.dataset.from)||hidden.has(el.dataset.to)?'none':'';});}
function selectNode(id){if(!nodes.has(id))return;selectedId=id;nodeEls.forEach(function(el){el.classList.toggle('selected',el.dataset.nodeId===id);});var node=nodes.get(id);document.getElementById('node-title').textContent=node.label||'';document.getElementById('node-note').textContent=[node.sublabel,node.note].filter(Boolean).join(' · ');details.style.display='block';}
function pointerDown(e){if(e.pointerType==='mouse'&&e.button!==0)return;viewport.setPointerCapture&&viewport.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size>=2){var p=Array.from(pointers.values()).slice(0,2),c=mid(p[0],p[1]);gesture={type:'pinch',distance:Math.max(1,dist(p[0],p[1])),scale:scale,worldX:(c.x-tx)/scale,worldY:(c.y-ty)/scale,moved:false};return;}var node=e.target.closest&&e.target.closest('.mm-node[data-node-id]');gesture={type:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,tx:tx,ty:ty,nodeId:node?node.dataset.nodeId:null,moved:false};}
function pointerMove(e){if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});var p=Array.from(pointers.values()),g=gesture;if(p.length>=2&&g&&g.type==='pinch'){var c=mid(p[0],p[1]),next=clamp(g.scale*dist(p[0],p[1])/g.distance,.18,3.2);g.moved=true;scale=next;tx=c.x-g.worldX*next;ty=c.y-g.worldY*next;transform();return;}if(p.length===1&&g&&g.type==='pan'){var dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.hypot(dx,dy)>5)g.moved=true;if(g.moved&&!g.nodeId){tx=g.tx+dx;ty=g.ty+dy;transform();}}}
function pointerUp(e){var g=gesture;if(g&&g.type==='pan'&&g.id===e.pointerId&&!g.moved&&g.nodeId)selectNode(g.nodeId);pointers.delete(e.pointerId);var rest=Array.from(pointers.entries());if(rest.length===1){var item=rest[0];gesture={type:'pan',id:item[0],x:item[1].x,y:item[1].y,tx:tx,ty:ty,moved:true};}else gesture=null;}
viewport.addEventListener('pointerdown',pointerDown);viewport.addEventListener('pointermove',pointerMove);viewport.addEventListener('pointerup',pointerUp);viewport.addEventListener('pointercancel',pointerUp);
viewport.addEventListener('wheel',function(e){e.preventDefault();var r=viewport.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top,worldX=(cx-tx)/scale,worldY=(cy-ty)/scale,next=clamp(scale*(e.deltaY<0?1.12:.89),.18,3.2);scale=next;tx=cx-worldX*next;ty=cy-worldY*next;transform();},{passive:false});
svg.addEventListener('click',function(e){var node=e.target.closest&&e.target.closest('.mm-node[data-node-id]');if(node)selectNode(node.dataset.nodeId);});
svg.addEventListener('dblclick',function(e){var node=e.target.closest&&e.target.closest('.mm-node[data-node-id]');if(!node)return;var id=node.dataset.nodeId;if(!(children.get(id)||[]).length)return;if(collapsed.has(id))collapsed.delete(id);else collapsed.add(id);refresh();});
document.getElementById('fit').addEventListener('click',fit);
document.getElementById('expand').addEventListener('click',function(){collapsed.clear();refresh();});
document.getElementById('collapse').addEventListener('click',function(){children.forEach(function(kids,id){if(kids.length)collapsed.add(id);});refresh();});
document.getElementById('fullscreen').addEventListener('click',function(){if(document.fullscreenElement)document.exitFullscreen();else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();});
window.addEventListener('resize',fit);refresh();requestAnimationFrame(fit);
})();
</script>
</body>
</html>`;
}
