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
  const onCloseRef = useRef(onClose);
  const historyEntryRef = useRef(false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const overlayWindow = window as Window & { __umedtMindMapViewerOpen?: boolean };
    overlayWindow.__umedtMindMapViewerOpen = true;
    window.history.pushState({ ...(window.history.state || {}), umedtMindMapViewer: true }, '', window.location.href);
    historyEntryRef.current = true;
    const handlePopState = () => {
      historyEntryRef.current = false;
      overlayWindow.__umedtMindMapViewerOpen = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      overlayWindow.__umedtMindMapViewerOpen = false;
    };
  }, []);
  const requestClose = useCallback(() => {
    if (historyEntryRef.current) {
      historyEntryRef.current = false;
      window.history.back();
    } else {
      onCloseRef.current();
    }
  }, []);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSequentialMode, setIsSequentialMode] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    // Mobile-first overview: show the root and its first-level branches; keep deeper branches folded.
    () => new Set(mapDocument.nodes.filter((node) => node.id !== mapDocument.rootNodeId && mapDocument.nodes.some((child) => child.parentId === node.id)).map((node) => node.id))
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

  const selectNodeAndRevealFirstChild = useCallback((nodeId: string) => {
    const targetId = nodeId;
    // Reveal every ancestor so the focused child exists in the rendered SVG.
    if (!isSequentialMode && firstChild) {
      const byId = new Map(mapDocument.nodes.map((node) => [node.id, node]));
      setCollapsedIds((previous) => {
        const next = new Set(previous);
        let parentId: string | null = firstChild.parentId;
        while (parentId) {
          next.delete(parentId);
          parentId = byId.get(parentId)?.parentId || null;
        }
        return next;
      });
    }
    setSelectedNodeId(targetId);
    if (isSequentialMode) {
      const index = sequenceNodes.findIndex((node) => node.id === targetId);
      if (index >= 0) setSequenceIndex(index);
    }
  }, [mapDocument.nodes, isSequentialMode, sequenceNodes]);

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
    // Keep the focused node inside the unobstructed canvas area when the details sheet is open.
    const reservedBottom = selectedNodeId
      ? Math.min(164, viewport.clientHeight * 0.18)
      : 0;
    const usableHeight = Math.max(160, viewport.clientHeight - reservedBottom - 16);
    // Keep context around the selected node instead of zooming into a single card.
    const scale = Math.max(0.72, Math.min(1.25, zoom));
    applyTransform(scale, {
      x: viewport.clientWidth / 2 - (bounds.x + bounds.width / 2) * scale,
      y: usableHeight * 0.48 - (bounds.y + bounds.height / 2) * scale
    });
  }, [applyTransform, selectedNodeId, zoom]);

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    const svg = stageRef.current?.querySelector('svg');
    if (!viewport || !svg) return;
    const values = (svg.getAttribute('viewBox') || '0 0 900 600').trim().split(/[ ,]+/).map(Number);
    const minX = values[0] || 0;
    const minY = values[1] || 0;
    const width = Math.max(1, values[2] || 900);
    const height = Math.max(1, values[3] || 600);
    // Reserve the bottom details-sheet area so nodes are fitted to the visible canvas,
    // rather than being placed underneath the card on short Android screens.
    const reservedBottom = selectedNodeId
      ? Math.min(164, viewport.clientHeight * 0.18)
      : 0;
    const usableHeight = Math.max(160, viewport.clientHeight - reservedBottom - 16);
    const scale = Math.max(0.2, Math.min(1.8, Math.min(
      viewport.clientWidth / width,
      usableHeight / height
    ) * 1.02));
    applyTransform(scale, {
      x: (viewport.clientWidth - width * scale) / 2 - minX * scale,
      y: (usableHeight - height * scale) / 2 - minY * scale
    });
  }, [applyTransform, svgMarkup, selectedNodeId]);

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
      if (action) {
        setSelectedNodeId(nodeId);
        event.stopPropagation();
        const hasChildren = mapDocument.nodes.some((item) => item.parentId === nodeId);
        if (hasChildren && !isSequentialMode) {
          setCollapsedIds((previous) => {
            const next = new Set(previous);
            if (next.has(nodeId)) next.delete(nodeId);
            else next.add(nodeId);
            return next;
          });
        }
        return;
      }
      selectNodeAndRevealFirstChild(nodeId);
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
  }, [svgMarkup, mapDocument.nodes, isSequentialMode, sequenceNodes, selectNodeAndRevealFirstChild]);

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
      selectNodeAndRevealFirstChild(gesture.nodeId);
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
    <div className={`fixed inset-0 z-[120] flex flex-col overflow-hidden ${isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`} dir="rtl">
      <header className={`relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 pt-[max(10px,env(safe-area-inset-top))] backdrop-blur-xl sm:flex-nowrap sm:px-5 ${isDark ? "border-slate-800 bg-slate-950/95 text-white" : "border-slate-200 bg-white/95 text-slate-900"}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black tracking-wide sm:text-base">{mapDocument.title || 'الخريطة الذهنية'}</div>
          <div className="text-[10px] font-semibold text-slate-400">اسحب للتحريك · استخدم إصبعين للتكبير والتصغير</div>
        </div>
        <div className="flex shrink-0 max-w-full items-center gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => { const next = !isSequentialMode; setIsSequentialMode(next); if (next && sequenceNodes.length) { setSequenceIndex(0); setSelectedNodeId(sequenceNodes[0].id); } else { setCollapsedIds(new Set(mapDocument.nodes.filter((node) => node.id !== mapDocument.rootNodeId && mapDocument.nodes.some((child) => child.parentId === node.id)).map((node) => node.id))); } }} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold whitespace-nowrap ${isSequentialMode ? 'border-emerald-400 bg-emerald-400 text-slate-950' : isDark ? 'border-white/15 bg-white/5 text-white hover:bg-white/10' : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'}`} title="العرض التسلسلي">{isSequentialMode ? 'العرض الحر' : 'عرض تسلسلي'}</button>
          {!isSequentialMode && <>
            <button type="button" onClick={() => setCollapsedIds(new Set(mapDocument.nodes.filter((node) => node.id !== mapDocument.rootNodeId && mapDocument.nodes.some((child) => child.parentId === node.id)).map((node) => node.id)))} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold whitespace-nowrap ${isDark ? "border-white/15 bg-white/5 text-white hover:bg-white/10" : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"}`} title="طي جميع الفروع">طي الفروع</button>
            <button type="button" onClick={() => { if (!selectedNodeId) return; setCollapsedIds((previous) => { const next = new Set(previous); next.delete(selectedNodeId); return next; }); }} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold whitespace-nowrap ${isDark ? "border-white/15 bg-white/5 text-white hover:bg-white/10" : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"}`} title="إظهار فروع العقدة المحددة فقط">توسيع الفرع المحدد</button>
          </>}
          <button type="button" onClick={fitToView} className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold whitespace-nowrap ${isDark ? "border-white/15 bg-white/5 text-white hover:bg-white/10" : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200"}`} title="ملاءمة الخريطة للشاشة">ملاءمة</button>
          <button type="button" onClick={() => void handleShare()} className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-400 px-3 text-xs font-black text-slate-950 hover:bg-emerald-300" title="مشاركة HTML تفاعلي"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">مشاركة HTML</span></button>
          <button type="button" onClick={() => void toggleBrowserFullscreen()} className={`flex min-h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isDark ? "border-white/15 bg-white/5 text-white" : "border-slate-300 bg-slate-100 text-slate-800"}`} title="ملء الشاشة"><Maximize2 className="h-4 w-4" /></button>
          <button type="button" onClick={requestClose} className={`flex min-h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isDark ? "border-white/15 bg-white/5 text-white hover:bg-rose-500/20" : "border-slate-300 bg-slate-100 text-slate-800 hover:bg-rose-100"}`} title="إغلاق"><X className="h-4 w-4" /></button>
        </div>
      </header>
      <main
        ref={viewportRef}
        className="relative z-0 min-h-0 flex-1 overflow-hidden touch-none select-none"
        style={{ backgroundColor: isDark ? '#0f172a' : '#f8fafc', backgroundImage: isDark ? 'radial-gradient(circle, rgba(148,163,184,.16) 1px, transparent 1px)' : 'radial-gradient(circle, rgba(100,116,139,.12) 1px, transparent 1px)', backgroundSize: '24px 24px' }}
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
          <div className={`absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-2 right-2 z-10 mx-auto max-h-[min(18dvh,164px)] max-w-3xl overflow-y-auto rounded-2xl border p-2.5 shadow-2xl backdrop-blur-xl sm:bottom-4 sm:p-3 ${isDark ? "border-emerald-400/30 bg-slate-900/95 text-white" : "border-slate-300 bg-white/95 text-slate-900"}`}>
            {selectedNodePath.length > 1 && <div className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">{selectedNodePath.map((node, index) => <React.Fragment key={node.id}>{index > 0 && <span aria-hidden="true">‹</span>}<span className={index === selectedNodePath.length - 1 ? 'font-black text-emerald-300' : ''}>{node.label}</span></React.Fragment>)}</div>}
            <div className={`text-base font-black sm:text-lg ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{selectedNode.label}</div>
            {selectedNode.sublabel && <p className={`mt-1 text-xs font-semibold ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>{selectedNode.sublabel}</p>}
            {selectedNode.note && <p className={`mt-1 max-h-12 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] ${isDark ? "text-slate-100" : "text-slate-700"}`}>{selectedNode.note}</p>}
            {!selectedNode.note && !selectedNode.sublabel && <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>لا توجد تفاصيل إضافية لهذه العقدة.</p>}
            {mapDocument.nodes.filter((node) => node.parentId === selectedNode.id).sort((a,b) => (a.order ?? 0) - (b.order ?? 0)).length > 0 && <div className="mt-2 flex max-w-full gap-2 overflow-x-auto pb-1">{mapDocument.nodes.filter((node) => node.parentId === selectedNode.id).sort((a,b) => (a.order ?? 0) - (b.order ?? 0)).map((child) => <button key={child.id} type="button" onClick={() => selectNodeAndRevealFirstChild(child.id)} className={`max-w-full rounded-xl border px-3 py-1.5 text-xs font-bold ${isDark ? "border-white/15 bg-white/5 text-slate-100" : "border-slate-300 bg-slate-100 text-slate-800"}`}>{child.label}</button>)}</div>}
            <button type="button" onClick={() => setSelectedNodeId(null)} className={`mt-1 text-[10px] font-bold ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}>إخفاء التفاصيل</button>
          </div>
        )}
        {!selectedNode && <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/65 px-3 py-1 text-[10px] font-semibold text-slate-400 backdrop-blur sm:bottom-5">
          انقر على العقدة لعرض تفاصيلها · انقر مرتين لطي الفروع
        </div>}
      </main>
    </div>
  );
};
