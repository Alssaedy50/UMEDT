import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GitBranch,
  Layers,
  Maximize2,
  Minus,
  Plus,
  MoreVertical,
  X
} from 'lucide-react';
import { MindMapColorMode, MindMapDocument, MindMapStyle } from '../types/mindMap';
import { MIND_MAP_COLOR_SWATCHES } from '../services/mindMapColorEngine';
import { computeMindMapLayout } from '../services/mindMapLayoutEngine';
import { buildStandaloneMindMapSvg, upsertMindMap } from '../services/mindMapStorageService';
import { buildStandaloneMindMapHtmlV2 as buildStandaloneMindMapHtml } from '../services/mindMapStandaloneExportServiceV2';
import { prepareAndDownloadFile } from '../utils/downloadHelper';

interface MindMapFullScreenViewerProps {
  mapDocument: MindMapDocument;
  onClose: () => void;
  showToast?: (message: string, type?: string) => void;
  onChangeDocument?: (nextDoc: MindMapDocument) => void;
}

type PointerPoint = { x: number; y: number };
type Gesture =
  | {
      type: 'pan';
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
      nodeId?: string;
      actionNodeId?: string;
      edgeId?: string;
      moved: boolean;
    }
  | {
      type: 'pinch';
      startDistance: number;
      startScale: number;
      worldX: number;
      worldY: number;
      moved: boolean;
    }
  | null;

const STYLE_OPTIONS: Array<{ id: MindMapStyle; labelAr: string }> = [
  { id: 'radial', labelAr: 'شعاعية' },
  { id: 'hierarchical', labelAr: 'هرمية' },
  { id: 'medical_flow', labelAr: 'مسار سريري' }
];

function distance(a: PointerPoint, b: PointerPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: PointerPoint, b: PointerPoint): PointerPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export const MindMapFullScreenViewer: React.FC<MindMapFullScreenViewerProps> = ({
  mapDocument,
  onClose,
  showToast,
  onChangeDocument
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const gestureRef = useRef<Gesture>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isAnimatingTransform, setIsAnimatingTransform] = useState(false);
  const transformRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const onCloseRef = useRef(onClose);
  const historyEntryRef = useRef(false);
  const initialCameraMapIdRef = useRef<string | null>(null);
  const toolsContainerRef = useRef<HTMLDivElement | null>(null);

  // Active style (user can freely switch between radial, hierarchical, medical_flow)
  const [activeStyle, setActiveStyle] = useState<MindMapStyle>(mapDocument.style || 'radial');
  useEffect(() => {
    setActiveStyle(mapDocument.style || 'radial');
  }, [mapDocument.id, mapDocument.style]);

  // Individual node show/hide control (allows hiding any main or sub-node)
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(() => new Set());
  const [showNodesPanel, setShowNodesPanel] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const [showRelationships, setShowRelationships] = useState(true);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeColorMode, setActiveColorMode] = useState<MindMapColorMode>(mapDocument.colorMode || 'branch');
  const [selectedSwatchColor, setSelectedSwatchColor] = useState<string>(MIND_MAP_COLOR_SWATCHES[0].base);

  useEffect(() => {
    setActiveColorMode(mapDocument.colorMode || 'branch');
  }, [mapDocument.id, mapDocument.colorMode]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (toolsContainerRef.current && !toolsContainerRef.current.contains(event.target as Node)) setShowToolsMenu(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const overlayWindow = window as Window & { __umedtMindMapViewerOpen?: boolean };
    overlayWindow.__umedtMindMapViewerOpen = true;
    window.history.pushState(
      { ...(window.history.state || {}), umedtMindMapViewer: true },
      '',
      window.location.href
    );
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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedNodeIdRef.current = selectedNodeId;
  }, [selectedNodeId]);

  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const [isSequentialMode, setIsSequentialMode] = useState(false);
  const [sequenceIndex, setSequenceIndex] = useState(0);

  const buildDefaultCollapsedSet = useCallback(
    () =>
      new Set(
        mapDocument.nodes
          .filter(
            (node) =>
              node.id !== mapDocument.rootNodeId &&
              mapDocument.nodes.some((child) => child.parentId === node.id)
          )
          .map((node) => node.id)
      ),
    [mapDocument.nodes, mapDocument.rootNodeId]
  );

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() =>
    buildDefaultCollapsedSet()
  );

  const isDark =
    typeof window !== 'undefined' &&
    window.document.documentElement.classList.contains('dark');

  // Compute all nodes hidden by explicit user hide (including their descendants)
  const effectiveHiddenIds = useMemo(() => {
    if (hiddenNodeIds.size === 0) return new Set<string>();
    const hidden = new Set<string>();
    hiddenNodeIds.forEach((id) => {
      if (id !== mapDocument.rootNodeId) hidden.add(id);
    });
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of mapDocument.nodes) {
        if (n.parentId && hidden.has(n.parentId) && !hidden.has(n.id)) {
          hidden.add(n.id);
          changed = true;
        }
      }
    }
    return hidden;
  }, [hiddenNodeIds, mapDocument.nodes, mapDocument.rootNodeId]);

  const styledDocument = useMemo<MindMapDocument>(() => {
    const styleChanged = activeStyle !== mapDocument.style;
    const filteredNodes = mapDocument.nodes
      .filter((n) => !effectiveHiddenIds.has(n.id))
      .map((n) => (styleChanged ? { ...n, position: undefined } : n));
    const validIds = new Set(filteredNodes.map((n) => n.id));
    return {
      ...mapDocument,
      style: activeStyle,
      nodes: filteredNodes,
      edges: mapDocument.edges.filter(
        (e) => validIds.has(e.sourceId) && validIds.has(e.targetId)
      )
    };
  }, [mapDocument, activeStyle, effectiveHiddenIds]);

  const childCountMap = useMemo(() => {
    const counts = new Map<string, number>();
    styledDocument.nodes.forEach((n) => {
      if (n.parentId) {
        counts.set(n.parentId, (counts.get(n.parentId) || 0) + 1);
      }
    });
    return counts;
  }, [styledDocument.nodes]);

  const sequenceNodes = useMemo(() => {
    const byParent = new Map<string, typeof styledDocument.nodes>();
    styledDocument.nodes.forEach((node) => {
      const key = node.parentId || '__root__';
      byParent.set(key, [...(byParent.get(key) || []), node]);
    });
    const ordered: typeof styledDocument.nodes = [];
    const visited = new Set<string>();
    const visit = (id: string) => {
      const node = styledDocument.nodes.find((item) => item.id === id);
      if (!node || visited.has(id)) return;
      visited.add(id);
      ordered.push(node);
      (byParent.get(id) || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach((child) => visit(child.id));
    };
    visit(styledDocument.rootNodeId);
    styledDocument.nodes.forEach((node) => visit(node.id));
    return ordered;
  }, [styledDocument]);

  const sequentialVisibleIds = useMemo(() => {
    const current =
      sequenceNodes[Math.min(sequenceIndex, Math.max(0, sequenceNodes.length - 1))];
    if (!current) return new Set<string>();
    const visible = new Set<string>([current.id]);
    const nodeById = new Map(styledDocument.nodes.map((node) => [node.id, node]));
    let parentId = current.parentId;
    while (parentId && nodeById.has(parentId) && !visible.has(parentId)) {
      visible.add(parentId);
      parentId = nodeById.get(parentId)?.parentId || null;
    }
    if (current.parentId) {
      styledDocument.nodes
        .filter((node) => node.parentId === current.parentId)
        .forEach((node) => visible.add(node.id));
    }
    styledDocument.nodes
      .filter((node) => node.parentId === current.id)
      .forEach((node) => visible.add(node.id));
    return visible;
  }, [styledDocument.nodes, sequenceNodes, sequenceIndex]);

  const displayDocument = useMemo(() => {
    if (!isSequentialMode) return styledDocument;
    const nodes = styledDocument.nodes.filter((node) => sequentialVisibleIds.has(node.id));
    const visibleIds = new Set(nodes.map((node) => node.id));
    return {
      ...styledDocument,
      nodes,
      edges: styledDocument.edges.filter(
        (edge) => visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)
      )
    };
  }, [styledDocument, isSequentialMode, sequentialVisibleIds]);

  const layout = useMemo(
    () => computeMindMapLayout(displayDocument, isSequentialMode ? new Set() : collapsedIds),
    [displayDocument, isSequentialMode, collapsedIds]
  );

  const fullLayout = useMemo(
    () => computeMindMapLayout(styledDocument, new Set()),
    [styledDocument]
  );

  const svgMarkup = useMemo(
    () =>
      buildStandaloneMindMapSvg(displayDocument, layout, isDark).replace(
        /^<\?xml[^>]*>\s*/,
        ''
      ),
    [displayDocument, layout, isDark]
  );

  const selectedNode = useMemo(
    () => styledDocument.nodes.find((node) => node.id === selectedNodeId) || null,
    [styledDocument.nodes, selectedNodeId]
  );

  const selectedNodePath = useMemo(() => {
    if (!selectedNode) return [];
    const byId = new Map(styledDocument.nodes.map((node) => [node.id, node]));
    const path: typeof styledDocument.nodes = [];
    const seen = new Set<string>();
    let current: typeof selectedNode | undefined = selectedNode;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  }, [styledDocument.nodes, selectedNode]);

  const applyTransform = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }, animate = false) => {
      transformRef.current = { zoom: nextZoom, pan: nextPan };
      setIsAnimatingTransform(animate);
      setZoom(nextZoom);
      setPan(nextPan);
      if (stageRef.current) {
        stageRef.current.style.transition = animate
          ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
          : 'none';
        stageRef.current.style.transform = `translate3d(${nextPan.x}px, ${nextPan.y}px, 0) scale(${nextZoom})`;
      }
    },
    []
  );

  /**
   * Frames a target node AND all of its currently visible direct child cards
   * inside the visible viewport area (above the bottom details sheet).
   * Notice that SVG viewBox="${layout.bounds.minX} ${layout.bounds.minY} ${width} ${height}"
   * ALREADY shifts user-space coordinates by (-layout.bounds.minX, -layout.bounds.minY),
   * so any user-space point (ux, uy) is located at CSS pixel (ux - minX, uy - minY) inside stageRef!
   */
  const focusNodeCluster = useCallback(
    (nodeId: string, includeParent = false) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const targetPositioned = layout.nodes.find((n) => n.node.id === nodeId);
      if (!targetPositioned) return;

      const clusterNodes = [targetPositioned];
      // Always include currently visible direct child cards so revealed cards never get clipped off-screen
      layout.nodes.forEach((n) => {
        if (n.node.parentId === nodeId) {
          clusterNodes.push(n);
        }
      });
      if ((includeParent || isSequentialMode) && targetPositioned.node.parentId) {
        const parentPositioned = layout.nodes.find(
          (n) => n.node.id === targetPositioned.node.parentId
        );
        if (parentPositioned) clusterNodes.push(parentPositioned);
      }

      const vbMinX = layout.bounds.minX;
      const vbMinY = layout.bounds.minY;

      let minLocalX = Infinity;
      let minLocalY = Infinity;
      let maxLocalX = -Infinity;
      let maxLocalY = -Infinity;

      for (const pn of clusterNodes) {
        const localLeft = pn.x - pn.width / 2 - vbMinX;
        const localTop = pn.y - pn.height / 2 - vbMinY;
        const localRight = pn.x + pn.width / 2 - vbMinX;
        const localBottom = pn.y + pn.height / 2 + 16 - vbMinY;
        if (localLeft < minLocalX) minLocalX = localLeft;
        if (localTop < minLocalY) minLocalY = localTop;
        if (localRight > maxLocalX) maxLocalX = localRight;
        if (localBottom > maxLocalY) maxLocalY = localBottom;
      }

      const padX = 28;
      const padY = 28;
      const clusterW = Math.max(140, maxLocalX - minLocalX + padX * 2);
      const clusterH = Math.max(90, maxLocalY - minLocalY + padY * 2);
      const localCenterX = (minLocalX + maxLocalX) / 2;
      const localCenterY = (minLocalY + maxLocalY) / 2;

      const topInset = isSequentialMode ? 68 : 14;
      const reservedBottom = Math.min(215, viewport.clientHeight * 0.29) + 14;
      const usableWidth = Math.max(200, viewport.clientWidth - 20);
      const usableHeight = Math.max(150, viewport.clientHeight - topInset - reservedBottom);

      const fitScale = Math.min(usableWidth / clusterW, usableHeight / clusterH);
      const currentZoom = transformRef.current.zoom;
      const nextScale =
        clusterNodes.length > 1
          ? Math.max(0.22, Math.min(1.12, fitScale))
          : Math.max(0.68, Math.min(1.15, Math.min(currentZoom < 0.68 ? 0.92 : currentZoom, fitScale)));

      const targetScreenX = viewport.clientWidth / 2;
      const targetScreenY = topInset + usableHeight / 2;

      applyTransform(
        nextScale,
        {
          x: targetScreenX - localCenterX * nextScale,
          y: targetScreenY - localCenterY * nextScale
        },
        true
      );
    },
    [layout, isSequentialMode, applyTransform]
  );

  const focusPrimaryOverview = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const primaryNodes = layout.nodes.filter((node) => node.node.id === mapDocument.rootNodeId || node.depth === 1);
    if (!primaryNodes.length) return;
    const minX = Math.min(...primaryNodes.map((node) => node.x - node.width / 2));
    const maxX = Math.max(...primaryNodes.map((node) => node.x + node.width / 2));
    const minY = Math.min(...primaryNodes.map((node) => node.y - node.height / 2));
    const maxY = Math.max(...primaryNodes.map((node) => node.y + node.height / 2));
    const clusterWidth = Math.max(1, maxX - minX + 56);
    const clusterHeight = Math.max(1, maxY - minY + 56);
    const topInset = 12;
    const reservedBottom = Math.min(190, viewport.clientHeight * 0.24);
    const usableWidth = Math.max(200, viewport.clientWidth - 24);
    const usableHeight = Math.max(150, viewport.clientHeight - topInset - reservedBottom);
    const fitScale = Math.min(usableWidth / clusterWidth, usableHeight / clusterHeight);
    const scale = viewport.clientWidth <= 640 ? Math.max(0.65, Math.min(0.8, fitScale)) : Math.min(1.1, fitScale);
    const centerX = (minX + maxX) / 2 - layout.bounds.minX;
    const centerY = (minY + maxY) / 2 - layout.bounds.minY;
    applyTransform(scale, { x: viewport.clientWidth / 2 - centerX * scale, y: topInset + usableHeight / 2 - centerY * scale }, true);
  }, [layout, mapDocument.rootNodeId, applyTransform]);

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const width = Math.max(1, layout.bounds.width || 900);
    const height = Math.max(1, layout.bounds.height || 600);
    const topInset = isSequentialMode ? 64 : 10;
    const reservedBottom = selectedNodeIdRef.current
      ? Math.min(190, viewport.clientHeight * 0.25)
      : 16;
    const usableWidth = Math.max(200, viewport.clientWidth - 16);
    const usableHeight = Math.max(150, viewport.clientHeight - topInset - reservedBottom);
    const scale = Math.max(
      0.16,
      Math.min(1.5, Math.min(usableWidth / width, usableHeight / height) * 0.95)
    );
    // Because <svg viewBox="minX minY width height" width="width" height="height"> already maps
    // (minX, minY) to CSS pixel (0, 0), the SVG's local pixel box is strictly [0..width, 0..height].
    applyTransform(
      scale,
      {
        x: (viewport.clientWidth - width * scale) / 2,
        y: topInset + (usableHeight - height * scale) / 2
      },
      true
    );
  }, [layout.bounds.width, layout.bounds.height, isSequentialMode, applyTransform]);

  const zoomByFactor = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const current = transformRef.current;
      const nextZoom = Math.max(0.16, Math.min(3.2, current.zoom * factor));
      const cx = viewport.clientWidth / 2;
      const cy = viewport.clientHeight * 0.42;
      const worldX = (cx - current.pan.x) / current.zoom;
      const worldY = (cy - current.pan.y) / current.zoom;
      applyTransform(
        nextZoom,
        {
          x: cx - worldX * nextZoom,
          y: cy - worldY * nextZoom
        },
        true
      );
    },
    [applyTransform]
  );

  const selectNodeAndRevealChildren = useCallback(
    (nodeId: string) => {
      const targetId = nodeId;
      if (!isSequentialMode) {
        const byId = new Map(styledDocument.nodes.map((node) => [node.id, node]));
        const hasChildren = (childCountMap.get(targetId) || 0) > 0;
        setCollapsedIds((previous) => {
          const next = new Set(previous);
          // Uncollapse all ancestors of targetId
          let parentId: string | null = byId.get(targetId)?.parentId || null;
          while (parentId) {
            next.delete(parentId);
            parentId = byId.get(parentId)?.parentId || null;
          }
          // If the tapped node itself has collapsed children, reveal its direct children
          if (hasChildren && next.has(targetId)) {
            next.delete(targetId);
          }
          return next;
        });
      }
      setSelectedEdgeId(null);
      setSelectedNodeId(targetId);
      setIsNoteExpanded(false);
      if (isSequentialMode) {
        const index = sequenceNodes.findIndex((node) => node.id === targetId);
        if (index >= 0) setSequenceIndex(index);
      }
    },
    [styledDocument.nodes, childCountMap, isSequentialMode, sequenceNodes]
  );

  const toggleNodeBranchCollapse = useCallback(
    (nodeId: string) => {
      const hasChildren = (childCountMap.get(nodeId) || 0) > 0;
      if (!hasChildren || isSequentialMode) return;
      setSelectedNodeId(nodeId);
      setCollapsedIds((previous) => {
        const next = new Set(previous);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
    },
    [childCountMap, isSequentialMode]
  );

  const toggleHideNode = useCallback(
    (nodeId: string) => {
      if (nodeId === mapDocument.rootNodeId) return;
      setHiddenNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
          if (selectedNodeIdRef.current === nodeId) {
            const node = mapDocument.nodes.find((n) => n.id === nodeId);
            setSelectedNodeId(node?.parentId || null);
          }
        }
        return next;
      });
    },
    [mapDocument.rootNodeId, mapDocument.nodes]
  );

  const persistDocumentUpdate = useCallback((nextDoc: MindMapDocument) => {
    if (onChangeDocument) onChangeDocument(nextDoc);
    else upsertMindMap(nextDoc);
  }, [onChangeDocument]);

  const handleColorModeSwitch = useCallback((nextMode: MindMapColorMode) => {
    setActiveColorMode(nextMode);
    persistDocumentUpdate({ ...mapDocument, colorMode: nextMode, updatedAt: new Date().toISOString() });
  }, [mapDocument, persistDocumentUpdate]);

  const applyColorToSelectedNode = useCallback((color: string) => {
    if (!selectedNodeId) return;
    setSelectedSwatchColor(color);
    persistDocumentUpdate({ ...mapDocument, nodes: mapDocument.nodes.map((node) => node.id === selectedNodeId ? { ...node, color } : node), updatedAt: new Date().toISOString() });
  }, [mapDocument, selectedNodeId, persistDocumentUpdate]);

  const applyColorToSelectedBranch = useCallback(() => {
    if (!selectedNodeId) return;
    const swatch = MIND_MAP_COLOR_SWATCHES.find((item) => item.base === selectedSwatchColor) || MIND_MAP_COLOR_SWATCHES[0];
    const children = new Map<string, string[]>();
    mapDocument.nodes.forEach((node) => { if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) || []), node.id]); });
    const depthById = new Map<string, number>();
    const visit = (id: string, depth: number, seen = new Set<string>()) => {
      if (seen.has(id)) return;
      seen.add(id);
      depthById.set(id, depth);
      (children.get(id) || []).forEach((childId) => visit(childId, depth + 1, seen));
    };
    visit(selectedNodeId, 0);
    persistDocumentUpdate({ ...mapDocument, nodes: mapDocument.nodes.map((node) => depthById.has(node.id) ? { ...node, color: swatch.shades[Math.min(depthById.get(node.id) || 0, swatch.shades.length - 1)] } : node), updatedAt: new Date().toISOString() });
    showToast?.('تم تطبيق اللون على العقدة وجميع فروعها');
  }, [mapDocument, selectedNodeId, selectedSwatchColor, persistDocumentUpdate, showToast]);

  const handleStyleSwitch = useCallback(
    (nextStyle: MindMapStyle) => {
      setActiveStyle(nextStyle);
      const updatedDoc: MindMapDocument = {
        ...mapDocument,
        style: nextStyle,
        nodes: mapDocument.nodes.map((n) => ({ ...n, position: undefined })),
        updatedAt: new Date().toISOString()
      };
      if (onChangeDocument) {
        onChangeDocument(updatedDoc);
      } else {
        upsertMindMap(updatedDoc);
      }
    },
    [mapDocument, onChangeDocument]
  );

  useEffect(() => {
    if (!stageRef.current) return;
    stageRef.current.innerHTML = svgMarkup;
    const svg = stageRef.current.querySelector('svg');
    if (!svg) return;
    svg.style.display = 'block';
    svg.style.maxWidth = 'none';
    svg.style.overflow = 'visible';

    // Add expand/collapse badge ONLY to nodes that actually have child branches
    if (!isSequentialMode) {
      svg.querySelectorAll<SVGGElement>('.mm-node[data-node-id]').forEach((node) => {
        if (node.querySelector('.mm-node-action')) return;
        const nodeId = node.dataset.nodeId || '';
        const childCount = childCountMap.get(nodeId) || 0;
        if (childCount <= 0 || nodeId === styledDocument.rootNodeId) return;

        const isCollapsed = collapsedIds.has(nodeId);
        const box = node.getBBox();
        const action = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
        action.setAttribute('class', 'mm-node-action');
        action.setAttribute('data-node-id', nodeId);
        action.setAttribute('role', 'button');
        action.setAttribute('tabindex', '0');
        action.setAttribute(
          'aria-label',
          isCollapsed ? `توسيع ${childCount} فروع` : 'طي الفرع'
        );
        action.style.cursor = 'pointer';

        const cx = box.x + box.width / 2;
        const cy = box.y + box.height + 2;
        const pillW = isCollapsed ? 36 : 26;
        const pillH = 20;

        const badgeRect = window.document.createElementNS(
          'http://www.w3.org/2000/svg',
          'rect'
        );
        badgeRect.setAttribute('x', String(cx - pillW / 2));
        badgeRect.setAttribute('y', String(cy - pillH / 2));
        badgeRect.setAttribute('width', String(pillW));
        badgeRect.setAttribute('height', String(pillH));
        badgeRect.setAttribute('rx', '10');
        badgeRect.setAttribute('fill', isCollapsed ? '#10b981' : isDark ? '#1e293b' : '#ffffff');
        badgeRect.setAttribute('stroke', isCollapsed ? '#047857' : '#10b981');
        badgeRect.setAttribute('stroke-width', '1.8');

        const badgeText = window.document.createElementNS(
          'http://www.w3.org/2000/svg',
          'text'
        );
        badgeText.setAttribute('x', String(cx));
        badgeText.setAttribute('y', String(cy + 3.5));
        badgeText.setAttribute('text-anchor', 'middle');
        badgeText.setAttribute('font-family', 'Cairo, system-ui, sans-serif');
        badgeText.setAttribute('font-size', '10.5');
        badgeText.setAttribute('font-weight', '900');
        badgeText.setAttribute(
          'fill',
          isCollapsed ? '#022c22' : isDark ? '#34d399' : '#047857'
        );
        badgeText.textContent = isCollapsed ? `+${childCount}` : '−';

        action.append(badgeRect, badgeText);
        node.appendChild(action);
      });
    }

    // Highlight selected node immediately after SVG render
    if (selectedNodeIdRef.current) {
      const selected = Array.from(svg.querySelectorAll('.mm-node')).find(
        (node) => (node as SVGGElement).dataset.nodeId === selectedNodeIdRef.current
      );
      selected?.classList.add('selected');
    }

    const handleDoubleClick = (event: Event) => {
      const target = event.target as Element | null;
      const node = target?.closest?.('.mm-node[data-node-id]') as SVGGElement | null;
      const nodeId = node?.dataset.nodeId;
      if (!nodeId) return;
      event.preventDefault();
      toggleNodeBranchCollapse(nodeId);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as Element | null;
      const action = target?.closest?.('.mm-node-action[data-node-id]') as SVGGElement | null;
      if (action?.dataset.nodeId) {
        event.preventDefault();
        toggleNodeBranchCollapse(action.dataset.nodeId);
        return;
      }
      const node = target?.closest?.('.mm-node[data-node-id]') as SVGGElement | null;
      if (node?.dataset.nodeId) {
        event.preventDefault();
        selectNodeAndRevealChildren(node.dataset.nodeId);
      }
    };

    svg.addEventListener('dblclick', handleDoubleClick);
    svg.addEventListener('keydown', handleKeyDown);
    return () => {
      svg.removeEventListener('dblclick', handleDoubleClick);
      svg.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    svgMarkup,
    styledDocument.rootNodeId,
    childCountMap,
    collapsedIds,
    isSequentialMode,
    isDark,
    selectNodeAndRevealChildren,
    toggleNodeBranchCollapse
  ]);

  // Elevate only the selected relationship (or all links attached to the selected node)
  // into the pointer-transparent overlay above cards.
  useEffect(() => {
    const svg = stageRef.current?.querySelector('svg');
    if (!svg) return;
    const overlay = svg.querySelector('.mm-active-edge-layer') as SVGGElement | null;
    if (!overlay) return;
    overlay.replaceChildren();
    const edgeGroups = Array.from(svg.querySelectorAll<SVGGElement>('.mm-edge[data-edge-id]'));
    const labelGroups = Array.from(svg.querySelectorAll<SVGGElement>('.mm-edge-label[data-edge-id]'));
    const activeEdges = edgeGroups.filter((edge) => {
      const from = edge.dataset.from || '';
      const to = edge.dataset.to || '';
      return selectedEdgeId
        ? edge.dataset.edgeId === selectedEdgeId
        : Boolean(selectedNodeId && (from === selectedNodeId || to === selectedNodeId));
    });
    const activeIds = new Set(activeEdges.map((edge) => edge.dataset.edgeId || ''));
    const activeNodeIds = new Set<string>();
    activeEdges.forEach((edge) => {
      if (edge.dataset.from) activeNodeIds.add(edge.dataset.from);
      if (edge.dataset.to) activeNodeIds.add(edge.dataset.to);
    });
    edgeGroups.forEach((edge) => {
      const isActive = activeIds.has(edge.dataset.edgeId || '');
      const cross = edge.dataset.kind === 'cross-link';
      edge.style.display = cross && !showRelationships ? 'none' : '';
      edge.style.opacity = (selectedNodeId || selectedEdgeId) && !isActive ? '0.12' : '';
      if (isActive && (!cross || showRelationships)) {
        const clone = edge.cloneNode(true) as SVGGElement;
        clone.style.opacity = '1';
        clone.querySelectorAll<SVGPathElement>('.mm-edge-path').forEach((path) => {
          path.setAttribute('opacity', '1');
          path.setAttribute('stroke-width', cross ? '4.2' : '4');
        });
        overlay.appendChild(clone);
      }
    });
    labelGroups.forEach((label) => {
      const isActive = activeIds.has(label.dataset.edgeId || '');
      const edgeId = label.dataset.edgeId || '';
      const relatedEdge = edgeGroups.find((edge) => edge.dataset.edgeId === edgeId);
      const cross = relatedEdge?.dataset.kind === 'cross-link';
      label.style.display = cross && !showRelationships ? 'none' : '';
      label.style.opacity = (selectedNodeId || selectedEdgeId) && !isActive ? '0.12' : '';
      if (isActive && (!cross || showRelationships)) {
        const clone = label.cloneNode(true) as SVGGElement;
        clone.style.opacity = '1';
        clone.querySelector('rect')?.setAttribute('stroke-width', '2.4');
        overlay.appendChild(clone);
      }
    });
    svg.querySelectorAll<SVGGElement>('.mm-node[data-node-id]').forEach((node) => {
      const id = node.dataset.nodeId || '';
      node.style.opacity = (selectedNodeId || selectedEdgeId) && !activeNodeIds.has(id) ? '0.38' : '';
      node.classList.toggle('relationship-focus', activeNodeIds.has(id));
      node.style.filter = activeNodeIds.has(id) ? 'drop-shadow(0 0 10px rgba(16,185,129,.72))' : ''; 
    });
    overlay.setAttribute('pointer-events', 'none');
  }, [svgMarkup, selectedNodeId, selectedEdgeId, showRelationships]);

  // Unified camera framing effect: frames selected node + its visible children, or fits entire map
  useEffect(() => {
    const svg = stageRef.current?.querySelector('svg');
    if (svg) {
      svg.querySelectorAll('.mm-node').forEach((node) => node.classList.remove('selected'));
      if (selectedNodeId) {
        const selected = Array.from(svg.querySelectorAll('.mm-node')).find(
          (node) => (node as SVGGElement).dataset.nodeId === selectedNodeId
        );
        selected?.classList.add('selected');
      }
    }

    const frame = window.requestAnimationFrame(() => {
      if (selectedNodeId) {
        focusNodeCluster(selectedNodeId);
      } else if (initialCameraMapIdRef.current !== mapDocument.id) {
        initialCameraMapIdRef.current = mapDocument.id;
        focusPrimaryOverview();
      } else {
        fitToView();
      }
    });

    const handleResize = () => {
      if (selectedNodeIdRef.current) {
        focusNodeCluster(selectedNodeIdRef.current);
      } else {
        fitToView();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', handleResize);
    };
  }, [selectedNodeId, svgMarkup, focusNodeCluster, focusPrimaryOverview, fitToView, mapDocument.id]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointersRef.current.set(event.pointerId, point);
    const currentTransform = transformRef.current;

    if (pointersRef.current.size >= 2) {
      const points = Array.from(pointersRef.current.values()).slice(0, 2);
      const center = midpoint(points[0], points[1]);
      const rect = viewportRef.current?.getBoundingClientRect();
      const localCenter = {
        x: center.x - (rect?.left || 0),
        y: center.y - (rect?.top || 0)
      };
      gestureRef.current = {
        type: 'pinch',
        startDistance: Math.max(1, distance(points[0], points[1])),
        startScale: currentTransform.zoom,
        worldX: (localCenter.x - currentTransform.pan.x) / currentTransform.zoom,
        worldY: (localCenter.y - currentTransform.pan.y) / currentTransform.zoom,
        moved: false
      };
      return;
    }

    const target = event.target as Element;
    const action = target.closest?.('.mm-node-action[data-node-id]') as SVGGElement | null;
    const edge = target.closest?.('.mm-edge[data-edge-id], .mm-edge-label[data-edge-id]') as SVGGElement | null;
    const node = target.closest?.('.mm-node[data-node-id]') as SVGGElement | null;
    gestureRef.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: currentTransform.pan.x,
      originY: currentTransform.pan.y,
      nodeId: action ? undefined : node?.dataset.nodeId,
      actionNodeId: action?.dataset.nodeId,
      edgeId: edge?.dataset.edgeId,
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
      const localCenter = {
        x: center.x - (rect?.left || 0),
        y: center.y - (rect?.top || 0)
      };
      const nextZoom = Math.max(
        0.16,
        Math.min(
          3.2,
          (gesture.startScale * distance(points[0], points[1])) / gesture.startDistance
        )
      );
      gesture.moved = true;
      applyTransform(
        nextZoom,
        {
          x: localCenter.x - gesture.worldX * nextZoom,
          y: localCenter.y - gesture.worldY * nextZoom
        },
        false
      );
      return;
    }

    if (points.length === 1 && gesture?.type === 'pan') {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > 6) gesture.moved = true;
      if (gesture.moved) {
        applyTransform(
          transformRef.current.zoom,
          {
            x: gesture.originX + dx,
            y: gesture.originY + dy
          },
          false
        );
      }
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture?.type === 'pan' && gesture.pointerId === event.pointerId && !gesture.moved) {
      if (gesture.actionNodeId) {
        toggleNodeBranchCollapse(gesture.actionNodeId);
      } else if (gesture.nodeId) {
        selectNodeAndRevealChildren(gesture.nodeId);
      } else if (gesture.edgeId) {
        setSelectedNodeId(null);
        setSelectedEdgeId(gesture.edgeId);
        setIsNoteExpanded(false);
      } else {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
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
        originX: transformRef.current.pan.x,
        originY: transformRef.current.pan.y,
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
    const current = transformRef.current;
    const nextZoom = Math.max(
      0.16,
      Math.min(3.2, current.zoom * (event.deltaY < 0 ? 1.12 : 0.89))
    );
    const worldX = (cursor.x - current.pan.x) / current.zoom;
    const worldY = (cursor.y - current.pan.y) / current.zoom;
    applyTransform(
      nextZoom,
      {
        x: cursor.x - worldX * nextZoom,
        y: cursor.y - worldY * nextZoom
      },
      false
    );
  };

  const handleSaveInteractiveFile = async () => {
    const safeName = (styledDocument.title || 'mind-map')
      .replace(/[^\w\u0600-\u06FF-]+/g, '-')
      .slice(0, 48);
    const result = await prepareAndDownloadFile({
      filename: `${safeName || 'mind-map'}.html`,
      content: buildStandaloneMindMapHtml(styledDocument, fullLayout, isDark),
      mime: 'text/html;charset=utf-8'
    });
    showToast?.(result.initiated ? result.messageAr : result.error || 'تعذر حفظ ملف الخريطة');
  };

  const toggleBrowserFullscreen = async () => {
    try {
      if (window.document.fullscreenElement) await window.document.exitFullscreen();
      else await window.document.documentElement.requestFullscreen?.();
    } catch {
      showToast?.('تعذر تفعيل ملء الشاشة في هذا المتصفح', 'info');
    }
  };

  const selectedChildNodes = useMemo(() => {
    if (!selectedNode) return [];
    return styledDocument.nodes
      .filter((node) => node.parentId === selectedNode.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [styledDocument.nodes, selectedNode]);

  // Hierarchy tree list for the Nodes & Branches Visibility Panel
  const treeRows = useMemo(() => {
    const byParent = new Map<string, typeof mapDocument.nodes>();
    mapDocument.nodes.forEach((n) => {
      const k = n.parentId || '__root__';
      byParent.set(k, [...(byParent.get(k) || []), n]);
    });
    const rows: Array<{ node: (typeof mapDocument.nodes)[number]; depth: number; childCount: number }> = [];
    const seen = new Set<string>();
    const walk = (id: string, depth: number) => {
      const node = mapDocument.nodes.find((n) => n.id === id);
      if (!node || seen.has(id)) return;
      seen.add(id);
      const children = (byParent.get(id) || [])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      rows.push({ node, depth, childCount: children.length });
      children.forEach((c) => walk(c.id, depth + 1));
    };
    walk(mapDocument.rootNodeId, 0);
    mapDocument.nodes.forEach((n) => walk(n.id, 1));
    return rows;
  }, [mapDocument.nodes, mapDocument.rootNodeId]);

  return (
    <div
      className={`fixed inset-0 z-[120] flex flex-col overflow-hidden ${
        isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'
      }`}
      dir="rtl"
    >
      <style>{`
        .mm-node { cursor: pointer; outline: none; font-family: 'IBM Plex Sans Arabic', Inter, Cairo, sans-serif; }
        .mm-node rect, .mm-node polygon, .mm-node ellipse { filter: drop-shadow(0 3px 7px rgba(0,0,0,.22)); }
        .mm-node text { font-family: 'IBM Plex Sans Arabic', Inter, Cairo, sans-serif; direction: auto; unicode-bidi: plaintext; }
        .mm-edge-label { pointer-events: none; }
        .mm-node:focus rect, .mm-node.selected rect,
        .mm-node:focus polygon, .mm-node.selected polygon,
        .mm-node:focus ellipse, .mm-node.selected ellipse {
          stroke: #10b981 !important;
          stroke-width: 3.5px !important;
          filter: drop-shadow(0 4px 12px rgba(16, 185, 129, 0.32));
        }
      `}</style>
      <header
        className={`relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl sm:flex-nowrap sm:px-5 ${
          isDark
            ? 'border-slate-800 bg-slate-950/95 text-white'
            : 'border-slate-200 bg-white/95 text-slate-900'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black tracking-wide sm:text-base">
            {mapDocument.title || 'الخريطة الذهنية'}
          </div>
          <div className="text-[10px] font-semibold text-slate-400">
            انقر على أي عقدة لإظهار فروعها وتفاصيلها · اسحب للتحريك · إصبعان للتكبير والتصغير
          </div>
        </div>
        <div ref={toolsContainerRef} className="relative flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowToolsMenu((open) => !open)}
            aria-expanded={showToolsMenu}
            aria-label="أدوات الخريطة"
            className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-extrabold shadow-sm ${
              showToolsMenu
                ? 'border-emerald-400 bg-emerald-500/15 text-emerald-500'
                : isDark
                  ? 'border-white/15 bg-white/5 text-white'
                  : 'border-slate-300 bg-slate-100 text-slate-800'
            }`}
          >
            <MoreVertical className="h-4 w-4" />
            <span>الأدوات</span>
          </button>

          {showToolsMenu && (
            <div
              dir="rtl"
              onPointerDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
              className={`absolute right-0 top-full z-[150] mt-2 flex max-h-[min(76dvh,620px)] w-[min(310px,calc(100vw-32px))] max-w-[calc(100vw-32px)] flex-col gap-1 overflow-y-auto rounded-2xl border p-2 shadow-2xl backdrop-blur-xl ${
                isDark
                  ? 'border-slate-700 bg-slate-900/98 text-white'
                  : 'border-slate-200 bg-white/98 text-slate-900'
              }`}
            >
              <div className="px-2 pb-1 pt-1 text-[10px] font-black text-slate-400">طريقة العرض</div>
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    handleStyleSwitch(opt.id);
                    setShowToolsMenu(false);
                  }}
                  className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${
                    activeStyle === opt.id
                      ? 'bg-emerald-400 text-slate-950'
                      : isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                  }`}
                >
                  {activeStyle === opt.id ? '✓ ' : ''}{opt.labelAr}
                </button>
              ))}
              <div className={`my-1 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`} />
              <button
                type="button"
                aria-pressed={showRelationships}
                onClick={() => {
                  setShowRelationships((visible) => !visible);
                  setShowToolsMenu(false);
                }}
                className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${
                  showRelationships ? 'bg-violet-500/15 text-violet-500' : isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                }`}
              >
                {showRelationships ? 'إخفاء أسهم العلاقات' : 'إظهار أسهم العلاقات'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !isSequentialMode;
                  setIsSequentialMode(next);
                  if (next && sequenceNodes.length) {
                    setSequenceIndex(0);
                    setSelectedNodeId(sequenceNodes[0].id);
                  } else {
                    setCollapsedIds(buildDefaultCollapsedSet());
                  }
                  setShowToolsMenu(false);
                }}
                className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${
                  isSequentialMode ? 'bg-emerald-400 text-slate-950' : isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                }`}
              >
                {isSequentialMode ? 'إيقاف العرض التسلسلي' : 'عرض تسلسلي خطوة بخطوة'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNodesPanel((open) => !open);
                  setShowToolsMenu(false);
                }}
                className={`flex min-h-10 items-center justify-between rounded-xl px-3 text-xs font-bold ${
                  showNodesPanel || hiddenNodeIds.size ? 'bg-emerald-500/15 text-emerald-500' : isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'
                }`}
              >
                <span>التحكم بالعقد والفروع</span>
                {hiddenNodeIds.size > 0 && <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black text-slate-950">{hiddenNodeIds.size}</span>}
              </button>
              {!isSequentialMode && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNodeId(null);
                      setHiddenNodeIds(new Set());
                      setCollapsedIds(new Set());
                      setShowToolsMenu(false);
                    }}
                    className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    إظهار وتوسيع جميع العقد
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNodeId(null);
                      setCollapsedIds(buildDefaultCollapsedSet());
                      setShowToolsMenu(false);
                    }}
                    className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
                  >
                    طي الفروع الفرعية
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                  window.requestAnimationFrame(() => fitToView());
                  setShowToolsMenu(false);
                }}
                className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
              >
                ملاءمة جميع البطاقات للشاشة
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowToolsMenu(false);
                  void handleSaveInteractiveFile();
                }}
                className="min-h-10 rounded-xl bg-emerald-400 px-3 text-right text-xs font-black text-slate-950"
              >
                حفظ ملف HTML التفاعلي في الهاتف
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowToolsMenu(false);
                  void toggleBrowserFullscreen();
                }}
                className={`min-h-10 rounded-xl px-3 text-right text-xs font-bold ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
              >
                ملء الشاشة
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={requestClose}
            aria-label="إغلاق الخريطة"
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
              isDark
                ? 'border-white/15 bg-white/5 text-white hover:bg-rose-500/20'
                : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-rose-100'
            }`}
            title="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Note: dir="ltr" on the canvas viewport ensures (left: 0, top: 0) and transformOrigin: 0 0 are physically anchored to top-left */}
      <main
        ref={viewportRef}
        dir="ltr"
        className="relative z-0 min-h-0 flex-1 overflow-hidden touch-none select-none"
        style={{
          backgroundColor: isDark ? '#0f172a' : '#f8fafc',
          backgroundImage: isDark
            ? 'radial-gradient(circle, rgba(148,163,184,.16) 1px, transparent 1px)'
            : 'radial-gradient(circle, rgba(100,116,139,.12) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        <div
          ref={stageRef}
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{
            transition: isAnimatingTransform
              ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)'
              : 'none',
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
          }}
        />

        {/* Floating Zoom In / Zoom Out / Fit All Controls */}
        <div
          dir="rtl"
          onPointerDown={(e) => e.stopPropagation()}
          className={`absolute top-3 left-3 z-10 flex flex-col gap-1.5 rounded-2xl border p-1.5 shadow-lg backdrop-blur-xl ${
            isDark
              ? 'border-white/15 bg-slate-900/90 text-white'
              : 'border-slate-300 bg-white/90 text-slate-800'
          }`}
        >
          <button
            type="button"
            onClick={() => zoomByFactor(1.22)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent hover:border-emerald-400/40 hover:bg-emerald-500/10"
            title="تكبير الشاشة"
            aria-label="تكبير الشاشة"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="text-center font-mono text-[10px] font-bold opacity-75">
            {Math.round(zoom * 100)}%
          </div>
          <button
            type="button"
            onClick={() => zoomByFactor(0.82)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-transparent hover:border-emerald-400/40 hover:bg-emerald-500/10"
            title="تصغير الشاشة لإظهار المزيد من البطائق"
            aria-label="تصغير الشاشة"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {/* Nodes & Branches Visibility Control Drawer (Show/Hide any main or sub-node) */}
        {showNodesPanel && (
          <aside
            dir="rtl"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className={`absolute top-3 right-3 z-20 flex max-h-[70dvh] w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${
              isDark
                ? 'border-slate-700 bg-slate-900/95 text-white'
                : 'border-slate-300 bg-white/95 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-700/40 px-3.5 py-2.5">
              <div>
                <div className="text-xs font-black">التحكم بالعقد الرئيسية والفرعية</div>
                <div className="text-[10px] text-slate-400">
                  إظهار أو إخفاء أي عقدة أو طي فروعها
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNodesPanel(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-2 border-b border-slate-700/30 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-black"><span>ألوان الخريطة</span><span className="text-[10px] font-semibold text-slate-400">{activeColorMode === 'branch' ? 'حسب الفروع' : 'حسب الدور الطبي'}</span></div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-black/10 p-1">
                <button type="button" onClick={() => handleColorModeSwitch('branch')} className={`rounded-lg px-2 py-2 text-[11px] font-extrabold ${activeColorMode === 'branch' ? 'bg-emerald-400 text-slate-950' : 'opacity-75'}`}>حسب الفروع</button>
                <button type="button" onClick={() => handleColorModeSwitch('role')} className={`rounded-lg px-2 py-2 text-[11px] font-extrabold ${activeColorMode === 'role' ? 'bg-emerald-400 text-slate-950' : 'opacity-75'}`}>حسب الدور الطبي</button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 border-b border-slate-700/30 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  setHiddenNodeIds(new Set());
                  setCollapsedIds(new Set());
                }}
                className="flex-1 rounded-lg bg-emerald-400 py-1.5 text-[11px] font-black text-slate-950"
              >
                إظهار وتوسيع الكل
              </button>
              <button
                type="button"
                onClick={() => {
                  setHiddenNodeIds(new Set());
                  setCollapsedIds(buildDefaultCollapsedSet());
                }}
                className={`flex-1 rounded-lg border py-1.5 text-[11px] font-bold ${
                  isDark ? 'border-white/15 bg-white/5' : 'border-slate-300 bg-slate-100'
                }`}
              >
                العقد الرئيسية فقط
              </button>
            </div>
            <div className="space-y-2 border-b border-slate-700/30 p-3">
              <div className="text-[11px] font-black">لون العقدة المحددة</div>
              <div className="flex flex-wrap gap-2">
                {MIND_MAP_COLOR_SWATCHES.map((swatch) => <button key={swatch.name} type="button" title={swatch.name} aria-label={`تطبيق اللون ${swatch.name}`} onClick={() => applyColorToSelectedNode(swatch.base)} className={`h-7 w-7 rounded-full border-2 ${selectedSwatchColor === swatch.base ? 'border-white ring-2 ring-emerald-400' : 'border-white/25'}`} style={{ backgroundColor: swatch.base }} />)}
              </div>
              <button type="button" disabled={!selectedNodeId} onClick={applyColorToSelectedBranch} className="w-full rounded-xl bg-emerald-400 px-3 py-2 text-[11px] font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">تطبيق اللون على الفرع بالكامل</button>
              <div className="text-[10px] leading-4 text-slate-400">اختر عقدة من القائمة أو الخريطة أولاً. اللون اليدوي محفوظ مع الخريطة ويظل مستقلاً عن نمط التلوين التلقائي.</div>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-2.5">
              {treeRows.map(({ node, depth, childCount }) => {
                const isRoot = node.id === mapDocument.rootNodeId;
                const isHidden = effectiveHiddenIds.has(node.id);
                const isDirectHidden = hiddenNodeIds.has(node.id);
                const isFolded = collapsedIds.has(node.id);
                return (
                  <div
                    key={node.id}
                    style={{ marginRight: `${Math.min(depth * 12, 48)}px` }}
                    className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs ${
                      selectedNodeId === node.id
                        ? 'border-emerald-400 bg-emerald-500/15'
                        : isDark
                          ? 'border-white/10 bg-white/5'
                          : 'border-slate-200 bg-slate-50'
                    } ${isHidden ? 'opacity-50' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isHidden) {
                          setHiddenNodeIds((prev) => {
                            const next = new Set(prev);
                            next.delete(node.id);
                            return next;
                          });
                        }
                        selectNodeAndRevealChildren(node.id);
                      }}
                      className="min-w-0 flex-1 text-right font-bold"
                    >
                      <div className="truncate">{node.label}</div>
                      {node.sublabel && (
                        <div className="truncate text-[10px] opacity-70">{node.sublabel}</div>
                      )}
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      {childCount > 0 && !isRoot && !isHidden && (
                        <button
                          type="button"
                          onClick={() => toggleNodeBranchCollapse(node.id)}
                          className={`rounded-lg border px-1.5 py-0.5 text-[10px] font-extrabold ${
                            isFolded
                              ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                              : isDark
                                ? 'border-white/15 bg-white/5 text-emerald-300'
                                : 'border-slate-300 bg-white text-emerald-700'
                          }`}
                          title={isFolded ? 'فتح الفروع الفرعية' : 'طي الفروع الفرعية'}
                        >
                          {isFolded ? `+${childCount}` : 'طي'}
                        </button>
                      )}
                      {!isRoot && (
                        <button
                          type="button"
                          onClick={() => toggleHideNode(node.id)}
                          className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                            isDirectHidden
                              ? 'border-rose-400/50 bg-rose-500/20 text-rose-300'
                              : isDark
                                ? 'border-white/15 bg-white/5 text-slate-200'
                                : 'border-slate-300 bg-white text-slate-700'
                          }`}
                          title={isDirectHidden ? 'إظهار العقدة' : 'إخفاء العقدة وفروعها'}
                        >
                          {isDirectHidden ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* Sequential Step-by-Step Navigation Bar */}
        {isSequentialMode && selectedNode && (
          <div
            dir="rtl"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-3 left-14 right-3 z-10 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-slate-900/90 p-2.5 text-white shadow-xl backdrop-blur-xl"
          >
            <button
              type="button"
              disabled={sequenceIndex <= 0}
              onClick={() => {
                const next = Math.max(0, sequenceIndex - 1);
                setSequenceIndex(next);
                setSelectedNodeId(sequenceNodes[next]?.id || null);
              }}
              className="min-h-9 rounded-xl border border-white/15 px-3 text-xs font-bold disabled:opacity-40"
            >
              السابق
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-xs font-black">{selectedNode.label}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {sequenceIndex + 1} / {sequenceNodes.length}
              </div>
            </div>
            <button
              type="button"
              disabled={sequenceIndex >= sequenceNodes.length - 1}
              onClick={() => {
                const next = Math.min(sequenceNodes.length - 1, sequenceIndex + 1);
                setSequenceIndex(next);
                setSelectedNodeId(sequenceNodes[next]?.id || null);
              }}
              className="min-h-9 rounded-xl bg-emerald-400 px-3 text-xs font-black text-slate-950 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        )}

        {/* Selected Node Details & Branch Control Sheet */}
        {selectedNode && (
          <div
            dir="rtl"
            onPointerDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
            className={`absolute bottom-[max(8px,env(safe-area-inset-bottom))] left-2 right-2 z-10 mx-auto ${
              isNoteExpanded ? 'max-h-[58dvh]' : 'max-h-[min(28dvh,220px)]'
            } max-w-3xl overflow-y-auto rounded-2xl border p-3 shadow-2xl backdrop-blur-xl transition-all sm:bottom-4 sm:p-3.5 ${
              isDark
                ? 'border-emerald-400/30 bg-slate-900/95 text-white'
                : 'border-slate-300 bg-white/95 text-slate-900'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {selectedNodePath.length > 1 && (
                  <div className="mb-1 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                    {selectedNodePath.map((node, index) => (
                      <React.Fragment key={node.id}>
                        {index > 0 && <span aria-hidden="true">‹</span>}
                        <button
                          type="button"
                          onClick={() => selectNodeAndRevealChildren(node.id)}
                          className={
                            index === selectedNodePath.length - 1
                              ? 'font-black text-emerald-400'
                              : 'hover:underline'
                          }
                        >
                          {node.label}
                        </button>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                <div
                  className={`text-sm font-black sm:text-base ${
                    isDark ? 'text-emerald-300' : 'text-emerald-700'
                  }`}
                >
                  {selectedNode.label}
                </div>
                {selectedNode.sublabel && (
                  <p
                    className={`mt-0.5 text-xs font-semibold ${
                      isDark ? 'text-emerald-200' : 'text-emerald-700'
                    }`}
                  >
                    {selectedNode.sublabel}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {selectedNode.id !== mapDocument.rootNodeId && (
                  <button
                    type="button"
                    onClick={() => toggleHideNode(selectedNode.id)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold ${
                      isDark
                        ? 'border-white/15 bg-white/5 text-slate-300 hover:text-rose-300'
                        : 'border-slate-300 bg-slate-100 text-slate-700 hover:text-rose-700'
                    }`}
                    title="إخفاء هذه العقدة من الخريطة"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">إخفاء العقدة</span>
                  </button>
                )}
                {selectedNode.note && selectedNode.note.length > 110 && (
                  <button
                    type="button"
                    onClick={() => setIsNoteExpanded((v) => !v)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold ${
                      isDark
                        ? 'border-white/15 bg-white/5 text-emerald-300'
                        : 'border-slate-300 bg-slate-100 text-emerald-700'
                    }`}
                  >
                    {isNoteExpanded ? (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" />
                        <span>تصغير</span>
                      </>
                    ) : (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" />
                        <span>الشرح الكامل</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedNodeId(null)}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold ${
                    isDark
                      ? 'border-white/15 bg-white/5 text-slate-300 hover:text-white'
                      : 'border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900'
                  }`}
                  title="إغلاق بطاقة التفاصيل"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {selectedNode.note && (
              <p
                className={`mt-1.5 whitespace-pre-wrap break-words text-xs leading-6 ${
                  isNoteExpanded
                    ? ''
                    : '[display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] overflow-hidden'
                } ${isDark ? 'text-slate-100' : 'text-slate-700'}`}
              >
                {selectedNode.note}
              </p>
            )}

            {selectedChildNodes.length > 0 && (
              <div className="mt-2 flex max-w-full items-center gap-1.5 overflow-x-auto pb-1">
                {!isSequentialMode && (
                  <button
                    type="button"
                    onClick={() => toggleNodeBranchCollapse(selectedNode.id)}
                    className={`flex shrink-0 items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-extrabold ${
                      collapsedIds.has(selectedNode.id)
                        ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                        : isDark
                          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                          : 'border-emerald-600/40 bg-emerald-50 text-emerald-800'
                    }`}
                  >
                    <GitBranch className="h-3 w-3" />
                    <span>
                      {collapsedIds.has(selectedNode.id)
                        ? `إظهار الفروع (${selectedChildNodes.length})`
                        : `إخفاء الفروع (${selectedChildNodes.length})`}
                    </span>
                  </button>
                )}
                {selectedChildNodes.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => selectNodeAndRevealChildren(child.id)}
                    className={`shrink-0 max-w-[220px] truncate rounded-xl border px-3 py-1 text-xs font-bold ${
                      isDark
                        ? 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/10'
                        : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                    }`}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!selectedNode && (
          <div
            dir="rtl"
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-[10px] font-semibold text-slate-300 backdrop-blur sm:bottom-5"
          >
            انقر على أي عقدة لإظهار فروعها وتفاصيلها · (+عدد) لفتح أو طي الفرع
          </div>
        )}
      </main>
    </div>
  );
};
