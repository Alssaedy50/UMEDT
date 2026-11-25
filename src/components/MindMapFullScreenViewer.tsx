import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Share2, X } from 'lucide-react';
import { MindMapDocument } from '../types/mindMap';
import { computeMindMapLayout } from '../services/mindMapLayoutEngine';
import { buildStandaloneMindMapSvg } from '../services/mindMapStorageService';
import { buildStandaloneMindMapHtmlV2 as buildStandaloneMindMapHtml } from '../services/mindMapStandaloneExportServiceV2';
import { shareFileWithVerification } from '../utils/downloadHelper';

interface MindMapFullScreenViewerProps {
  mapDocument: MindMapDocument;
  onClose: () => void;
  showToast?: (message: string, type?: string) => void;
}

type PointerPoint = { x: number; y: number };
type Gesture =
  | { type: 'pan'; pointerId: number; startX: number; startY: number; originX: number; originY: number; nodeId?: string; moved: boolean }
  | { type: 'pinch'; startDistance: number; startScale: number; worldX: number; worldY: number; moved: boolean }
  | null;

function distance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PointerPoint, b: PointerPoint): PointerPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export const MindMapFullScreenViewer: React.FC<MindMapFullScreenViewerProps> = ({
  mapDocument,
  onClose,
  showToast
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const gestureRef = useRef<Gesture>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSequentialMode, setIsSequentialMode] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(mapDocument.nodes.filter((node) => mapDocument.nodes.some((child) => child.parentId === node.id)).map((node) => node.id))
  );
  const isDark = typeof window !== 'undefined' && window.document.documentElement.classList.contains('dark');
  const sequenceNodes = useMemo(() => {
    const byParent = new Map<string, typeof mapDocument.nodes>();
    mapDocument.nodes.forEach((node) => {
      const key = node.parentId || '__root__';
      byParent.set(key, [...(byParent.get(key) || []), node]);
    });
    const ordered: typeof mapDocument.nodes = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      const node = mapDocument.nodes.find((item) => item.id === id);
      if (!node || visited.has(id)) return;
      visited.add(id);
      ordered.push(node);
      (byParent.get(id) || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach((child) => visit(child.id));
    };
    visit(mapDocument.rootNodeId);
    mapDocument.nodes.forEach((node) => visit(node.id));
    return ordered;
  }, [mapDocument]);
  const sequentialVisibleIds = useMemo(() => {
    const current = sequenceNodes[Math.min(sequenceIndex, Math.max(0, sequenceNodes.length - 1))];
    if (!current) return new Set<string>();
    const visible = new Set<string>([current.id]);
    const nodeById = new Map(mapDocument.nodes.map((node) => [node.id, node]));
    let parentId = current.parentId;
    while (parentId && nodeById.has(parentId) && !visible.has(parentId)) {
      visible.add(parentId);
      parentId = nodeById.get(parentId)?.parentId || null;
    }
    if (current.parentId) {
      mapDocument.nodes
        .filter((node) => node.parentId === current.parentId)
        .forEach((node) => visible.add(node.id));
    }
    mapDocument.nodes
      .filter((node) => node.parentId === current.id)
      .forEach((node) => visible.add(node.id));
    return visible;
  }, [mapDocument.nodes, sequenceNodes, sequenceIndex]);
  const displayDocument = useMemo(() => {
    if (!isSequentialMode) return mapDocument;
    const nodes = mapDocument.nodes.filter((node) => sequentialVisibleIds.has(node.id));
    const visibleIds = new Set(nodes.map((node) => node.id));
    return {
      ...mapDocument,
      nodes,
      edges: mapDocument.edges.filter((edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId))
    };
  }, [mapDocument, isSequentialMode, sequentialVisibleIds]);
  const layout = useMemo(
    () => computeMindMapLayout(displayDocument, isSequentialMode ? new Set() : collapsedIds),
    [displayDocument, isSequentialMode, collapsedIds]
  );
  const fullLayout = useMemo(() => computeMindMapLayout(mapDocument, new Set()), [mapDocument]);
  const svgMarkup = useMemo(
    () => buildStandaloneMindMapSvg(displayDocument, layout, isDark).replace(/^<\?xml[^>]*>\s*/, ''),
    [displayDocument, layout, isDark]
  );
  const selectedNode = useMemo(
    () => mapDocument.nodes.find((node) => node.id === selectedNodeId) || null,
    [mapDocument.nodes, selectedNodeId]
  );
  const selectedNodePath = useMemo(() => {
    if (!selectedNode) return [];
    const byId = new Map(mapDocument.nodes.map((node) => [node.id, node]));
    const path: typeof mapDocument.nodes = [];
    const seen = new Set<string>();
    let current: typeof selectedNode | undefined = selectedNode;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  }, [mapDocument.nodes, selectedNode]);

  const applyTransform = useCallback((nextZoom: number, nextPan: { x: number; y: number }) => {
    setZoom(nextZoom);
    setPan(nextPan);
    if (stageRef.current) {
      stageRef.current.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${nextZoom})`;
    }
  }, []);

  const focusNode = useCallback((nodeId: string) => {
    const viewport = viewportRef.current;
    const svg = stageRef.current?.querySelector('svg');
    const node = svg?.querySelector(`.mm-node[data-node-id="${CSS.escape(nodeId)}"]`) as SVGGElement | null;
    if (!viewport || !node) return;
    const bounds = node.getBBox();
    const scale = Math.max(0.82, Math.min(2.45, Math.min(
      (viewport.clientWidth * 0.72) / Math.max(1, bounds.width),
      (viewport.clientHeight * 0.48) / Math.max(1, bounds.height)
    )));
    applyTransform(scale, {
      x: viewport.clientWidth / 2 - (bounds.x + bounds.width / 2) * scale,
      y: viewport.clientHeight * 0.43 - (bounds.y + bounds.height / 2) * scale
    });
  }, [applyTransform]);

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    const svg = stageRef.current?.querySelector('svg');
    if (!viewport || !svg) return;
    const values = (svg.getAttribute('viewBox') || '0 0 900 600').trim().split(/[ ,]+/).map(Number);
    const minX = values[0] || 0;
    const minY = values[1] || 0;
    const width = Math.max(1, values[2] || 900);
    const height = Math.max(1, values[3] || 600);
    const scale = Math.max(0.18, Math.min(1.45, Math.min(viewport.clientWidth / width, viewport.clientHeight / height) * 0.92));
    applyTransform(scale, {
      x: (viewport.clientWidth - width * scale) / 2 - minX * scale,
      y: (viewport.clientHeight - height * scale) / 2 - minY * scale
    });
  }, [applyTransform, svgMarkup]);

  useEffect(() => {
    if (!stageRef.current) return;
    stageRef.current.innerHTML = svgMarkup;
    const svg = stageRef.current.querySelector('svg');
    if (!svg) return;
    svg.style.display = 'block';
    svg.style.maxWidth = 'none';
    svg.style.overflow = 'visible';
    // Add a dedicated forward/collapse control to every visible node.
    svg.querySelectorAll<SVGGElement>('.mm-node[data-node-id]').forEach((node) => {
      if (node.querySelector('.mm-node-action')) return;
      const box = node.getBBox();
      const action = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
      action.setAttribute('class', 'mm-node-action');
      action.setAttribute('data-node-id', node.dataset.nodeId || '');
      action.setAttribute('role', 'button');
      action.setAttribute('tabindex', '0');
      action.setAttribute('aria-label', 'عرض الفروع أو الانتقال للأمام');
      action.style.cursor = 'pointer';
      const cx = box.x + box.width - 3;
      const cy = box.y + box.height / 2;
      const circle = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(cy));
      circle.setAttribute('r', '13');
      circle.setAttribute('fill', '#10b981');
      circle.setAttribute('stroke', '#ecfdf5');
      circle.setAttribute('stroke-width', '2');
      const arrow = window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', `M ${cx - 3} ${cy - 5} L ${cx + 3} ${cy} L ${cx - 3} ${cy + 5}`);
      arrow.setAttribute('fill', 'none');
      arrow.setAttribute('stroke', '#022c22');
      arrow.setAttribute('stroke-width', '2.4');
      arrow.setAttribute('stroke-linecap', 'round');
      arrow.setAttribute('stroke-linejoin', 'round');
      action.append(circle, arrow);
      node.appendChild(action);
    });
    const handleClick = (event: Event) => {
      const target = event.target as Element | null;
      const action = target?.closest?.('.mm-node-action[data-node-id]') as SVGGElement | null;
      const node = target?.closest?.('.mm-node[data-node-id]') as SVGGElement | null;
      const nodeId = action?.dataset.nodeId || node?.dataset.nodeId;
      if (!nodeId) return;
      setSelectedNodeId(nodeId);
      if (action) {
        event.stopPropagation();
        const hasChildren = mapDocument.nodes.some((item) => item.parentId === nodeId);
        if (hasChildren && !isSequentialMode) {
          setCollapsedIds((previous) => {
            const next = new Set(previous);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
          });
        } else {
          const currentIndex = sequenceNodes.findIndex((item) => item.id === nodeId);
          const nextNode = sequenceNodes[currentIndex + 1];
          if (nextNode) {
            setIsSequentialMode(true);
            setSequenceIndex(currentIndex + 1);
            setSelectedNodeId(nextNode.id);
          }
        }
        return;
      }
      if (isSequentialMode) {
        const index = sequenceNodes.findIndex((item) => item.id === nodeId);
        if (index >= 0) setSequenceIndex(index);
      }
    };
    const handleDoubleClick = (event: Event) => {
      const target = event.target as Element | null;
      const node = target?.closest?.('.mm-node[data-node-id]') as SVGGElement | null;
      const nodeId = node?.dataset.nodeId;
      if (!nodeId) return;
      const hasChildren = mapDocument.nodes.some((item) => item.parentId === nodeId);
      if (!hasChildren || isSequentialMode) return;
      event.preventDefault();
      setCollapsedIds((previous) => {
        const next = new Set(previous);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    };
    svg.addEventListener('click', handleClick);
    svg.addEventListener('dblclick', handleDoubleClick);
    return () => {
      svg.removeEventListener('click', handleClick);
      svg.removeEventListener('dblclick', handleDoubleClick);
    };
  }, [svgMarkup, mapDocument.nodes, isSequentialMode]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fitToView());
    const handleResize = () => fitToView();
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
    };
  }, [fitToView]);

  useEffect(() => {
    const svg = stageRef.current?.querySelector('svg');
    if (!svg) return;
    svg.querySelectorAll('.mm-node').forEach((node) => node.classList.remove('selected'));
    if (selectedNodeId) {
      const selected = Array.from(svg.querySelectorAll('.mm-node')).find((node) => (node as SVGGElement).dataset.nodeId === selectedNodeId);
      selected?.classList.add('selected');
      const frame = window.requestAnimationFrame(() => focusNode(selectedNodeId));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [selectedNodeId, svgMarkup, focusNode]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    if (pointersRef.current.size >= 2) {
      const points = Array.from(pointersRef.current.values()).slice(0, 2);
      const center = midpoint(points[0], points[1]);
      const rect = viewportRef.current?.getBoundingClientRect();
      const localCenter = { x: center.x - (rect?.left || 0), y: center.y - (rect?.top || 0) };
      gestureRef.current = {
        type: 'pinch',
        startDistance: Math.max(1, distance(points[0], points[1])),
        startScale: zoom,
        worldX: (localCenter.x - pan.x) / zoom,
        worldY: (localCenter.y - pan.y) / zoom,
        moved: false
      };
      return;
    }
    const target = event.target as Element;
    if (target.closest?.('.mm-node-action')) {
      gestureRef.current = null;
      return;
    }
    const node = target.closest?.('.mm-node[data-node-id]') as SVGGElement | null;
    gestureRef.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      nodeId: node?.dataset.nodeId,
      moved: false
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointersRef.current.values());
    const gesture = gestureRef.current;
    if (points.length >= 2 && gesture?.type === 'pinch') {
      const center = midpoint(points[0], points[1]);
      const rect = viewportRef.current?.getBoundingClientRect();
      const localCenter = { x: center.x - (rect?.left || 0), y: center.y - (rect?.top || 0) };
      const nextZoom = Math.max(0.18, Math.min(3.2, gesture.startScale * distance(points[0], points[1]) / gesture.startDistance));
      gesture.moved = true;
      applyTransform(nextZoom, {
        x: localCenter.x - gesture.worldX * nextZoom,
        y: localCenter.y - gesture.worldY * nextZoom
      });
      return;
    }
    if (points.length === 1 && gesture?.type === 'pan') {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > 5) gesture.moved = true;
      if (gesture.moved && !gesture.nodeId) {
        applyTransform(zoom, { x: gesture.originX + dx, y: gesture.originY + dy });
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.type === 'pan' && gesture.pointerId === event.pointerId && !gesture.moved && gesture.nodeId) {
      setSelectedNodeId(gesture.nodeId);
    }
    pointersRef.current.delete(event.pointerId);
    const remaining = Array.from(pointersRef.current.entries());
    if (remaining.length === 1) {
      const [pointerId, point] = remaining[0];
      gestureRef.current = {
        type: 'pan',
        pointerId,
        startX: point.x,
        startY: point.y,
        originX: pan.x,
        originY: pan.y,
        moved: true
      };
    } else {
      gestureRef.current = null;
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const cursor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const nextZoom = Math.max(0.18, Math.min(3.2, zoom * (event.deltaY < 0 ? 1.12 : 0.89)));
    const worldX = (cursor.x - pan.x) / zoom;
    const worldY = (cursor.y - pan.y) / zoom;
    applyTransform(nextZoom, { x: cursor.x - worldX * nextZoom, y: cursor.y - worldY * nextZoom });
  };

  const handleShare = async () => {
    const safeName = (mapDocument.title || 'mind-map').replace(/[^\w\u0600-\u06FF-]+/g, '-').slice(0, 48);
    const result = await shareFileWithVerification({
      filename: `${safeName || 'mind-map'}.html`,
      content: buildStandaloneMindMapHtml(mapDocument, fullLayout, isDark),
      mime: 'text/html;charset=utf-8',
      title: mapDocument.title || 'UMEDT Mind Map',
      text: `خريطة ذهنية تفاعلية مستقلة: ${mapDocument.title || 'UMEDT Mind Map'}`
    });
    showToast?.(result.messageAr);
  };

  const toggleBrowserFullscreen = async () => {
    try {
      if (window.document.fullscreenElement) await window.document.exitFullscreen();
      else await window.document.documentElement.requestFullscreen?.();
    } catch {
      showToast?.('تعذر تفعيل ملء الشاشة في هذا المتصفح', 'info');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex flex-col overflow-hidden bg-slate-950 text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/25 via-slate-950 to-slate-950" />
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950/75 px-3 py-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black tracking-wide sm:text-base">{mapDocument.title || 'الخريطة الذهنية'}</div>
          <div className="text-[10px] font-semibold text-slate-400">اسحب للتحريك · استخدم إصبعين للتكبير والتصغير</div>
        </div>
        <div className="flex shrink-0 max-w-full items-center gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => { const next = !isSequentialMode; setIsSequentialMode(next); if (next && sequenceNodes.length) { setSequenceIndex(0); setSelectedNodeId(sequenceNodes[0].id); } else { setCollapsedIds(new Set()); } }} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold whitespace-nowrap ${isSequentialMode ? 'border-emerald-400 bg-emerald-400 text-slate-950' : 'border-white/15 bg-white/5 hover:bg-white/10'}`} title="العرض التسلسلي">{isSequentialMode ? 'العرض الحر' : 'عرض تسلسلي'}</button>
          {!isSequentialMode && <>
            <button type="button" onClick={() => setCollapsedIds(new Set(mapDocument.nodes.filter((node) => mapDocument.nodes.some((child) => child.parentId === node.id)).map((node) => node.id)))} className="min-h-10 shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-bold whitespace-nowrap hover:bg-white/10" title="طي جميع الفروع">طي الفروع</button>
            <button type="button" onClick={() => setCollapsedIds(new Set())} className="min-h-10 shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-bold whitespace-nowrap hover:bg-white/10" title="توسيع جميع الفروع">توسيع الكل</button>
          </>}
          <button type="button" onClick={fitToView} className="min-h-10 shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-bold whitespace-nowrap hover:bg-white/10" title="ملاءمة الخريطة للشاشة">ملاءمة</button>
          <button type="button" onClick={() => void handleShare()} className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-400 px-3 text-xs font-black text-slate-950 hover:bg-emerald-300" title="مشاركة HTML تفاعلي"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">مشاركة HTML</span></button>
          <button type="button" onClick={() => void toggleBrowserFullscreen()} className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5" title="ملء الشاشة"><Maximize2 className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="flex min-h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:bg-rose-500/20" title="إغلاق"><X className="h-4 w-4" /></button>
        </div>
      </header>
      <main
        ref={viewportRef}
        className="relative z-0 min-h-0 flex-1 overflow-hidden touch-none select-none"
        style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,.16) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div ref={stageRef} className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }} />
        {isSequentialMode && selectedNode && (
          <div className="absolute top-3 left-3 right-3 z-10 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-slate-900/90 p-2.5 text-white shadow-xl backdrop-blur-xl">
            <button type="button" disabled={sequenceIndex <= 0} onClick={() => { const next = Math.max(0, sequenceIndex - 1); setSequenceIndex(next); setSelectedNodeId(sequenceNodes[next]?.id || null); }} className="min-h-10 rounded-xl border border-white/15 px-3 text-xs font-bold disabled:opacity-40">السابق</button>
            <div className="min-w-0 flex-1 text-center"><div className="truncate text-xs font-black">{selectedNode.label}</div><div className="mt-0.5 text-[10px] text-slate-400">{sequenceIndex + 1} / {sequenceNodes.length}</div></div>
            <button type="button" disabled={sequenceIndex >= sequenceNodes.length - 1} onClick={() => { const next = Math.min(sequenceNodes.length - 1, sequenceIndex + 1); setSequenceIndex(next); setSelectedNodeId(sequenceNodes[next]?.id || null); }} className="min-h-10 rounded-xl bg-emerald-400 px-3 text-xs font-black text-slate-950 disabled:opacity-40">التالي</button>
          </div>
        )}
        {selectedNode && (
          <div className="absolute bottom-3 left-3 right-3 z-10 mx-auto max-h-[38%] max-w-3xl overflow-y-auto rounded-3xl border border-emerald-400/30 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-xl sm:bottom-5 sm:p-5">
            {selectedNodePath.length > 1 && <div className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">{selectedNodePath.map((node, index) => <React.Fragment key={node.id}>{index > 0 && <span aria-hidden="true">‹</span>}<span className={index === selectedNodePath.length - 1 ? 'font-black text-emerald-300' : ''}>{node.label}</span></React.Fragment>)}</div>}
            <div className="text-lg font-black text-emerald-300 sm:text-xl">{selectedNode.label}</div>
            {(selectedNode.sublabel || selectedNode.note) && <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-100">{[selectedNode.sublabel, selectedNode.note].filter(Boolean).join(' · ')}</p>}
            <button type="button" onClick={() => setSelectedNodeId(null)} className="mt-2 text-[10px] font-bold text-slate-400 hover:text-white">إخفاء التفاصيل</button>
          </div>
        )}
        {!selectedNode && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/65 px-3 py-1 text-[10px] font-semibold text-slate-400 backdrop-blur sm:bottom-5">
          انقر على العقدة لعرض تفاصيلها · انقر مرتين لطي الفروع
        </div>}
      </main>
    </div>
  );
};
