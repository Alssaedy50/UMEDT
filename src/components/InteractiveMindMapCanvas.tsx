import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  Maximize2,
  RotateCcw,
  Plus,
  Trash2,
  Link2,
  Download,
  Search,
  X,
  Edit3,
  Check,
  GitFork,
  GitBranch,
  Activity,
  Stethoscope,
  Pill,
  AlertTriangle,
  CircleDot,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  FileCode
} from 'lucide-react';
import {
  MindMapDocument,
  MindMapEdge,
  MindMapNode,
  MindMapNodeRole,
  MindMapStyle,
  PositionedMindMapNode
} from '../types/mindMap';
import { computeMindMapLayout } from '../services/mindMapLayoutEngine';
import { buildStandaloneMindMapSvg } from '../services/mindMapStorageService';
import { buildStandaloneMindMapHtmlV2 as buildStandaloneMindMapHtml } from '../services/mindMapStandaloneExportServiceV2';
import { MindMapFullScreenViewer } from './MindMapFullScreenViewer';
import { prepareAndDownloadFile } from '../utils/downloadHelper';

export const MIND_MAP_ROLE_META: Record<
  MindMapNodeRole,
  {
    labelAr: string;
    labelEn: string;
    icon: React.ComponentType<{ className?: string }>;
    cardClass: string;
    badgeClass: string;
    svgStroke: string;
  }
> = {
  root: {
    labelAr: 'محور رئيسي',
    labelEn: 'Root',
    icon: CircleDot,
    cardClass:
      'bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:text-slate-950 dark:border-emerald-300 shadow-md',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    svgStroke: '#10b981'
  },
  concept: {
    labelAr: 'مفهوم',
    labelEn: 'Concept',
    icon: GitBranch,
    cardClass:
      'bg-white text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600',
    badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
    svgStroke: '#64748b'
  },
  mechanism: {
    labelAr: 'آلية / فيزيولوجيا',
    labelEn: 'Mechanism',
    icon: Activity,
    cardClass:
      'bg-sky-50 text-sky-950 border-sky-400 dark:bg-sky-950/80 dark:text-sky-100 dark:border-sky-500/70',
    badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40',
    svgStroke: '#38bdf8'
  },
  diagnosis: {
    labelAr: 'تشخيص / فحص',
    labelEn: 'Diagnosis',
    icon: Stethoscope,
    cardClass:
      'bg-violet-50 text-violet-950 border-violet-400 dark:bg-violet-950/80 dark:text-violet-100 dark:border-violet-500/70',
    badgeClass: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/40',
    svgStroke: '#a78bfa'
  },
  treatment: {
    labelAr: 'علاج / تدبير',
    labelEn: 'Treatment',
    icon: Pill,
    cardClass:
      'bg-emerald-50 text-emerald-950 border-emerald-400 dark:bg-emerald-950/80 dark:text-emerald-100 dark:border-emerald-500/70',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    svgStroke: '#34d399'
  },
  warning: {
    labelAr: 'تحذير / مضاعفة',
    labelEn: 'Warning',
    icon: AlertTriangle,
    cardClass:
      'bg-rose-50 text-rose-950 border-rose-400 dark:bg-rose-950/80 dark:text-rose-100 dark:border-rose-500/70',
    badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40',
    svgStroke: '#fb7185'
  }
};

const STYLE_LABELS: Array<{ id: MindMapStyle; labelAr: string; labelEn: string }> = [
  { id: 'radial', labelAr: 'شعاعية', labelEn: 'Radial' },
  { id: 'hierarchical', labelAr: 'هرمية', labelEn: 'Tree' },
  { id: 'medical_flow', labelAr: 'مسار سريري', labelEn: 'Flow' }
];

interface InteractiveMindMapCanvasProps {
  document: MindMapDocument;
  onChangeDocument?: (nextDoc: MindMapDocument) => void;
  editable?: boolean;
  compact?: boolean;
  heightClassName?: string;
  onRequestFullscreen?: () => void;
  showToast?: (msg: string, type?: string) => void;
}

export const InteractiveMindMapCanvas: React.FC<InteractiveMindMapCanvasProps> = ({
  document: doc,
  onChangeDocument,
  editable = true,
  compact = false,
  heightClassName,
  onRequestFullscreen,
  showToast
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () =>
      new Set(
        doc.nodes
          .filter(
            (node) =>
              node.id !== doc.rootNodeId &&
              doc.nodes.some((child) => child.parentId === node.id)
          )
          .map((node) => node.id)
      )
  );
  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(() => new Set());
  const [localStyle, setLocalStyle] = useState<MindMapStyle>(doc.style || 'radial');
  useEffect(() => {
    setLocalStyle(doc.style || 'radial');
  }, [doc.id, doc.style]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(doc.rootNodeId || null);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showSearch, setShowSearch] = useState<boolean>(false);
  const [isFullScreenViewerOpen, setIsFullScreenViewerOpen] = useState<boolean>(false);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);

  // Editing states inside Inspector
  const [isEditingNode, setIsEditingNode] = useState<boolean>(false);
  const [editLabel, setEditLabel] = useState<string>('');
  const [editSublabel, setEditSublabel] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');
  const [editRole, setEditRole] = useState<MindMapNodeRole>('concept');
  const [editShape, setEditShape] = useState<NonNullable<MindMapNode['shape']>>('rounded');
  const [editColor, setEditColor] = useState<string>('');

  // Linking mode: click source -> click target to create edge
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [pendingEdgeLabel, setPendingEdgeLabel] = useState<string>('');
  const [pendingEdgeDashed, setPendingEdgeDashed] = useState<boolean>(false);

  // Pointer drag state (pan canvas, pinch zoom, OR drag node)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    startDist: number;
    startZoom: number;
    worldX: number;
    worldY: number;
  } | null>(null);
  const dragStateRef = useRef<{
    kind: 'pan' | 'node';
    nodeId?: string;
    startClientX: number;
    startClientY: number;
    origPanX: number;
    origPanY: number;
    origNodeX: number;
    origNodeY: number;
    moved: boolean;
  } | null>(null);
  const [dragNodeOverride, setDragNodeOverride] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);

  const effectiveHiddenIds = useMemo(() => {
    if (hiddenNodeIds.size === 0) return new Set<string>();
    const hidden = new Set<string>();
    hiddenNodeIds.forEach((id) => {
      if (id !== doc.rootNodeId) hidden.add(id);
    });
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of doc.nodes) {
        if (n.parentId && hidden.has(n.parentId) && !hidden.has(n.id)) {
          hidden.add(n.id);
          changed = true;
        }
      }
    }
    return hidden;
  }, [hiddenNodeIds, doc.nodes, doc.rootNodeId]);

  const effectiveDoc = useMemo(() => {
    const styleChanged = localStyle !== doc.style;
    const baseNodes = doc.nodes
      .filter((n) => !effectiveHiddenIds.has(n.id))
      .map((n) => {
        if (dragNodeOverride && n.id === dragNodeOverride.nodeId) {
          return { ...n, position: { x: dragNodeOverride.x, y: dragNodeOverride.y } };
        }
        return styleChanged ? { ...n, position: undefined } : n;
      });
    const validIds = new Set(baseNodes.map((n) => n.id));
    return {
      ...doc,
      style: localStyle,
      nodes: baseNodes,
      edges: doc.edges.filter((e) => validIds.has(e.sourceId) && validIds.has(e.targetId))
    };
  }, [doc, localStyle, effectiveHiddenIds, dragNodeOverride]);

  const layout = useMemo(
    () => computeMindMapLayout(effectiveDoc, collapsedIds),
    [effectiveDoc, collapsedIds]
  );

  const hasCustomPositions = useMemo(
    () => doc.nodes.some((n) => Boolean(n.position)),
    [doc.nodes]
  );

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const rect = el.getBoundingClientRect();
    const cw = Math.max(280, rect.width);
    const ch = Math.max(220, rect.height);
    const { minX, minY, width, height } = layout.bounds;

    const scaleX = cw / Math.max(1, width);
    const scaleY = ch / Math.max(1, height);
    const nextZoom = Math.max(0.24, Math.min(1.18, Math.min(scaleX, scaleY) * 0.92));

    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    setZoom(Number(nextZoom.toFixed(2)));
    setPan({
      x: cw / 2 - centerX * nextZoom,
      y: ch / 2 - centerY * nextZoom
    });
  }, [layout.bounds]);

  /**
   * Frames a target node and all of its currently visible direct child cards
   * inside the canvas viewport so revealed cards never get clipped off-screen.
   */
  const focusNodeCluster = useCallback(
    (nodeId: string) => {
      const el = containerRef.current;
      if (!el) return;
      const target = layout.nodes.find((n) => n.node.id === nodeId);
      if (!target) return;
      const cluster = [target, ...layout.nodes.filter((n) => n.node.parentId === nodeId)];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const pn of cluster) {
        const l = pn.x - pn.width / 2;
        const t = pn.y - pn.height / 2;
        const r = pn.x + pn.width / 2;
        const b = pn.y + pn.height / 2 + 16;
        if (l < minX) minX = l;
        if (t < minY) minY = t;
        if (r > maxX) maxX = r;
        if (b > maxY) maxY = b;
      }
      const rect = el.getBoundingClientRect();
      const cw = Math.max(260, rect.width - 24);
      const ch = Math.max(200, rect.height - 40);
      const clusterW = Math.max(150, maxX - minX + 56);
      const clusterH = Math.max(100, maxY - minY + 56);
      const fitScale = Math.min(cw / clusterW, ch / clusterH);
      const nextZoom = Number(
        (cluster.length > 1
          ? Math.max(0.26, Math.min(1.12, fitScale))
          : Math.max(0.68, Math.min(1.14, Math.min(zoom < 0.68 ? 0.92 : zoom, fitScale)))
        ).toFixed(2)
      );
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      setZoom(nextZoom);
      setPan({
        x: rect.width / 2 - cx * nextZoom,
        y: (rect.height - 16) / 2 - cy * nextZoom
      });
    },
    [layout.nodes, zoom]
  );

  useEffect(() => {
    if (!pendingFocusNodeId) return;
    const id = pendingFocusNodeId;
    setPendingFocusNodeId(null);
    const frame = window.requestAnimationFrame(() => focusNodeCluster(id));
    return () => window.cancelAnimationFrame(frame);
  }, [pendingFocusNodeId, layout, focusNodeCluster]);

  // Auto-fit on document switch or style change
  const lastFitKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${doc.id}::${localStyle}`;
    if (lastFitKeyRef.current !== key) {
      lastFitKeyRef.current = key;
      const timer = window.setTimeout(() => fitToView(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [doc.id, localStyle, fitToView]);

  // Reset selected node when switching documents (keep root expanded so first-level branches are visible)
  useEffect(() => {
    setSelectedNodeId(doc.rootNodeId || doc.nodes[0]?.id || null);
    setHiddenNodeIds(new Set());
    setCollapsedIds(
      new Set(
        doc.nodes
          .filter(
            (node) =>
              node.id !== doc.rootNodeId &&
              doc.nodes.some((child) => child.parentId === node.id)
          )
          .map((node) => node.id)
      )
    );
    setIsEditingNode(false);
    setLinkSourceId(null);
    setDragNodeOverride(null);
  }, [doc.id, doc.rootNodeId]);

  const selectedNode = useMemo(
    () => doc.nodes.find((n) => n.id === selectedNodeId) || null,
    [doc.nodes, selectedNodeId]
  );

  useEffect(() => {
    if (selectedNode) {
      setEditLabel(selectedNode.label);
      setEditSublabel(selectedNode.sublabel || '');
      setEditNote(selectedNode.note || '');
      setEditRole(selectedNode.role);
      setEditShape(selectedNode.shape || 'rounded');
      setEditColor(selectedNode.color || '');
    }
  }, [selectedNode]);

  const searchMatches = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return new Set<string>();
    const matched = new Set<string>();
    for (const n of doc.nodes) {
      const hay = `${n.label} ${n.sublabel || ''} ${n.note || ''}`.toLowerCase();
      if (hay.includes(q)) matched.add(n.id);
    }
    return matched;
  }, [doc.nodes, searchTerm]);

  const toggleCollapseNode = (nodeId: string, e?: React.MouseEvent | React.PointerEvent) => {
    e?.stopPropagation();
    setSelectedNodeId(nodeId);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
    setPendingFocusNodeId(nodeId);
  };

  const handleExpandAllBranches = () => {
    setHiddenNodeIds(new Set());
    setCollapsedIds(new Set());
    window.setTimeout(() => fitToView(), 40);
  };

  const handleCollapseSubBranches = () => {
    setCollapsedIds(
      new Set(
        doc.nodes
          .filter(
            (node) =>
              node.id !== doc.rootNodeId &&
              doc.nodes.some((child) => child.parentId === node.id)
          )
          .map((node) => node.id)
      )
    );
    window.setTimeout(() => fitToView(), 40);
  };

  const handleStyleChange = (nextStyle: MindMapStyle) => {
    if (localStyle === nextStyle) return;
    setLocalStyle(nextStyle);
    if (onChangeDocument) {
      onChangeDocument({
        ...doc,
        style: nextStyle,
        nodes: doc.nodes.map((n) => ({ ...n, position: undefined })),
        updatedAt: new Date().toISOString()
      });
    }
  };

  const handleResetAutoLayout = () => {
    if (onChangeDocument && hasCustomPositions) {
      onChangeDocument({
        ...doc,
        nodes: doc.nodes.map((n) => ({ ...n, position: undefined })),
        updatedAt: new Date().toISOString()
      });
    }
    window.setTimeout(() => fitToView(), 40);
  };

  const handleAddChildNode = (parentId: string) => {
    if (!onChangeDocument) return;
    const newId = `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const parentNode = doc.nodes.find((n) => n.id === parentId);
    const siblingCount = doc.nodes.filter((n) => n.parentId === parentId).length;
    const newNode: MindMapNode = {
      id: newId,
      label: 'عقدة جديدة',
      sublabel: 'New Branch',
      parentId,
      role: parentNode?.role === 'root' ? 'concept' : parentNode?.role || 'concept',
      order: siblingCount + 1
    };

    // Expand parent if it was collapsed
    if (collapsedIds.has(parentId)) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }

    onChangeDocument({
      ...doc,
      nodes: [...doc.nodes, newNode],
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeId(newId);
    setIsEditingNode(true);
  };

  const handleSaveSelectedNodeEdit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!onChangeDocument || !selectedNode) return;
    const cleanLabel = editLabel.trim() || selectedNode.label;
    onChangeDocument({
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.id === selectedNode.id
          ? {
              ...n,
              label: cleanLabel,
              sublabel: editSublabel.trim() || undefined,
              note: editNote.trim() || undefined,
              role: selectedNode.id === doc.rootNodeId ? 'root' : editRole,
              shape: editShape,
              color: editColor || undefined
            }
          : n
      ),
      updatedAt: new Date().toISOString()
    });
    setIsEditingNode(false);
    showToast?.('تم تحديث العقدة بنجاح');
  };

  const handleDeleteNode = (targetId: string) => {
    if (!onChangeDocument || targetId === doc.rootNodeId) return;
    // Collect subtree
    const toRemove = new Set<string>([targetId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of doc.nodes) {
        if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          changed = true;
        }
      }
    }

    onChangeDocument({
      ...doc,
      nodes: doc.nodes.filter((n) => !toRemove.has(n.id)),
      edges: doc.edges.filter(
        (ed) => !toRemove.has(ed.sourceId) && !toRemove.has(ed.targetId)
      ),
      updatedAt: new Date().toISOString()
    });
    setSelectedNodeId(doc.rootNodeId);
    setIsEditingNode(false);
    showToast?.(`تم حذف ${toRemove.size} عقدة من الخريطة`);
  };

  const handleDeleteEdge = (edgeId: string) => {
    if (!onChangeDocument) return;
    onChangeDocument({
      ...doc,
      edges: doc.edges.filter((ed) => ed.id !== edgeId),
      updatedAt: new Date().toISOString()
    });
  };

  const handleNodeTap = (pNode: PositionedMindMapNode) => {
    if (linkSourceId && onChangeDocument) {
      if (linkSourceId === pNode.node.id) {
        setLinkSourceId(null);
        return;
      }
      const exists = doc.edges.some(
        (ed) => ed.sourceId === linkSourceId && ed.targetId === pNode.node.id
      );
      if (!exists) {
        const newEdge: MindMapEdge = {
          id: `e-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          sourceId: linkSourceId,
          targetId: pNode.node.id,
          label: pendingEdgeLabel.trim() || undefined,
          lineStyle: pendingEdgeDashed ? 'dashed' : 'solid',
          directed: true
        };
        onChangeDocument({
          ...doc,
          edges: [...doc.edges, newEdge],
          updatedAt: new Date().toISOString()
        });
        showToast?.('تم ربط العقدتين بعلاقة جديدة');
      }
      setLinkSourceId(null);
      setPendingEdgeLabel('');
      return;
    }

    setSelectedNodeId(pNode.node.id);
    if (pNode.hasChildren && pNode.isCollapsed) {
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        next.delete(pNode.node.id);
        return next;
      });
    }
    setPendingFocusNodeId(pNode.node.id);
  };

  // Pointer handlers for smooth pan, two-finger pinch zoom & node drag
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);

    if (pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values()).slice(0, 2);
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const rect = containerRef.current?.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left || 0);
      const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top || 0);
      pinchStateRef.current = {
        startDist: dist,
        startZoom: zoom,
        worldX: (midX - pan.x) / zoom,
        worldY: (midY - pan.y) / zoom
      };
      dragStateRef.current = null;
      return;
    }

    if ((e.target as HTMLElement).closest('[data-mm-interactive="true"]')) return;
    dragStateRef.current = {
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      origNodeX: 0,
      origNodeY: 0,
      moved: false
    };
  };

  const handleNodePointerDown = (
    pNode: PositionedMindMapNode,
    e: React.PointerEvent<HTMLDivElement>
  ) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size >= 2) return;
    e.stopPropagation();
    dragStateRef.current = {
      kind: editable && onChangeDocument ? 'node' : 'pan',
      nodeId: pNode.node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: pan.x,
      origPanY: pan.y,
      origNodeX: pNode.x,
      origNodeY: pNode.y,
      moved: false
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pointersRef.current.size >= 2 && pinchStateRef.current) {
      const pts = Array.from(pointersRef.current.values()).slice(0, 2);
      const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const rect = containerRef.current?.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - (rect?.left || 0);
      const midY = (pts[0].y + pts[1].y) / 2 - (rect?.top || 0);
      const ps = pinchStateRef.current;
      const nextZoom = Number(
        Math.max(0.28, Math.min(2.6, (ps.startZoom * dist) / ps.startDist)).toFixed(2)
      );
      setZoom(nextZoom);
      setPan({
        x: midX - ps.worldX * nextZoom,
        y: midY - ps.worldY * nextZoom
      });
      return;
    }

    const st = dragStateRef.current;
    if (!st) return;
    const dx = e.clientX - st.startClientX;
    const dy = e.clientY - st.startClientY;
    if (!st.moved && Math.hypot(dx, dy) > 6) {
      st.moved = true;
    }
    if (!st.moved) return;

    if (st.kind === 'pan') {
      setPan({ x: st.origPanX + dx, y: st.origPanY + dy });
    } else if (st.kind === 'node' && st.nodeId && onChangeDocument) {
      const nextX = Math.round(st.origNodeX + dx / zoom);
      const nextY = Math.round(st.origNodeY + dy / zoom);
      setDragNodeOverride({ nodeId: st.nodeId, x: nextX, y: nextY });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    if (dragNodeOverride && onChangeDocument) {
      const committed = dragNodeOverride;
      setDragNodeOverride(null);
      onChangeDocument({
        ...doc,
        nodes: doc.nodes.map((n) =>
          n.id === committed.nodeId
            ? { ...n, position: { x: committed.x, y: committed.y } }
            : n
        ),
        updatedAt: new Date().toISOString()
      });
    }
    window.setTimeout(() => {
      dragStateRef.current = null;
    }, 0);
  };

  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey && compact) return;
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;
    const nextZoom = Number(Math.max(0.28, Math.min(2.5, zoom * (e.deltaY < 0 ? 1.1 : 0.9))).toFixed(2));
    const worldX = (cursorX - pan.x) / zoom;
    const worldY = (cursorY - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({ x: cursorX - worldX * nextZoom, y: cursorY - worldY * nextZoom });
  };

  const handleExportSvg = async () => {
    const isDarkMode =
      typeof window !== 'undefined' &&
      window.document.documentElement.classList.contains('dark');
    const fullLayout = computeMindMapLayout(doc, new Set());
    const svg = buildStandaloneMindMapSvg(doc, fullLayout, isDarkMode);
    const safeName = (doc.title || 'mind-map')
      .replace(/[^\w\u0600-\u06FF-]+/g, '-')
      .slice(0, 48);
    const res = await prepareAndDownloadFile({
      filename: `${safeName || 'mind-map'}.svg`,
      content: svg,
      mime: 'image/svg+xml;charset=utf-8'
    });
    showToast?.(res.initiated ? res.messageAr : res.error || 'تعذر تنزيل SVG');
  };

  const handleExportJson = async () => {
    const safeName = (doc.title || 'mind-map')
      .replace(/[^\w\u0600-\u06FF-]+/g, '-')
      .slice(0, 48);
    const res = await prepareAndDownloadFile({
      filename: `${safeName || 'mind-map'}.json`,
      content: JSON.stringify(doc, null, 2),
      mime: 'application/json;charset=utf-8'
    });
    showToast?.(res.initiated ? res.messageAr : res.error || 'تعذر تنزيل JSON');
  };

  const createStandaloneHtml = () => {
    const dark = typeof window !== 'undefined' && window.document.documentElement.classList.contains('dark');
    const fullLayout = computeMindMapLayout(doc, new Set());
    return buildStandaloneMindMapHtml(doc, fullLayout, dark);
  };
  const getHtmlFilename = () => {
    const safe = (doc.title || 'mind-map').replace(/[^\w\u0600-\u06FF-]+/g, '-').slice(0, 48);
    return `${safe || 'mind-map'}.html`;
  };
  const handleExportHtml = async () => {
    const res = await prepareAndDownloadFile({ filename: getHtmlFilename(), content: createStandaloneHtml(), mime: 'text/html;charset=utf-8' });
    showToast?.(res.initiated ? res.messageAr : res.error || 'تعذر تصدير HTML');
  };
  const connectedEdgesForSelected = useMemo(() => {
    if (!selectedNode) return [];
    return doc.edges.filter(
      (ed) => ed.sourceId === selectedNode.id || ed.targetId === selectedNode.id
    );
  }, [doc.edges, selectedNode]);

  const nodeTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of doc.nodes) map.set(n.id, n.label);
    return map;
  }, [doc.nodes]);

  return (
    <div className="flex flex-col gap-2.5 w-full min-w-0">
      {/* Compact dropdown keeps the editing canvas clear on mobile */}
      <details className="group relative z-30 self-start">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-xs font-extrabold text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          <span aria-hidden="true">☰</span><span>أدوات الخريطة وإعداداتها</span><span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div onClick={(event) => { if ((event.target as HTMLElement).closest("button")) event.currentTarget.closest("details")?.removeAttribute("open"); }} className="absolute right-0 top-full mt-2 flex max-h-[min(72dvh,620px)] w-[min(340px,calc(100vw-28px))] flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* Style Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          {STYLE_LABELS.map((st) => {
            const active = localStyle === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => handleStyleChange(st.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {st.labelAr}
              </button>
            );
          })}
        </div>

        {/* Fit, Expand/Collapse, Search & Export Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleResetAutoLayout}
            className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:border-emerald-500/60"
            title={hasCustomPositions ? 'إعادة الترتيب التلقائي وتوسيط الخريطة' : 'توسيط الخريطة'}
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-500" />
            <span className="hidden sm:inline">
              {hasCustomPositions ? 'ترتيب تلقائي' : 'توسيط'}
            </span>
          </button>

          <button
            type="button"
            onClick={collapsedIds.size > 0 ? handleExpandAllBranches : handleCollapseSubBranches}
            className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:border-emerald-500/60"
            title={collapsedIds.size > 0 ? 'توسيع جميع الفروع' : 'طي الفروع الفرعية'}
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-500" />
            <span>{collapsedIds.size > 0 ? 'توسيع الكل' : 'طي الفروع'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 ${
              showSearch || searchTerm
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
            }`}
            title="بحث داخل الخريطة"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {!compact && (
            <>
              <button
                type="button"
                onClick={() => void handleExportSvg()}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:border-emerald-500/60"
                title="تصدير صورة متجهة SVG"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>SVG</span>
              </button>
              <button
                type="button"
                onClick={() => void handleExportJson()}
                className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 hover:border-emerald-500/60"
                title="تصدير ملف JSON"
              >
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>JSON</span>
              </button>
              <button type="button" onClick={() => void handleExportHtml()} className="min-h-[34px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1" title="تصدير صفحة HTML مستقلة تعمل دون إنترنت"><FileCode className="w-3.5 h-3.5 text-sky-500" /><span>حفظ HTML تفاعلي</span></button>

            </>
          )}

          <button
            type="button"
            onClick={() => {
              if (onRequestFullscreen) onRequestFullscreen();
              else setIsFullScreenViewerOpen(true);
            }}
            className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-[11px] font-extrabold flex items-center gap-1"
            title="فتح في الاستوديو الكامل"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>عرض الخريطة كاملة</span>
          </button>
        </div>
        </div>
      </details>

      {/* Optional Search Strip */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <input
            type="text"
            dir="auto"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ابحث عن عقدة أو مفهوم داخل الخريطة..."
            className="flex-1 bg-transparent text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
          />
          {searchTerm && (
            <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {searchMatches.size} نتيجة
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setShowSearch(false);
            }}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Link Mode Banner */}
      {linkSourceId && (
        <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/50 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-extrabold text-emerald-800 dark:text-emerald-200">
            وضع الربط: انقر على العقدة الهدف لإنشاء علاقة من «{nodeTitleMap.get(linkSourceId)}»
          </span>
          <button
            type="button"
            onClick={() => setLinkSourceId(null)}
            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-xs font-bold border border-slate-200 dark:border-slate-700"
          >
            إلغاء الربط
          </button>
        </div>
      )}

      {/* Interactive Canvas Viewport */}
      <div
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onWheel={handleWheelZoom}
        dir="ltr"
        className={`relative w-full overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 select-none touch-none cursor-grab active:cursor-grabbing ${
          heightClassName || (compact ? 'h-[360px] sm:h-[420px]' : 'h-[54vh] min-h-[380px]')
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148,163,184,0.22) 1px, transparent 1px)',
          backgroundSize: '22px 22px'
        }}
      >
        {/* Transformed Pan/Zoom Layer */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
          }}
        >
          {/* SVG Edges Layer */}
          <svg
            className="overflow-visible pointer-events-none"
            width={1}
            height={1}
          >
            <defs>
              <marker
                id={`mm-arrow-${doc.id}`}
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="currentColor" />
              </marker>
            </defs>

            {layout.edges.map((edge) => {
              const isHighlighted =
                selectedNodeId &&
                (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId);
              const roleStroke = MIND_MAP_ROLE_META[edge.role]?.svgStroke || '#64748b';
              return (
                <g
                  key={edge.id}
                  className={
                    isHighlighted
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-600'
                  }
                >
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={isHighlighted ? roleStroke : 'currentColor'}
                    strokeWidth={isHighlighted ? 2.6 : 1.9}
                    strokeDasharray={edge.lineStyle === 'dashed' ? '6 4' : undefined}
                    markerEnd={
                      edge.directed ? `url(#mm-arrow-${doc.id})` : undefined
                    }
                    opacity={
                      searchMatches.size > 0 &&
                      !searchMatches.has(edge.sourceId) &&
                      !searchMatches.has(edge.targetId)
                        ? 0.25
                        : 1
                    }
                  />
                  {edge.label && (
                    <g transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                      <rect
                        x={-Math.max(28, edge.label.length * 3.6 + 10)}
                        y={-10}
                        width={Math.max(56, edge.label.length * 7.2 + 20)}
                        height={20}
                        rx={6}
                        className="fill-white dark:fill-slate-900 stroke-slate-300 dark:stroke-slate-700"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        className="fill-slate-700 dark:fill-slate-200 text-[10px] font-bold"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive HTML Nodes Positioned in Exact Layout Coordinates */}
          {layout.nodes.map((pNode) => {
            const roleMeta = MIND_MAP_ROLE_META[pNode.node.role] || MIND_MAP_ROLE_META.concept;
            const RoleIcon = roleMeta.icon;
            const isSelected = selectedNodeId === pNode.node.id;
            const isLinkSource = linkSourceId === pNode.node.id;
            const isSearchMatch = searchMatches.has(pNode.node.id);
            const isDimmed = searchMatches.size > 0 && !isSearchMatch;
            const customColor = pNode.node.color;
            const shape = pNode.node.shape || 'rounded';
            const radiusClass =
              shape === 'pill' || shape === 'circle'
                ? 'rounded-full'
                : shape === 'diamond'
                  ? 'rounded-lg'
                  : shape === 'hexagon'
                    ? 'rounded-xl'
                    : 'rounded-2xl';

            return (
              <div
                key={pNode.node.id}
                data-mm-interactive="true"
                onPointerDown={(e) => handleNodePointerDown(pNode, e)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragStateRef.current?.moved) return;
                  handleNodeTap(pNode);
                }}
                style={{
                  width: `${pNode.width}px`,
                  minHeight: `${pNode.height}px`,
                  left: `${pNode.x - pNode.width / 2}px`,
                  top: `${pNode.y - pNode.height / 2}px`,
                  ...(customColor
                    ? {
                        backgroundColor: customColor,
                        borderColor: customColor,
                        color: '#ffffff'
                      }
                    : {})
                }}
                className={`absolute ${radiusClass} border-2 px-3 py-2 flex flex-col items-center justify-center text-center transition-shadow cursor-pointer select-none ${
                  customColor ? 'text-white shadow-sm' : roleMeta.cardClass
                } ${
                  isSelected
                    ? 'ring-3 ring-emerald-500/45 shadow-lg z-20'
                    : 'hover:shadow-md z-10'
                } ${
                  isLinkSource ? 'ring-3 ring-amber-400 animate-pulse' : ''
                } ${
                  isSearchMatch ? 'ring-3 ring-amber-500' : ''
                } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
              >
                {/* Small semantic role indicator & clinical note dot */}
                <div className="flex items-center justify-center gap-1 mb-0.5 max-w-full">
                  <RoleIcon className="w-3 h-3 shrink-0 opacity-80" />
                  <span dir="auto" className="text-[11px] sm:text-xs font-extrabold leading-tight break-words">
                    {pNode.lines.join(' ')}
                  </span>
                </div>

                {pNode.sublabelLine && (
                  <div
                    dir="auto"
                    className="text-[10px] font-semibold opacity-80 leading-tight mt-0.5 break-words"
                  >
                    {pNode.sublabelLine}
                  </div>
                )}

                {pNode.node.note && (
                  <span
                    className="absolute -top-2 -left-1.5 px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[9px] font-extrabold shadow-xs"
                    title="يحتوي على ملاحظة سريرية"
                  >
                    ملاحظة
                  </span>
                )}

                {/* Branch Collapse/Expand Toggle */}
                {pNode.hasChildren && (
                  <button
                    type="button"
                    data-mm-interactive="true"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => toggleCollapseNode(pNode.node.id, e)}
                    className={`absolute -bottom-3 left-1/2 -translate-x-1/2 min-h-[26px] min-w-[30px] px-2 rounded-full border text-[10px] font-mono font-extrabold flex items-center justify-center shadow-sm transition-colors ${
                      pNode.isCollapsed
                        ? 'bg-emerald-600 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-emerald-500'
                    }`}
                    title={pNode.isCollapsed ? 'توسيع الفرع' : 'طي الفرع'}
                  >
                    {pNode.isCollapsed ? `+ عرض ${pNode.hiddenDescendantsCount}` : 'طي'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Canvas Info & Quick Zoom Controls */}
        <div className="absolute bottom-2 right-2 left-2 pointer-events-none flex flex-wrap items-center justify-between gap-2">
          <div className="px-2.5 py-1 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs border border-slate-200/80 dark:border-slate-800/80 text-[10px] font-bold text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-2 pointer-events-auto">
            <span className="font-mono tabular-nums">
              {effectiveDoc.nodes.length} عقدة · {effectiveDoc.edges.length} علاقة
            </span>
            {hiddenNodeIds.size > 0 && (
              <button
                type="button"
                onClick={() => setHiddenNodeIds(new Set())}
                className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-extrabold"
              >
                إظهار العقد المخفية ({hiddenNodeIds.size})
              </button>
            )}
            {!compact && (
              <span className="hidden sm:inline text-slate-400">
                اسحب الخلفية للتحريك · انقر على أي عقدة لإظهار فروعها وتفاصيلها
              </span>
            )}
          </div>
          <div
            data-mm-interactive="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 p-1 shadow-sm pointer-events-auto"
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Number(Math.max(0.22, z * 0.84).toFixed(2)))}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-black text-xs flex items-center justify-center"
              title="تصغير الشاشة"
            >
              −
            </button>
            <button
              type="button"
              onClick={fitToView}
              className="px-2 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-mono text-[10px] font-extrabold"
              title="ملاءمة جميع البطائق"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Number(Math.min(2.6, z * 1.18).toFixed(2)))}
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-black text-xs flex items-center justify-center"
              title="تكبير الشاشة"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Selected Node Inspector & Inline Editor */}
      {selectedNode && (
        <div
          dir="rtl"
          className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
        >
          {!isEditingNode ? (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(() => {
                      const rm = MIND_MAP_ROLE_META[selectedNode.role] || MIND_MAP_ROLE_META.concept;
                      const RIcon = rm.icon;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-extrabold ${rm.badgeClass}`}
                        >
                          <RIcon className="w-3 h-3" />
                          <span>{rm.labelAr}</span>
                        </span>
                      );
                    })()}
                    {selectedNode.sublabel && (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {selectedNode.sublabel}
                      </span>
                    )}
                  </div>
                  <h4
                    dir="auto"
                    className="text-sm font-extrabold text-slate-900 dark:text-white break-words"
                  >
                    {selectedNode.label}
                  </h4>
                  {selectedNode.note && (
                    <p
                      dir="auto"
                      className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-800"
                    >
                      {selectedNode.note}
                    </p>
                  )}
                </div>

                {editable && onChangeDocument && (
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleAddChildNode(selectedNode.id)}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-[11px] font-extrabold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>فرع فرعي</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingNode(true)}
                      className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-emerald-500" />
                      <span>تعديل</span>
                    </button>
                    {!compact && (
                      <button
                        type="button"
                        onClick={() => setLinkSourceId(selectedNode.id)}
                        className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold flex items-center gap-1"
                        title="ربط هذه العقدة بعقدة أخرى"
                      >
                        <Link2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>ربط</span>
                      </button>
                    )}
                    {selectedNode.id !== doc.rootNodeId && (
                      <button
                        type="button"
                        onClick={() => handleDeleteNode(selectedNode.id)}
                        className="min-h-[34px] px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[11px] font-bold flex items-center gap-1"
                        title="حذف العقدة وفروعها"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Connected custom edges */}
              {connectedEdgesForSelected.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400">العلاقات:</span>
                  {connectedEdgesForSelected.map((ed) => (
                    <span
                      key={ed.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200"
                    >
                      <span>
                        {nodeTitleMap.get(ed.sourceId)} ← {ed.label ? `[${ed.label}] ` : ''}
                        {nodeTitleMap.get(ed.targetId)}
                      </span>
                      {editable && onChangeDocument && (
                        <button
                          type="button"
                          onClick={() => handleDeleteEdge(ed.id)}
                          className="text-rose-500 hover:text-rose-400"
                          title="حذف العلاقة"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Optional link edge settings when linkSourceId is active */}
              {linkSourceId === selectedNode.id && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <input
                    type="text"
                    dir="auto"
                    value={pendingEdgeLabel}
                    onChange={(e) => setPendingEdgeLabel(e.target.value)}
                    placeholder="تسمية العلاقة (مثلاً: يؤدي إلى / First-line)..."
                    className="flex-1 min-w-[180px] min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pendingEdgeDashed}
                      onChange={(e) => setPendingEdgeDashed(e.target.checked)}
                    />
                    <span>خط متقطع</span>
                  </label>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={handleSaveSelectedNodeEdit} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    النص الرئيسي للعقدة *
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    required
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    المؤشر الثانوي / الترجمة
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    value={editSublabel}
                    onChange={(e) => setEditSublabel(e.target.value)}
                    placeholder="اختياري..."
                    className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
              </div>

              {selectedNode.id !== doc.rootNodeId && (
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    التصنيف الطبي للعقدة
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      ['concept', 'mechanism', 'diagnosis', 'treatment', 'warning'] as MindMapNodeRole[]
                    ).map((roleKey) => {
                      const rm = MIND_MAP_ROLE_META[roleKey];
                      const RIcon = rm.icon;
                      const active = editRole === roleKey;
                      return (
                        <button
                          key={roleKey}
                          type="button"
                          onClick={() => setEditRole(roleKey)}
                          className={`px-2.5 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 transition-colors ${
                            active
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : rm.badgeClass
                          }`}
                        >
                          <RIcon className="w-3 h-3" />
                          <span>{rm.labelAr}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">شكل العقدة</label>
                  <select value={editShape} onChange={(e) => setEditShape(e.target.value as NonNullable<MindMapNode['shape']>)} className="w-full min-h-[38px] rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs dark:border-slate-800 dark:bg-slate-950">
                    <option value="rounded">مستطيل مستدير</option><option value="pill">بيضاوي</option><option value="diamond">مُعين</option><option value="hexagon">سداسي</option><option value="circle">دائري</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">لون مخصص</label>
                  <div className="flex items-center gap-2"><input aria-label="لون العقدة" type="color" value={editColor || '#64748b'} onChange={(e) => setEditColor(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200 bg-transparent p-1" /><button type="button" onClick={() => setEditColor('')} className="min-h-9 rounded-lg bg-slate-100 px-3 text-[11px] font-bold dark:bg-slate-800">لون الدور الافتراضي</button></div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  ملاحظة سريرية تفصيلية (تظهر عند النقر)
                </label>
                <textarea
                  rows={6}
                  dir="auto"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="تفاصيل سريرية، آلية، أو تنبيه امتحاني..."
                  className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingNode(false)}
                  className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="min-h-[36px] px-4 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ العقدة</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {isFullScreenViewerOpen && (
        <MindMapFullScreenViewer
          mapDocument={effectiveDoc}
          onClose={() => setIsFullScreenViewerOpen(false)}
          showToast={showToast}
          onChangeDocument={onChangeDocument}
        />
      )}
    </div>
  );
};
