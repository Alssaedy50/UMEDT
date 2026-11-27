import { MindMapDocument, MindMapLayoutResult, MindMapStyle } from '../types/mindMap';
import { computeMindMapLayout } from './mindMapLayoutEngine';
import { buildStandaloneMindMapSvg } from './mindMapStorageService';

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** A self-contained, offline-first, touch-friendly full-screen map document matching the in-app viewer 100%. */
export function buildStandaloneMindMapHtmlV2(
  doc: MindMapDocument,
  layout: MindMapLayoutResult,
  isDark = false
): string {
  const styles: MindMapStyle[] = ['radial', 'hierarchical', 'medical_flow'];
  const initialStyle: MindMapStyle = styles.includes(doc.style) ? doc.style : 'radial';

  const styleBundles: Record<
    string,
    {
      svg: string;
      bounds: MindMapLayoutResult['bounds'];
      boxes: Record<string, { x: number; y: number; width: number; height: number }>;
    }
  > = {};

  for (const st of styles) {
    const useProvided =
      st === doc.style && layout.nodes.length === doc.nodes.length;
    const docForStyle: MindMapDocument =
      st === doc.style
        ? doc
        : {
            ...doc,
            style: st,
            nodes: doc.nodes.map((n) => ({ ...n, position: undefined }))
          };
    const stLayout = useProvided
      ? layout
      : computeMindMapLayout(docForStyle, new Set());
    const stSvg = buildStandaloneMindMapSvg(docForStyle, stLayout, isDark).replace(
      /^<\?xml[^>]*>\s*/,
      ''
    );
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const pn of stLayout.nodes) {
      boxes[pn.node.id] = {
        x: pn.x,
        y: pn.y,
        width: pn.width,
        height: pn.height
      };
    }
    styleBundles[st] = {
      svg: stSvg,
      bounds: stLayout.bounds,
      boxes
    };
  }

  const activeBundle = styleBundles[initialStyle] || styleBundles.radial;
  const payload = safeJson({
    svg: activeBundle.svg,
    initialStyle,
    styleBundles,
    title: doc.title || 'UMEDT Mind Map',
    rootNodeId: doc.rootNodeId,
    nodes: doc.nodes
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
:root{color-scheme:${isDark ? 'dark' : 'light'};--bg:${background};--fg:${foreground};--panel:${isDark ? 'rgba(13,27,45,.94)' : 'rgba(255,255,255,.94)'};--line:${isDark ? 'rgba(148,163,184,.2)' : 'rgba(15,35,55,.14)'};--muted:${isDark ? '#9fb0c5' : '#5d7084'};--accent:#10b981}
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden}
body{font-family:Cairo,system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;background:radial-gradient(ellipse at 50% -15%,${isDark ? '#123c43' : '#d8f4e9'} 0,transparent 48%),var(--bg);color:var(--fg)}
button{font:inherit;color:inherit;cursor:pointer}
.app{height:100dvh;min-height:100%;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
.topbar{position:relative;z-index:20;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:10px 14px;background:var(--panel);border-bottom:1px solid var(--line);backdrop-filter:blur(18px)}
.brand{min-width:0;flex:1}.eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--accent);text-transform:uppercase}.title{font-size:clamp(13px,2vw,17px);font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.actions{position:relative;display:flex;align-items:center;flex-shrink:0;max-width:100%;direction:rtl}
.tools-menu{position:relative}
.tools-menu>summary{display:flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:12px;background:${isDark ? 'rgba(255,255,255,.06)' : '#fff'};font-size:12px;font-weight:900;cursor:pointer;list-style:none;white-space:nowrap}
.tools-menu>summary::-webkit-details-marker{display:none}
.tools-content{position:absolute;top:calc(100% + 8px);right:0;z-index:50;display:flex;flex-direction:column;gap:7px;width:min(320px,calc(100vw - 24px));max-height:min(72dvh,620px);overflow-y:auto;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--panel);box-shadow:0 16px 44px rgba(0,0,0,.24);backdrop-filter:blur(18px)}
.style-group{display:flex;flex-wrap:wrap;gap:4px;padding:3px;border:1px solid var(--line);border-radius:11px;background:${isDark ? 'rgba(255,255,255,.04)' : 'rgba(15,35,55,.05)'}}
.style-btn{min-height:30px;padding:0 9px;border:none;border-radius:8px;background:transparent;font-size:11px;font-weight:800;white-space:nowrap}
.style-btn.active{background:#10b981;color:#042419}
.action{min-height:34px;padding:0 10px;border:1px solid var(--line);border-radius:11px;background:${isDark ? 'rgba(255,255,255,.06)' : '#fff'};font-size:11px;font-weight:800;white-space:nowrap}
.action.active,.action.primary{background:#10b981;color:#06251d;border-color:#10b981}
.action.icon{width:34px;padding:0;display:grid;place-items:center;font-size:15px}
.viewport{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:none;overscroll-behavior:contain;cursor:grab;direction:ltr;background-image:radial-gradient(circle,${isDark ? 'rgba(148,163,184,.14)' : 'rgba(71,96,118,.14)'} 1px,transparent 1px);background-size:24px 24px}
.viewport:active{cursor:grabbing}.stage{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}.stage svg{display:block;max-width:none;overflow:visible}
.mm-node{cursor:pointer;outline:none}.mm-node:focus rect,.mm-node.selected rect,.mm-node:focus polygon,.mm-node.selected polygon,.mm-node:focus ellipse,.mm-node.selected ellipse{stroke:#10b981!important;stroke-width:3.8px!important;filter:drop-shadow(0 4px 12px rgba(16,185,129,.32))}
.zoom-dock{position:absolute;top:12px;left:12px;z-index:10;display:flex;flex-direction:column;gap:4px;padding:5px;border:1px solid var(--line);border-radius:14px;background:var(--panel);backdrop-filter:blur(14px);box-shadow:0 8px 24px rgba(0,0,0,.15);direction:rtl}
.zoom-btn{width:34px;height:34px;border:1px solid transparent;border-radius:10px;background:transparent;font-size:17px;font-weight:900;display:grid;place-items:center}
.zoom-btn:hover{border-color:var(--accent);background:rgba(16,185,129,.12)}
.zoom-lbl{text-align:center;font-size:10px;font-weight:800;font-family:monospace;color:var(--muted)}
.seq-bar{position:absolute;top:12px;left:60px;right:12px;z-index:11;max-width:540px;margin:0 auto;display:none;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid rgba(16,185,129,.35);border-radius:16px;background:rgba(15,23,42,.92);color:#fff;backdrop-filter:blur(16px);direction:rtl;box-shadow:0 10px 30px rgba(0,0,0,.22)}
.seq-center{min-width:0;flex:1;text-align:center}.seq-title{font-size:12px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.seq-step{font-size:10px;color:#94a3b8;margin-top:2px}
.nodes-panel{position:absolute;top:12px;right:12px;z-index:15;width:min(330px,calc(100vw - 24px));max-height:68dvh;display:none;flex-direction:column;border:1px solid var(--line);border-radius:18px;background:var(--panel);backdrop-filter:blur(20px);box-shadow:0 16px 44px rgba(0,0,0,.25);direction:rtl;overflow:hidden}
.nodes-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--line);font-size:12px;font-weight:900}
.nodes-list{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:5px}
.node-row{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;border:1px solid var(--line);border-radius:11px;font-size:11px;font-weight:700}
.node-row.active{border-color:#10b981;background:rgba(16,185,129,.14)}
.node-row.dim{opacity:.48}
.node-row-lbl{min-width:0;flex:1;text-align:right;background:none;border:none;padding:0;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mini-btn{min-height:24px;padding:0 7px;border:1px solid var(--line);border-radius:7px;background:transparent;font-size:10px;font-weight:800}
.details{position:absolute;z-index:12;bottom:max(10px,env(safe-area-inset-bottom));left:10px;right:10px;max-width:740px;margin:0 auto;max-height:min(32dvh,225px);overflow-y:auto;padding:12px 14px;border:1px solid rgba(16,185,129,.34);border-radius:18px;background:var(--panel);backdrop-filter:blur(20px);box-shadow:0 14px 48px rgba(0,0,0,.22);display:none;direction:rtl}
.details.expanded{max-height:58dvh}
.details-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.crumb{font-size:10px;color:var(--muted);margin-bottom:3px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.crumb button{background:none;border:none;padding:0;color:inherit;font-size:10px;font-weight:700}
.crumb button.curr{color:var(--accent);font-weight:900}
.details strong{display:block;font-size:14px;color:var(--accent);font-weight:900}
.details .sub{font-size:11.5px;font-weight:700;opacity:.85;margin-top:2px}
.details p{margin:6px 0 0;font-size:12px;line-height:1.75;color:var(--fg);white-space:pre-wrap;word-break:break-word}
.chips{display:flex;gap:6px;overflow-x:auto;padding-top:8px;margin-top:8px;border-top:1px solid var(--line)}
.chip{min-height:28px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:${isDark ? 'rgba(255,255,255,.05)' : 'rgba(15,35,55,.05)'};font-size:11px;font-weight:800;white-space:nowrap;flex-shrink:0}
.chip.accent{background:#10b981;color:#042419;border-color:#10b981}
.hint{position:absolute;z-index:2;bottom:14px;left:50%;transform:translateX(-50%);padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font-size:10px;font-weight:700;color:var(--muted);pointer-events:none;backdrop-filter:blur(12px);white-space:nowrap;direction:rtl}
@media(max-width:600px){.topbar{padding:8px 10px}.eyebrow{display:none}.title{font-size:13px}}
</style>
</head>
<body>
<div class="app">
<header class="topbar">
  <div class="brand"><div class="eyebrow">UMEDT · INTERACTIVE MIND MAP</div><div class="title">${title}</div></div>
  <div class="actions">
    <details class="tools-menu">
      <summary>☰ خيارات الخريطة <span aria-hidden="true">⌄</span></summary>
      <div class="tools-content">
        <div class="style-group" role="group" aria-label="طريقة عرض الخريطة">
          <button class="style-btn" data-style="radial" type="button">شعاعية</button>
          <button class="style-btn" data-style="hierarchical" type="button">هرمية</button>
          <button class="style-btn" data-style="medical_flow" type="button">مسار سريري</button>
        </div>
        <button class="action" id="seq-toggle" type="button">عرض تسلسلي</button>
        <button class="action" id="nodes-toggle" type="button">التحكم بالعقد</button>
        <button class="action" id="expand" type="button">توسيع الكل</button>
        <button class="action" id="collapse" type="button">طي الفروع</button>
        <button class="action" id="fit" type="button">ملاءمة الكل</button>
        <button class="action" id="fullscreen" type="button" aria-label="ملء الشاشة" title="ملء الشاشة">ملء الشاشة</button>
      </div>
    </details>
  </div>
</header>
<main class="viewport" id="viewport">
  <div class="stage" id="stage"></div>
  <div class="zoom-dock">
    <button class="zoom-btn" id="zoom-plus" type="button" title="تكبير">+</button>
    <div class="zoom-lbl" id="zoom-pct">100%</div>
    <button class="zoom-btn" id="zoom-minus" type="button" title="تصغير">−</button>
  </div>
  <div class="seq-bar" id="seq-bar">
    <button class="action" id="seq-prev" type="button">السابق</button>
    <div class="seq-center"><div class="seq-title" id="seq-title"></div><div class="seq-step" id="seq-step"></div></div>
    <button class="action primary" id="seq-next" type="button">التالي</button>
  </div>
  <aside class="nodes-panel" id="nodes-panel">
    <div class="nodes-head"><span>التحكم بالعقد الرئيسية والفرعية</span><button class="mini-btn" id="nodes-close" type="button">✕</button></div>
    <div class="nodes-list" id="nodes-list"></div>
  </aside>
  <aside class="details" id="details">
    <div class="details-top">
      <div style="min-width:0;flex:1">
        <div class="crumb" id="node-crumb"></div>
        <strong id="node-title"></strong>
        <div class="sub" id="node-sub"></div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="mini-btn" id="node-hide-btn" type="button">إخفاء العقدة</button>
        <button class="mini-btn" id="node-expand-note" type="button" style="display:none">الشرح الكامل</button>
        <button class="mini-btn" id="details-close" type="button">✕</button>
      </div>
    </div>
    <p id="node-note"></p>
    <div class="chips" id="node-chips"></div>
  </aside>
  <div class="hint" id="hint">انقر على أي عقدة لإظهار فروعها وتفاصيلها · (+عدد) لفتح أو طي الفرع</div>
</main>
</div>
<script type="application/json" id="map-data">${payload}</script>
<script>
(function(){
'use strict';
var data=JSON.parse(document.getElementById('map-data').textContent);
var viewport=document.getElementById('viewport'),stage=document.getElementById('stage'),details=document.getElementById('details');
var seqBar=document.getElementById('seq-bar'),nodesPanel=document.getElementById('nodes-panel'),nodesList=document.getElementById('nodes-list');
var toolsMenu=document.querySelector('.tools-menu');
var toolsContent=document.querySelector('.tools-content');
if(toolsContent&&toolsMenu){toolsContent.addEventListener('click',function(e){if(e.target&&e.target.closest&&e.target.closest('button'))toolsMenu.open=false;});}
var currentStyle=data.initialStyle||'radial';
var svg=null,nodeEls=[],edgeEls=[];
var nodes=new Map(),children=new Map(),collapsed=new Set(),userHidden=new Set(),hidden=new Set(),pointers=new Map();
var scale=1,tx=0,ty=0,gesture=null,selectedId=null,isSequential=false,seqIndex=0,seqOrder=[],noteExpanded=false;

data.nodes.forEach(function(node){
  nodes.set(node.id,node);
  if(node.parentId){
    if(!children.has(node.parentId))children.set(node.parentId,[]);
    children.get(node.parentId).push(node.id);
  }
});
children.forEach(function(kids,pid){
  kids.sort(function(a,b){return ((nodes.get(a).order||0)-(nodes.get(b).order||0));});
});

function buildDefaultCollapsed(){
  collapsed.clear();
  children.forEach(function(kids,id){
    if(kids.length&&id!==data.rootNodeId)collapsed.add(id);
  });
}
buildDefaultCollapsed();

function buildSeqOrder(){
  seqOrder=[];
  var seen=new Set();
  function walk(id){
    if(!nodes.has(id)||seen.has(id)||userHidden.has(id))return;
    seen.add(id);
    seqOrder.push(id);
    (children.get(id)||[]).forEach(walk);
  }
  walk(data.rootNodeId);
  data.nodes.forEach(function(n){walk(n.id);});
}
buildSeqOrder();

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function mid(a,b){return{x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
function transform(animate){
  stage.style.transition=animate?'transform 220ms cubic-bezier(0.22,1,0.36,1)':'none';
  stage.style.transform='translate3d('+tx+'px,'+ty+'px,0) scale('+scale+')';
  var pct=document.getElementById('zoom-pct');
  if(pct)pct.textContent=Math.round(scale*100)+'%';
}

function getBundle(){
  return (data.styleBundles&&data.styleBundles[currentStyle])||data.styleBundles.radial||{svg:data.svg,bounds:{minX:0,minY:0,width:900,height:600},boxes:{}};
}

function fit(){
  var b=getBundle().bounds||{minX:0,minY:0,width:900,height:600};
  var w=Math.max(1,b.width||900),h=Math.max(1,b.height||600);
  var topInset=isSequential?64:10;
  var botInset=selectedId?Math.min(190,viewport.clientHeight*0.26):16;
  var uw=Math.max(200,viewport.clientWidth-16),uh=Math.max(150,viewport.clientHeight-topInset-botInset);
  scale=clamp(Math.min(uw/w,uh/h)*0.95,0.16,1.5);
  tx=(viewport.clientWidth-w*scale)/2;
  ty=topInset+(uh-h*scale)/2;
  transform(true);
}

function focusCluster(id){
  var bundle=getBundle();
  var boxes=bundle.boxes||{};
  var b=bundle.bounds||{minX:0,minY:0,width:900,height:600};
  var targetBox=boxes[id];
  if(!targetBox){fit();return;}
  var clusterIds=[id];
  (children.get(id)||[]).forEach(function(cid){
    if(!hidden.has(cid)&&boxes[cid])clusterIds.push(cid);
  });
  var node=nodes.get(id);
  if(isSequential&&node&&node.parentId&&boxes[node.parentId]){
    clusterIds.push(node.parentId);
  }
  var minLX=Infinity,minLY=Infinity,maxLX=-Infinity,maxLY=-Infinity;
  clusterIds.forEach(function(cid){
    var bx=boxes[cid];
    if(!bx)return;
    var l=bx.x-bx.width/2-b.minX;
    var t=bx.y-bx.height/2-b.minY;
    var r=bx.x+bx.width/2-b.minX;
    var bt=bx.y+bx.height/2+16-b.minY;
    if(l<minLX)minLX=l;
    if(t<minLY)minLY=t;
    if(r>maxLX)maxLX=r;
    if(bt>maxLY)maxLY=bt;
  });
  var cw=Math.max(140,maxLX-minLX+56),ch=Math.max(90,maxLY-minLY+56);
  var lcx=(minLX+maxLX)/2,lcy=(minLY+maxLY)/2;
  var topInset=isSequential?68:14;
  var botInset=Math.min(215,viewport.clientHeight*0.29)+14;
  var uw=Math.max(200,viewport.clientWidth-20),uh=Math.max(150,viewport.clientHeight-topInset-botInset);
  var fitScale=Math.min(uw/cw,uh/ch);
  scale=clusterIds.length>1?clamp(fitScale,0.22,1.12):clamp(Math.min(scale<0.68?0.92:scale,fitScale),0.68,1.15);
  tx=viewport.clientWidth/2-lcx*scale;
  ty=(topInset+uh/2)-lcy*scale;
  transform(true);
}

function markDescendantsHidden(id){
  (children.get(id)||[]).forEach(function(child){
    hidden.add(child);
    markDescendantsHidden(child);
  });
}

function updateActionBadges(){
  if(!svg)return;
  nodeEls.forEach(function(el){
    var old=el.querySelector('.mm-node-action');
    if(old)old.remove();
    if(isSequential)return;
    var id=el.dataset.nodeId;
    var kids=(children.get(id)||[]).filter(function(cid){return !userHidden.has(cid);});
    if(!kids.length||id===data.rootNodeId)return;
    var isCol=collapsed.has(id);
    var box=el.getBBox();
    var g=document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','mm-node-action');
    g.setAttribute('data-node-id',id);
    var cx=box.x+box.width/2,cy=box.y+box.height+2,pw=isCol?36:26,ph=20;
    var rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('x',String(cx-pw/2));
    rect.setAttribute('y',String(cy-ph/2));
    rect.setAttribute('width',String(pw));
    rect.setAttribute('height',String(ph));
    rect.setAttribute('rx','10');
    rect.setAttribute('fill',isCol?'#10b981':'#1e293b');
    rect.setAttribute('stroke','#10b981');
    rect.setAttribute('stroke-width','1.8');
    var txt=document.createElementNS('http://www.w3.org/2000/svg','text');
    txt.setAttribute('x',String(cx));
    txt.setAttribute('y',String(cy+3.5));
    txt.setAttribute('text-anchor','middle');
    txt.setAttribute('font-size','10.5');
    txt.setAttribute('font-weight','900');
    txt.setAttribute('fill',isCol?'#022c22':'#34d399');
    txt.textContent=isCol?('+'+kids.length):'−';
    g.appendChild(rect);
    g.appendChild(txt);
    el.appendChild(g);
  });
}

function renderNodesPanel(){
  if(!nodesList)return;
  nodesList.innerHTML='';
  function walk(id,depth){
    var node=nodes.get(id);
    if(!node)return;
    var row=document.createElement('div');
    var isHid=hidden.has(id);
    var isDirectHid=userHidden.has(id);
    row.className='node-row'+(selectedId===id?' active':'')+(isHid?' dim':'');
    row.style.marginRight=Math.min(depth*12,48)+'px';
    var lblBtn=document.createElement('button');
    lblBtn.type='button';
    lblBtn.className='node-row-lbl';
    lblBtn.textContent=node.label;
    lblBtn.onclick=function(){
      if(userHidden.has(id))userHidden.delete(id);
      selectNode(id,true);
    };
    row.appendChild(lblBtn);
    var kids=children.get(id)||[];
    if(kids.length&&id!==data.rootNodeId&&!isHid){
      var colBtn=document.createElement('button');
      colBtn.type='button';
      colBtn.className='mini-btn';
      colBtn.textContent=collapsed.has(id)?('+'+kids.length):'طي';
      colBtn.onclick=function(){toggleBranch(id);};
      row.appendChild(colBtn);
    }
    if(id!==data.rootNodeId){
      var hBtn=document.createElement('button');
      hBtn.type='button';
      hBtn.className='mini-btn';
      hBtn.textContent=isDirectHid?'إظهار':'إخفاء';
      hBtn.onclick=function(){
        if(userHidden.has(id))userHidden.delete(id);
        else{
          userHidden.add(id);
          if(selectedId===id)selectedId=node.parentId||null;
        }
        buildSeqOrder();
        refresh();
      };
      row.appendChild(hBtn);
    }
    nodesList.appendChild(row);
    kids.forEach(function(cid){walk(cid,depth+1);});
  }
  walk(data.rootNodeId,0);
}

function refresh(){
  hidden.clear();
  userHidden.forEach(function(id){
    if(id!==data.rootNodeId){
      hidden.add(id);
      markDescendantsHidden(id);
    }
  });
  if(isSequential){
    var currId=seqOrder[clamp(seqIndex,0,Math.max(0,seqOrder.length-1))]||data.rootNodeId;
    var vis=new Set([currId]);
    var p=nodes.get(currId)?nodes.get(currId).parentId:null;
    while(p&&nodes.has(p)&&!vis.has(p)){
      vis.add(p);
      p=nodes.get(p).parentId;
    }
    var directP=nodes.get(currId)?nodes.get(currId).parentId:null;
    if(directP){
      (children.get(directP)||[]).forEach(function(sib){if(!userHidden.has(sib))vis.add(sib);});
    }
    (children.get(currId)||[]).forEach(function(cid){if(!userHidden.has(cid))vis.add(cid);});
    nodes.forEach(function(_,id){if(!vis.has(id))hidden.add(id);});
    seqBar.style.display='flex';
    var cNode=nodes.get(currId);
    document.getElementById('seq-title').textContent=cNode?cNode.label:'';
    document.getElementById('seq-step').textContent=(seqIndex+1)+' / '+Math.max(1,seqOrder.length);
  }else{
    seqBar.style.display='none';
    collapsed.forEach(markDescendantsHidden);
  }
  nodeEls.forEach(function(el){
    var id=el.dataset.nodeId;
    el.style.display=hidden.has(id)?'none':'';
    el.classList.toggle('selected',id===selectedId);
  });
  edgeEls.forEach(function(el){
    el.style.display=hidden.has(el.dataset.from)||hidden.has(el.dataset.to)?'none':'';
  });
  updateActionBadges();
  renderNodesPanel();
}

function mountStyle(nextStyle){
  currentStyle=nextStyle;
  Array.prototype.slice.call(document.querySelectorAll('.style-btn')).forEach(function(btn){
    btn.classList.toggle('active',btn.getAttribute('data-style')===currentStyle);
  });
  stage.innerHTML=getBundle().svg;
  svg=stage.querySelector('svg');
  nodeEls=Array.prototype.slice.call(svg.querySelectorAll('.mm-node'));
  edgeEls=Array.prototype.slice.call(svg.querySelectorAll('.mm-edge'));
  svg.addEventListener('keydown',function(e){
    if(e.key!=='Enter'&&e.key!==' ')return;
    var node=e.target.closest&&e.target.closest('.mm-node[data-node-id]');
    if(node){e.preventDefault();selectNode(node.dataset.nodeId,true);}
  });
  svg.addEventListener('dblclick',function(e){
    var node=e.target.closest&&e.target.closest('.mm-node[data-node-id]');
    if(!node)return;
    toggleBranch(node.dataset.nodeId);
  });
  refresh();
  if(selectedId)focusCluster(selectedId);
  else fit();
}

function renderDetails(){
  if(!selectedId||!nodes.has(selectedId)){
    details.style.display='none';
    var hint=document.getElementById('hint');
    if(hint)hint.style.display='';
    return;
  }
  var node=nodes.get(selectedId);
  document.getElementById('node-title').textContent=node.label||'';
  var subEl=document.getElementById('node-sub');
  subEl.textContent=node.sublabel||'';
  subEl.style.display=node.sublabel?'block':'none';
  var noteText=node.note||'';
  var noteEl=document.getElementById('node-note');
  var expandBtn=document.getElementById('node-expand-note');
  if(noteText.length>140){
    expandBtn.style.display='inline-block';
    expandBtn.textContent=noteExpanded?'تصغير':'الشرح الكامل';
    noteEl.textContent=noteExpanded?noteText:(noteText.slice(0,140)+'…');
  }else{
    expandBtn.style.display='none';
    noteEl.textContent=noteText;
  }
  noteEl.style.display=noteText?'block':'none';
  details.classList.toggle('expanded',noteExpanded);
  document.getElementById('node-hide-btn').style.display=node.id===data.rootNodeId?'none':'inline-block';

  var crumb=document.getElementById('node-crumb');
  crumb.innerHTML='';
  var path=[],curr=node,seen=new Set();
  while(curr&&!seen.has(curr.id)){
    seen.add(curr.id);
    path.unshift(curr);
    curr=curr.parentId?nodes.get(curr.parentId):null;
  }
  if(path.length>1){
    path.forEach(function(pNode,idx){
      if(idx>0){var sep=document.createElement('span');sep.textContent='‹';crumb.appendChild(sep);}
      var b=document.createElement('button');
      b.type='button';
      b.textContent=pNode.label;
      if(idx===path.length-1)b.className='curr';
      b.onclick=function(){selectNode(pNode.id,true);};
      crumb.appendChild(b);
    });
  }

  var chips=document.getElementById('node-chips');
  chips.innerHTML='';
  var kids=(children.get(node.id)||[]).filter(function(cid){return !userHidden.has(cid);});
  if(kids.length){
    chips.style.display='flex';
    if(!isSequential&&node.id!==data.rootNodeId){
      var toggleChip=document.createElement('button');
      toggleChip.type='button';
      toggleChip.className='chip accent';
      toggleChip.textContent=collapsed.has(node.id)?('إظهار الفروع ('+kids.length+')'):('إخفاء الفروع ('+kids.length+')');
      toggleChip.onclick=function(){toggleBranch(node.id);};
      chips.appendChild(toggleChip);
    }
    kids.forEach(function(cid){
      var cNode=nodes.get(cid);
      if(!cNode)return;
      var cBtn=document.createElement('button');
      cBtn.type='button';
      cBtn.className='chip';
      cBtn.textContent=cNode.label;
      cBtn.onclick=function(){selectNode(cid,true);};
      chips.appendChild(cBtn);
    });
  }else{
    chips.style.display='none';
  }

  details.style.display='block';
  var hintEl=document.getElementById('hint');
  if(hintEl)hintEl.style.display='none';
}

function selectNode(id,revealChildren){
  if(!nodes.has(id))return;
  selectedId=id;
  noteExpanded=false;
  if(!isSequential){
    var p=nodes.get(id).parentId;
    while(p&&nodes.has(p)){
      collapsed.delete(p);
      p=nodes.get(p).parentId;
    }
    if(revealChildren&&collapsed.has(id)){
      collapsed.delete(id);
    }
  }else{
    var idx=seqOrder.indexOf(id);
    if(idx>=0)seqIndex=idx;
  }
  refresh();
  renderDetails();
  focusCluster(id);
}

function toggleBranch(id){
  if(!(children.get(id)||[]).length||isSequential)return;
  if(collapsed.has(id))collapsed.delete(id);
  else collapsed.add(id);
  selectedId=id;
  refresh();
  renderDetails();
  focusCluster(id);
}

function pointerDown(e){
  if(e.pointerType==='mouse'&&e.button!==0)return;
  if(details.contains(e.target)||nodesPanel.contains(e.target)||seqBar.contains(e.target)||e.target.closest('.zoom-dock'))return;
  viewport.setPointerCapture&&viewport.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){
    var p=Array.from(pointers.values()).slice(0,2),c=mid(p[0],p[1]);
    var r=viewport.getBoundingClientRect();
    var lx=c.x-r.left,ly=c.y-r.top;
    gesture={type:'pinch',distance:Math.max(1,dist(p[0],p[1])),scale:scale,worldX:(lx-tx)/scale,worldY:(ly-ty)/scale,moved:false};
    return;
  }
  var act=e.target.closest&&e.target.closest('.mm-node-action[data-node-id]');
  var node=e.target.closest&&e.target.closest('.mm-node[data-node-id]');
  gesture={type:'pan',id:e.pointerId,x:e.clientX,y:e.clientY,tx:tx,ty:ty,actionId:act?act.dataset.nodeId:null,nodeId:(!act&&node)?node.dataset.nodeId:null,moved:false};
}

function pointerMove(e){
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  var p=Array.from(pointers.values()),g=gesture;
  if(p.length>=2&&g&&g.type==='pinch'){
    var c=mid(p[0],p[1]),r=viewport.getBoundingClientRect(),lx=c.x-r.left,ly=c.y-r.top;
    var next=clamp(g.scale*dist(p[0],p[1])/g.distance,0.16,3.2);
    g.moved=true;scale=next;tx=lx-g.worldX*next;ty=ly-g.worldY*next;transform(false);return;
  }
  if(p.length===1&&g&&g.type==='pan'){
    var dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(Math.hypot(dx,dy)>6)g.moved=true;
    if(g.moved){tx=g.tx+dx;ty=g.ty+dy;transform(false);}
  }
}

function pointerUp(e){
  var g=gesture;
  if(g&&g.type==='pan'&&g.id===e.pointerId&&!g.moved){
    if(g.actionId)toggleBranch(g.actionId);
    else if(g.nodeId)selectNode(g.nodeId,true);
  }
  pointers.delete(e.pointerId);
  var rest=Array.from(pointers.entries());
  if(rest.length===1){
    var item=rest[0];
    gesture={type:'pan',id:item[0],x:item[1].x,y:item[1].y,tx:tx,ty:ty,moved:true};
  }else gesture=null;
}

viewport.addEventListener('pointerdown',pointerDown);
viewport.addEventListener('pointermove',pointerMove);
viewport.addEventListener('pointerup',pointerUp);
viewport.addEventListener('pointercancel',pointerUp);
viewport.addEventListener('wheel',function(e){
  if(details.contains(e.target)||nodesPanel.contains(e.target))return;
  e.preventDefault();
  var r=viewport.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
  var worldX=(cx-tx)/scale,worldY=(cy-ty)/scale;
  var next=clamp(scale*(e.deltaY<0?1.12:0.89),0.16,3.2);
  scale=next;tx=cx-worldX*next;ty=cy-worldY*next;transform(false);
},{passive:false});

Array.prototype.slice.call(document.querySelectorAll('.style-btn')).forEach(function(btn){
  btn.addEventListener('click',function(){mountStyle(btn.getAttribute('data-style'));});
});

document.getElementById('seq-toggle').addEventListener('click',function(){
  isSequential=!isSequential;
  this.classList.toggle('active',isSequential);
  this.textContent=isSequential?'العرض الحر':'عرض تسلسلي';
  if(isSequential){
    seqIndex=0;
    selectedId=seqOrder[0]||data.rootNodeId;
  }else{
    buildDefaultCollapsed();
  }
  refresh();
  renderDetails();
  if(selectedId)focusCluster(selectedId);else fit();
});

document.getElementById('seq-prev').addEventListener('click',function(){
  if(seqIndex>0){seqIndex--;selectNode(seqOrder[seqIndex],true);}
});
document.getElementById('seq-next').addEventListener('click',function(){
  if(seqIndex<seqOrder.length-1){seqIndex++;selectNode(seqOrder[seqIndex],true);}
});

document.getElementById('nodes-toggle').addEventListener('click',function(){
  var open=nodesPanel.style.display==='flex';
  nodesPanel.style.display=open?'none':'flex';
  this.classList.toggle('active',!open);
});
document.getElementById('nodes-close').addEventListener('click',function(){
  nodesPanel.style.display='none';
  document.getElementById('nodes-toggle').classList.remove('active');
});

document.getElementById('fit').addEventListener('click',function(){
  selectedId=null;
  renderDetails();
  refresh();
  fit();
});
document.getElementById('expand').addEventListener('click',function(){
  userHidden.clear();
  collapsed.clear();
  selectedId=null;
  renderDetails();
  refresh();
  fit();
});
document.getElementById('collapse').addEventListener('click',function(){
  buildDefaultCollapsed();
  selectedId=null;
  renderDetails();
  refresh();
  fit();
});
document.getElementById('zoom-plus').addEventListener('click',function(){
  var cx=viewport.clientWidth/2,cy=viewport.clientHeight*0.42;
  var wx=(cx-tx)/scale,wy=(cy-ty)/scale,next=clamp(scale*1.22,0.16,3.2);
  scale=next;tx=cx-wx*next;ty=cy-wy*next;transform(true);
});
document.getElementById('zoom-minus').addEventListener('click',function(){
  var cx=viewport.clientWidth/2,cy=viewport.clientHeight*0.42;
  var wx=(cx-tx)/scale,wy=(cy-ty)/scale,next=clamp(scale*0.82,0.16,3.2);
  scale=next;tx=cx-wx*next;ty=cy-wy*next;transform(true);
});
document.getElementById('node-expand-note').addEventListener('click',function(){
  noteExpanded=!noteExpanded;
  renderDetails();
});
document.getElementById('node-hide-btn').addEventListener('click',function(){
  if(!selectedId||selectedId===data.rootNodeId)return;
  var p=nodes.get(selectedId)?nodes.get(selectedId).parentId:null;
  userHidden.add(selectedId);
  selectedId=p||null;
  buildSeqOrder();
  refresh();
  renderDetails();
  if(selectedId)focusCluster(selectedId);else fit();
});
document.getElementById('details-close').addEventListener('click',function(){
  selectedId=null;
  renderDetails();
  refresh();
});
document.getElementById('fullscreen').addEventListener('click',function(){
  if(document.fullscreenElement)document.exitFullscreen();
  else if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();
});

window.addEventListener('resize',function(){if(selectedId)focusCluster(selectedId);else fit();});
mountStyle(currentStyle);
requestAnimationFrame(fit);
})();
</script>
</body>
</html>`;
}
