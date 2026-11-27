import {
  MindMapDocument,
  MindMapEdge,
  MindMapLayoutResult,
  MindMapNode,
  MindMapNodeRole,
  PositionedMindMapEdge,
  PositionedMindMapNode
} from '../types/mindMap';

const MAX_LABEL_CHARS_PER_LINE = 26;
const MAX_LABEL_LINES = 2;

export function wrapConciseNodeLabel(label: string): string[] {
  const clean = String(label || '').replace(/\s+/g, ' ').trim();
  if (!clean) return ['عقدة'];
  if (clean.length <= MAX_LABEL_CHARS_PER_LINE) return [clean];

  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current =
        word.length > MAX_LABEL_CHARS_PER_LINE
          ? `${word.slice(0, MAX_LABEL_CHARS_PER_LINE - 1)}…`
          : word;
      continue;
    }

    if (current.length + 1 + word.length <= MAX_LABEL_CHARS_PER_LINE) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      if (lines.length >= MAX_LABEL_LINES) {
        const last = lines[MAX_LABEL_LINES - 1];
        lines[MAX_LABEL_LINES - 1] =
          last.length >= MAX_LABEL_CHARS_PER_LINE
            ? `${last.slice(0, MAX_LABEL_CHARS_PER_LINE - 1)}…`
            : `${last}…`;
        return lines;
      }
      current =
        word.length > MAX_LABEL_CHARS_PER_LINE
          ? `${word.slice(0, MAX_LABEL_CHARS_PER_LINE - 1)}…`
          : word;
    }
  }

  if (current && lines.length < MAX_LABEL_LINES) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [clean.slice(0, MAX_LABEL_CHARS_PER_LINE)];
}

export function truncateSublabel(sublabel?: string): string | undefined {
  const clean = String(sublabel || '').replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > 30 ? `${clean.slice(0, 29)}…` : clean;
}

/**
 * Sleek, compact node card measurement:
 * Fits 1-2 title lines + optional 1-line sublabel without redundant 3rd-line parent breadcrumb
 * or multi-line note bloat inside the card.
 */
function measureNodeBox(
  node: MindMapNode,
  isRoot: boolean
): {
  width: number;
  height: number;
  lines: string[];
  sublabelLine?: string;
  noteLines: string[];
} {
  const lines = wrapConciseNodeLabel(node.label);
  const sublabelLine = truncateSublabel(node.sublabel);
  const maxChars = Math.max(
    ...lines.map((l) => l.length),
    sublabelLine ? Math.min(sublabelLine.length, 28) : 0
  );

  const minWidth = isRoot ? 192 : 156;
  const maxWidth = isRoot ? 268 : 244;
  const estimatedWidth = Math.round(maxChars * 7.4 + 42);
  const width = Math.max(minWidth, Math.min(maxWidth, estimatedWidth));

  const baseHeight = isRoot ? 54 : 46;
  const extraLine = (lines.length - 1) * 17;
  const extraSub = sublabelLine ? 16 : 0;
  const height = baseHeight + extraLine + extraSub;

  return { width, height, lines, sublabelLine, noteLines: [] };
}

function buildChildrenMap(nodes: MindMapNode[]): Map<string, MindMapNode[]> {
  const map = new Map<string, MindMapNode[]>();
  const validIds = new Set(nodes.map((n) => n.id));
  const sourceOrder = new Map(nodes.map((node, index) => [node.id, index]));
  for (const node of nodes) {
    if (node.parentId && validIds.has(node.parentId) && node.parentId !== node.id) {
      const list = map.get(node.parentId) || [];
      list.push(node);
      map.set(node.parentId, list);
    }
  }
  for (const [parentId, list] of map.entries()) {
    list.sort(
      (a, b) =>
        (a.order ?? 0) - (b.order ?? 0) ||
        (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0)
    );
    map.set(parentId, list);
  }
  return map;
}

function countAllDescendants(
  nodeId: string,
  childrenMap: Map<string, MindMapNode[]>,
  visited = new Set<string>()
): number {
  if (visited.has(nodeId)) return 0;
  visited.add(nodeId);
  const children = childrenMap.get(nodeId) || [];
  let total = 0;
  for (const child of children) {
    if (!visited.has(child.id)) {
      total += 1 + countAllDescendants(child.id, childrenMap, visited);
    }
  }
  return total;
}

function collectVisibleNodeIds(
  doc: MindMapDocument,
  childrenMap: Map<string, MindMapNode[]>,
  collapsedIds: Set<string>
): { visibleIds: Set<string>; depthMap: Map<string, number> } {
  const visibleIds = new Set<string>();
  const depthMap = new Map<string, number>();
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));

  const rootId = nodeMap.has(doc.rootNodeId) ? doc.rootNodeId : doc.nodes[0]?.id;
  if (!rootId) return { visibleIds, depthMap };

  const dfs = (id: string, depth: number) => {
    if (visibleIds.has(id)) return;
    visibleIds.add(id);
    depthMap.set(id, depth);
    if (collapsedIds.has(id)) return;
    const children = childrenMap.get(id) || [];
    for (const child of children) {
      dfs(child.id, depth + 1);
    }
  };

  dfs(rootId, 0);

  // Include any unattached / independent nodes (common in Medical Flow maps)
  for (const node of doc.nodes) {
    if (!visibleIds.has(node.id)) {
      const parentExists = Boolean(node.parentId && nodeMap.has(node.parentId));
      if (!parentExists) {
        dfs(node.id, 1);
      }
    }
  }

  return { visibleIds, depthMap };
}

function computeCubicPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  orientation: 'horizontal' | 'vertical'
): { path: string; labelX: number; labelY: number } {
  if (orientation === 'horizontal') {
    const midX = (sx + tx) / 2;
    const path = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
    return {
      path,
      labelX: (sx + tx) / 2,
      labelY: (sy + ty) / 2 - 10
    };
  }
  const dy = ty - sy;
  const ctrl = Math.max(32, Math.abs(dy) * 0.45);
  const c1y = sy + (dy >= 0 ? ctrl : -ctrl);
  const c2y = ty - (dy >= 0 ? ctrl : -ctrl);
  const path = `M ${sx} ${sy} C ${sx} ${c1y}, ${tx} ${c2y}, ${tx} ${ty}`;
  return {
    path,
    labelX: (sx + tx) / 2,
    labelY: (sy + ty) / 2 - 10
  };
}

function computeAnchorPoints(
  src: PositionedMindMapNode,
  tgt: PositionedMindMapNode,
  style: MindMapDocument['style']
): { sx: number; sy: number; tx: number; ty: number; orientation: 'horizontal' | 'vertical' } {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;

  if (style === 'hierarchical') {
    if (Math.abs(dx) >= Math.max(24, Math.abs(dy) * 1.15)) {
      const sx = dx >= 0 ? src.x + src.width / 2 + 4 : src.x - src.width / 2 - 4;
      const tx = dx >= 0 ? tgt.x - tgt.width / 2 - 4 : tgt.x + tgt.width / 2 + 4;
      return { sx, sy: src.y, tx, ty: tgt.y, orientation: 'horizontal' };
    }
    const sy = dy >= 0 ? src.y + src.height / 2 + 4 : src.y - src.height / 2 - 4;
    const ty = dy >= 0 ? tgt.y - tgt.height / 2 - 4 : tgt.y + tgt.height / 2 + 4;
    return { sx: src.x, sy, tx: tgt.x, ty, orientation: 'vertical' };
  }

  if (style === 'medical_flow') {
    if (Math.abs(dx) >= Math.abs(dy) * 0.75) {
      const sx = dx >= 0 ? src.x + src.width / 2 + 4 : src.x - src.width / 2 - 4;
      const tx = dx >= 0 ? tgt.x - tgt.width / 2 - 4 : tgt.x + tgt.width / 2 + 4;
      return { sx, sy: src.y, tx, ty: tgt.y, orientation: 'horizontal' };
    }
    const sy = dy >= 0 ? src.y + src.height / 2 + 4 : src.y - src.height / 2 - 4;
    const ty = dy >= 0 ? tgt.y - tgt.height / 2 - 4 : tgt.y + tgt.height / 2 + 4;
    return { sx: src.x, sy, tx: tgt.x, ty, orientation: 'vertical' };
  }

  // Radial (bilateral / curved outward)
  if (Math.abs(dx) >= Math.abs(dy) * 0.42) {
    const sx = dx >= 0 ? src.x + src.width / 2 + 4 : src.x - src.width / 2 - 4;
    const tx = dx >= 0 ? tgt.x - tgt.width / 2 - 4 : tgt.x + tgt.width / 2 + 4;
    return { sx, sy: src.y, tx, ty: tgt.y, orientation: 'horizontal' };
  }
  const sy = dy >= 0 ? src.y + src.height / 2 + 4 : src.y - src.height / 2 - 4;
  const ty = dy >= 0 ? tgt.y - tgt.height / 2 - 4 : tgt.y + tgt.height / 2 + 4;
  return { sx: src.x, sy, tx: tgt.x, ty, orientation: 'vertical' };
}

function computeCrossLinkPath(
  src: PositionedMindMapNode,
  tgt: PositionedMindMapNode,
  laneX: number
): { path: string; labelX: number; labelY: number; sourceX: number; sourceY: number } {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const clearance = 5;

  // If nodes are horizontally separated in different columns, connect directly between inner ports
  // with an arched curve instead of forcing all curves outside the rightmost edge.
  if (Math.abs(dx) > (src.width + tgt.width) * 0.55) {
    const sourceX = dx >= 0 ? src.x + src.width / 2 + clearance : src.x - src.width / 2 - clearance;
    const sourceY = src.y;
    const targetX = dx >= 0 ? tgt.x - tgt.width / 2 - clearance : tgt.x + tgt.width / 2 + clearance;
    const targetY = tgt.y;
    const midX = (sourceX + targetX) / 2;
    const arcLift = dy === 0 ? -34 : (dy > 0 ? -24 : 24);
    const c1x = sourceX + (midX - sourceX) * 0.55;
    const c2x = targetX - (targetX - midX) * 0.55;
    const c1y = sourceY + arcLift;
    const c2y = targetY + arcLift;
    const path = `M ${sourceX} ${sourceY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${targetX} ${targetY}`;
    const labelX = (sourceX + 3 * c1x + 3 * c2x + targetX) / 8;
    const labelY = (sourceY + 3 * c1y + 3 * c2y + targetY) / 8;
    return { path, labelX, labelY, sourceX, sourceY };
  }

  // Same-column or vertical cross-link: route cleanly along the outer right lane
  const sourceX = src.x + src.width / 2 + clearance;
  const sourceY = src.y;
  const targetX = tgt.x + tgt.width / 2 + clearance;
  const targetY = tgt.y;
  const c1x = Math.max(laneX, sourceX + 26);
  const c2x = Math.max(laneX, targetX + 26);
  const path = `M ${sourceX} ${sourceY} C ${c1x} ${sourceY}, ${c2x} ${targetY}, ${targetX} ${targetY}`;

  const labelX = (sourceX + 3 * c1x + 3 * c2x + targetX) / 8;
  const labelY = (sourceY + 3 * sourceY + 3 * targetY + targetY) / 8;
  return { path, labelX, labelY, sourceX, sourceY };
}

function estimateEdgeLabelPillSize(label?: string): { width: number; height: number } {
  if (!label) return { width: 0, height: 0 };
  const clean = label.trim();
  if (!clean) return { width: 0, height: 0 };
  return {
    width: Math.max(64, Math.min(230, Math.round(clean.length * 7.0 + 22))),
    height: 24
  };
}

/**
 * Computes deterministic, non-overlapping node & edge geometry for all 3 academic styles:
 * - radial: Balanced bilateral radial branches extending smoothly left & right from the central concept
 * - hierarchical: Top-down structured medical taxonomy tree with multi-tier wrapping so mobile zoom stays large
 * - medical_flow: Layered clinical algorithm / pathophysiology pathway with collision-free edge labels
 */
export function computeMindMapLayout(
  doc: MindMapDocument,
  collapsedIds: Set<string> = new Set()
): MindMapLayoutResult {
  if (!doc.nodes || doc.nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      bounds: { minX: -200, minY: -150, maxX: 200, maxY: 150, width: 400, height: 300 }
    };
  }

  const childrenMap = buildChildrenMap(doc.nodes);
  const { visibleIds, depthMap } = collectVisibleNodeIds(doc, childrenMap, collapsedIds);
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));
  const rootId = nodeMap.has(doc.rootNodeId) ? doc.rootNodeId : doc.nodes[0].id;

  const boxes = new Map<
    string,
    { width: number; height: number; lines: string[]; sublabelLine?: string; noteLines: string[] }
  >();
  for (const id of visibleIds) {
    const node = nodeMap.get(id);
    if (node) {
      boxes.set(id, measureNodeBox(node, id === rootId));
    }
  }

  const getVisibleChildren = (id: string): MindMapNode[] => {
    if (collapsedIds.has(id)) return [];
    return (childrenMap.get(id) || []).filter((c) => visibleIds.has(c.id));
  };

  const autoPositions = new Map<string, { x: number; y: number; side: 'center' | 'left' | 'right' }>();

  if (doc.style === 'radial') {
    autoPositions.set(rootId, { x: 0, y: 0, side: 'center' });
    const rootChildren = getVisibleChildren(rootId);

    const verticalGap = 24;
    const horizontalGap = 74;

    const subtreeHeightCache = new Map<string, number>();
    const measureSubtreeHeight = (id: string, seen = new Set<string>()): number => {
      if (subtreeHeightCache.has(id)) return subtreeHeightCache.get(id)!;
      if (seen.has(id)) return 54;
      seen.add(id);
      const box = boxes.get(id) || { width: 160, height: 48 };
      const kids = getVisibleChildren(id);
      if (kids.length === 0) {
        subtreeHeightCache.set(id, box.height);
        return box.height;
      }
      const sumKids =
        kids.reduce((acc, k) => acc + measureSubtreeHeight(k.id, seen), 0) +
        verticalGap * (kids.length - 1);
      const h = Math.max(box.height, sumKids);
      subtreeHeightCache.set(id, h);
      return h;
    };

    const rightBranchRoots: MindMapNode[] = [];
    const leftBranchRoots: MindMapNode[] = [];
    let rightWeight = 0;
    let leftWeight = 0;

    rootChildren.forEach((child, idx) => {
      const w = measureSubtreeHeight(child.id);
      if (idx === 0 || rightWeight <= leftWeight) {
        rightBranchRoots.push(child);
        rightWeight += w;
      } else {
        leftBranchRoots.push(child);
        leftWeight += w;
      }
    });

    const placeRadialSubtree = (
      id: string,
      parentX: number,
      parentWidth: number,
      centerY: number,
      dir: 1 | -1,
      seen = new Set<string>()
    ) => {
      if (seen.has(id)) return;
      seen.add(id);
      const box = boxes.get(id) || { width: 160, height: 48 };
      const x = parentX + dir * (parentWidth / 2 + horizontalGap + box.width / 2);
      autoPositions.set(id, { x, y: centerY, side: dir === 1 ? 'right' : 'left' });

      const kids = getVisibleChildren(id);
      if (kids.length === 0) return;

      const totalH =
        kids.reduce((acc, k) => acc + measureSubtreeHeight(k.id), 0) +
        verticalGap * (kids.length - 1);
      let cursorY = centerY - totalH / 2;

      for (const kid of kids) {
        const kh = measureSubtreeHeight(kid.id);
        const kidCenterY = cursorY + kh / 2;
        placeRadialSubtree(kid.id, x, box.width, kidCenterY, dir, seen);
        cursorY += kh + verticalGap;
      }
    };

    const rootBox = boxes.get(rootId) || { width: 200, height: 54 };
    const placeWing = (branchRoots: MindMapNode[], dir: 1 | -1) => {
      if (branchRoots.length === 0) return;
      const wingGap = 26;
      const totalH =
        branchRoots.reduce((acc, k) => acc + measureSubtreeHeight(k.id), 0) +
        wingGap * (branchRoots.length - 1);
      let cursorY = -totalH / 2;
      for (const br of branchRoots) {
        const bh = measureSubtreeHeight(br.id);
        placeRadialSubtree(br.id, 0, rootBox.width, cursorY + bh / 2, dir);
        cursorY += bh + wingGap;
      }
    };

    placeWing(rightBranchRoots, 1);
    placeWing(leftBranchRoots, -1);
  } else if (doc.style === 'hierarchical') {
    // Top-Down Structured Medical Taxonomy Tree with Mobile-Friendly Aspect Ratio
    // Wraps wide sibling sets into balanced tiers (max 4 columns per tier) so the graph
    // never becomes 2800px wide and never shrinks to an unreadable 16% zoom.
    const hGap = 26;
    const levelGap = 76;
    const tierGap = 68;
    const maxColsPerRow = 4;

    const subtreeSizeCache = new Map<string, { width: number; height: number }>();
    const measureSubtreeSize = (
      id: string,
      seen = new Set<string>()
    ): { width: number; height: number } => {
      if (subtreeSizeCache.has(id)) return subtreeSizeCache.get(id)!;
      if (seen.has(id)) return { width: 170, height: 50 };
      seen.add(id);
      const box = boxes.get(id) || { width: 170, height: 50 };
      const kids = getVisibleChildren(id);
      if (kids.length === 0) {
        const res = { width: box.width, height: box.height };
        subtreeSizeCache.set(id, res);
        return res;
      }

      // Split kids into rows of up to maxColsPerRow
      let maxRowW = box.width;
      let totalTiersH = 0;
      for (let i = 0; i < kids.length; i += maxColsPerRow) {
        const chunk = kids.slice(i, i + maxColsPerRow);
        const chunkSizes = chunk.map((k) => measureSubtreeSize(k.id, new Set(seen)));
        const rowW =
          chunkSizes.reduce((acc, s) => acc + s.width, 0) +
          hGap * Math.max(0, chunk.length - 1);
        const rowH = Math.max(...chunkSizes.map((s) => s.height), 48);
        if (rowW > maxRowW) maxRowW = rowW;
        totalTiersH += rowH + (i > 0 ? tierGap : 0);
      }

      const res = {
        width: maxRowW,
        height: box.height + levelGap + totalTiersH
      };
      subtreeSizeCache.set(id, res);
      return res;
    };

    const placeHierarchical = (
      id: string,
      centerX: number,
      topY: number,
      seen = new Set<string>()
    ) => {
      if (seen.has(id)) return;
      seen.add(id);
      const box = boxes.get(id) || { width: 170, height: 50 };
      const y = topY + box.height / 2;
      autoPositions.set(id, { x: centerX, y, side: 'center' });

      const kids = getVisibleChildren(id);
      if (kids.length === 0) return;

      let tierTopY = topY + box.height + levelGap;
      for (let i = 0; i < kids.length; i += maxColsPerRow) {
        const chunk = kids.slice(i, i + maxColsPerRow);
        const chunkSizes = chunk.map((k) => measureSubtreeSize(k.id));
        const rowW =
          chunkSizes.reduce((acc, s) => acc + s.width, 0) +
          hGap * Math.max(0, chunk.length - 1);
        const rowH = Math.max(...chunkSizes.map((s) => s.height), 48);
        let cursorX = centerX - rowW / 2;

        for (let j = 0; j < chunk.length; j++) {
          const kid = chunk[j];
          const kw = chunkSizes[j].width;
          placeHierarchical(kid.id, cursorX + kw / 2, tierTopY, seen);
          cursorX += kw + hGap;
        }
        tierTopY += rowH + tierGap;
      }
    };

    placeHierarchical(rootId, 0, 0);
  } else {
    // Medical Flow Map (Layered Clinical Pathway / Diagnostic-Treatment Algorithm)
    const outgoing = new Map<string, string[]>();
    for (const id of visibleIds) {
      outgoing.set(id, []);
    }
    for (const id of visibleIds) {
      const node = nodeMap.get(id);
      if (node?.parentId && visibleIds.has(node.parentId)) {
        outgoing.get(node.parentId)!.push(id);
      }
    }
    for (const edge of doc.edges || []) {
      if (visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId)) {
        outgoing.get(edge.sourceId)!.push(edge.targetId);
      }
    }

    const layerOf = new Map<string, number>();
    const queue: string[] = [rootId];
    layerOf.set(rootId, 0);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLayer = layerOf.get(curr) || 0;
      const targets = outgoing.get(curr) || [];
      for (const nextId of targets) {
        if (!layerOf.has(nextId)) {
          layerOf.set(nextId, currLayer + 1);
          queue.push(nextId);
        }
      }
    }

    for (const id of visibleIds) {
      if (!layerOf.has(id)) {
        layerOf.set(id, depthMap.get(id) || 1);
      }
    }

    const layers = new Map<number, string[]>();
    for (const [id, layer] of layerOf.entries()) {
      const bucket = layers.get(layer) || [];
      bucket.push(id);
      layers.set(layer, bucket);
    }

    const hierarchyRank = new Map<string, number>();
    let nextRank = 0;
    const rankTree = (id: string, seen = new Set<string>()) => {
      if (seen.has(id)) return;
      seen.add(id);
      hierarchyRank.set(id, nextRank++);
      (childrenMap.get(id) || []).forEach((child) => rankTree(child.id, seen));
    };
    rankTree(rootId);
    const sortedLayers = Array.from(layers.keys()).sort((a, b) => a - b);
    const colGap = 96;
    const rowGap = 38;
    let cursorX = 0;

    for (const layerIdx of sortedLayers) {
      const ids = layers.get(layerIdx) || [];
      ids.sort(
        (a, b) =>
          (hierarchyRank.get(a) ?? Number.MAX_SAFE_INTEGER) -
          (hierarchyRank.get(b) ?? Number.MAX_SAFE_INTEGER)
      );

      const maxColWidth = Math.max(...ids.map((id) => boxes.get(id)?.width ?? 170));
      const totalColHeight =
        ids.reduce((acc, id) => acc + (boxes.get(id)?.height ?? 48), 0) +
        rowGap * Math.max(0, ids.length - 1);

      const centerX = cursorX + maxColWidth / 2;
      let cursorY = -totalColHeight / 2;

      for (const id of ids) {
        const box = boxes.get(id) || { width: 170, height: 48 };
        autoPositions.set(id, {
          x: centerX,
          y: cursorY + box.height / 2,
          side: layerIdx === 0 ? 'center' : 'right'
        });
        cursorY += box.height + rowGap;
      }

      cursorX += maxColWidth + colGap;
    }
  }

  let extraIndex = 0;
  for (const id of visibleIds) {
    if (!autoPositions.has(id)) {
      autoPositions.set(id, {
        x: 240,
        y: 160 + extraIndex * 84,
        side: 'right'
      });
      extraIndex += 1;
    }
  }

  const positionedNodes: PositionedMindMapNode[] = [];
  const positionedMap = new Map<string, PositionedMindMapNode>();

  for (const id of visibleIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const box = boxes.get(id)!;
    const auto = autoPositions.get(id) || { x: 0, y: 0, side: 'center' as const };
    const x =
      typeof node.position?.x === 'number' && Number.isFinite(node.position.x)
        ? node.position.x
        : auto.x;
    const y =
      typeof node.position?.y === 'number' && Number.isFinite(node.position.y)
        ? node.position.y
        : auto.y;

    const allChildren = childrenMap.get(id) || [];
    const isCollapsed = collapsedIds.has(id) && allChildren.length > 0;
    const hiddenDescendantsCount = isCollapsed ? countAllDescendants(id, childrenMap) : 0;

    const pNode: PositionedMindMapNode = {
      node,
      x,
      y,
      width: box.width,
      height: box.height,
      depth: depthMap.get(id) ?? 0,
      side: auto.side,
      hasChildren: allChildren.length > 0,
      hiddenDescendantsCount,
      isCollapsed,
      lines: box.lines,
      sublabelLine: box.sublabelLine,
      noteLines: box.noteLines
    };
    positionedNodes.push(pNode);
    positionedMap.set(id, pNode);
  }

  // Resolve imported/manual coordinate collisions before drawing connectors.
  const positionedById = new Map(positionedNodes.map((node) => [node.node.id, node]));
  const orderedForCollision = [...positionedNodes].sort(
    (a, b) => a.depth - b.depth || a.y - b.y || a.x - b.x
  );
  const placedForCollision: PositionedMindMapNode[] = [];
  for (const current of orderedForCollision) {
    const branchIds = new Set<string>();
    const collectBranch = (id: string) => {
      if (branchIds.has(id)) return;
      branchIds.add(id);
      (childrenMap.get(id) || []).forEach((child) => collectBranch(child.id));
    };
    collectBranch(current.node.id);

    let shiftY = 0;
    let attempts = 0;
    while (attempts++ < positionedNodes.length + 2) {
      const top = current.y + shiftY - current.height / 2;
      const bottom = current.y + shiftY + current.height / 2;
      const collision = placedForCollision.find((placed) => {
        if (branchIds.has(placed.node.id)) return false;
        const horizontalOverlap =
          Math.abs(current.x - placed.x) < (current.width + placed.width) / 2 + 16;
        const verticalOverlap =
          top < placed.y + placed.height / 2 + 18 &&
          bottom > placed.y - placed.height / 2 - 18;
        return horizontalOverlap && verticalOverlap;
      });
      if (!collision) break;
      const requiredTop = collision.y + collision.height / 2 + 20;
      shiftY = Math.max(shiftY, requiredTop - (current.y - current.height / 2));
    }

    if (shiftY > 0) {
      branchIds.forEach((id) => {
        const branchNode = positionedById.get(id);
        if (branchNode) branchNode.y += shiftY;
      });
    }
    placedForCollision.push(current);
  }

  // Assemble Edges (Parent-Child tree connectors + custom labeled relationships)
  const positionedEdges: PositionedMindMapEdge[] = [];
  const existingEdgeLookup = new Map<string, MindMapEdge>();
  for (const edge of doc.edges || []) {
    existingEdgeLookup.set(`${edge.sourceId}::${edge.targetId}`, edge);
  }
  const renderedEdgePairs = new Set<string>();

  for (const pNode of positionedNodes) {
    const parentId = pNode.node.parentId;
    if (!parentId) continue;
    const pParent = positionedMap.get(parentId);
    if (!pParent) continue;

    const pairKey = `${parentId}::${pNode.node.id}`;
    renderedEdgePairs.add(pairKey);
    const matchingCustomEdge = existingEdgeLookup.get(pairKey);

    const anchor = computeAnchorPoints(pParent, pNode, doc.style);
    const curve = computeCubicPath(
      anchor.sx,
      anchor.sy,
      anchor.tx,
      anchor.ty,
      anchor.orientation
    );

    positionedEdges.push({
      id: matchingCustomEdge?.id || `tree-${parentId}-${pNode.node.id}`,
      sourceId: parentId,
      targetId: pNode.node.id,
      path: curve.path,
      label: matchingCustomEdge?.label,
      labelX: curve.labelX,
      labelY: curve.labelY,
      isCrossLink: false,
      directed: matchingCustomEdge?.directed ?? doc.style === 'medical_flow',
      lineStyle: matchingCustomEdge?.lineStyle || 'solid',
      role: pNode.node.role as MindMapNodeRole
    });
  }

  const crossEdges = (doc.edges || []).filter((edge) => {
    const pairKey = `${edge.sourceId}::${edge.targetId}`;
    return (
      !renderedEdgePairs.has(pairKey) &&
      positionedMap.has(edge.sourceId) &&
      positionedMap.has(edge.targetId) &&
      edge.sourceId !== edge.targetId
    );
  });
  const rightmostCardEdge = Math.max(
    ...positionedNodes.map((node) => node.x + node.width / 2),
    0
  );
  const laneIntervals: Array<Array<[number, number]>> = [];
  const edgeLane = new Map<string, number>();
  const sortedCrossEdges = [...crossEdges].sort((a, b) => {
    const aSrc = positionedMap.get(a.sourceId)!;
    const aTgt = positionedMap.get(a.targetId)!;
    const bSrc = positionedMap.get(b.sourceId)!;
    const bTgt = positionedMap.get(b.targetId)!;
    return Math.min(aSrc.y, aTgt.y) - Math.min(bSrc.y, bTgt.y);
  });
  for (const edge of sortedCrossEdges) {
    const src = positionedMap.get(edge.sourceId)!;
    const tgt = positionedMap.get(edge.targetId)!;
    const start = Math.min(src.y, tgt.y) - 18;
    const end = Math.max(src.y, tgt.y) + 18;
    let lane = laneIntervals.findIndex((intervals) =>
      intervals.every(([a, b]) => end < a || start > b)
    );
    if (lane < 0) lane = laneIntervals.length;
    if (!laneIntervals[lane]) laneIntervals[lane] = [];
    laneIntervals[lane].push([start, end]);
    edgeLane.set(edge.id, lane);
  }

  for (const edge of crossEdges) {
    const pSrc = positionedMap.get(edge.sourceId)!;
    const pTgt = positionedMap.get(edge.targetId)!;
    const laneIndex = edgeLane.get(edge.id) || 0;
    const laneX = rightmostCardEdge + 38 + laneIndex * 32;
    const curve = computeCrossLinkPath(pSrc, pTgt, laneX);
    positionedEdges.push({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      path: curve.path,
      label: edge.label,
      labelX: curve.labelX,
      labelY: curve.labelY,
      sourceX: curve.sourceX,
      sourceY: curve.sourceY,
      isCrossLink: true,
      directed: edge.directed ?? true,
      lineStyle: edge.lineStyle || 'dashed',
      role: pTgt.node.role
    });
  }

  // Edge Label Collision Avoidance & Viewport Bounds Inclusion:
  // Prevent secondary cross-link edge labels ("depolarized by graded stimuli to", "threshold reached")
  // from stacking on top of each other or overlapping node cards.
  const occupiedRects: Array<{ minX: number; minY: number; maxX: number; maxY: number }> =
    positionedNodes.map((pn) => ({
      minX: pn.x - pn.width / 2 - 6,
      minY: pn.y - pn.height / 2 - 6,
      maxX: pn.x + pn.width / 2 + 6,
      maxY: pn.y + pn.height / 2 + 6
    }));

  const candidateOffsets: Array<[number, number]> = [
    [0, 0],
    [0, -24],
    [0, 24],
    [-28, -22],
    [-28, 22],
    [0, -48],
    [0, 48],
    [-44, 0],
    [28, -24],
    [28, 24],
    [0, -72],
    [0, 72]
  ];

  for (const edge of positionedEdges) {
    if (!edge.label) continue;
    const pill = estimateEdgeLabelPillSize(edge.label);
    if (pill.width <= 0) continue;

    let bestX = edge.labelX;
    let bestY = edge.labelY;

    // For outer right-lane cross-links, pull label slightly inward so it doesn't jut out past the lane
    if (edge.isCrossLink && bestX > rightmostCardEdge + 12) {
      bestX = Math.min(bestX, rightmostCardEdge + 24);
    }

    for (const [dx, dy] of candidateOffsets) {
      const cx = bestX + dx;
      const cy = bestY + dy;
      const rect = {
        minX: cx - pill.width / 2 - 4,
        minY: cy - pill.height / 2 - 3,
        maxX: cx + pill.width / 2 + 4,
        maxY: cy + pill.height / 2 + 3
      };
      const collides = occupiedRects.some(
        (r) =>
          rect.minX < r.maxX &&
          rect.maxX > r.minX &&
          rect.minY < r.maxY &&
          rect.maxY > r.minY
      );
      if (!collides) {
        bestX = cx;
        bestY = cy;
        break;
      }
    }

    edge.labelX = Math.round(bestX);
    edge.labelY = Math.round(bestY);
    occupiedRects.push({
      minX: edge.labelX - pill.width / 2 - 4,
      minY: edge.labelY - pill.height / 2 - 3,
      maxX: edge.labelX + pill.width / 2 + 4,
      maxY: edge.labelY + pill.height / 2 + 3
    });
  }

  // Compute overall bounding box including both node cards and edge label pills
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pn of positionedNodes) {
    minX = Math.min(minX, pn.x - pn.width / 2);
    maxX = Math.max(maxX, pn.x + pn.width / 2);
    minY = Math.min(minY, pn.y - pn.height / 2);
    maxY = Math.max(maxY, pn.y + pn.height / 2 + (pn.hasChildren ? 18 : 0));
  }

  for (const edge of positionedEdges) {
    if (edge.label) {
      const pill = estimateEdgeLabelPillSize(edge.label);
      minX = Math.min(minX, edge.labelX - pill.width / 2 - 8);
      maxX = Math.max(maxX, edge.labelX + pill.width / 2 + 8);
      minY = Math.min(minY, edge.labelY - pill.height / 2 - 8);
      maxY = Math.max(maxY, edge.labelY + pill.height / 2 + 8);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -200;
    maxX = 200;
    minY = -150;
    maxY = 150;
  }

  const outerLaneCount = Math.max(1, ...Array.from(edgeLane.values(), (lane) => lane + 1));
  const outerLaneExtent = crossEdges.length ? 36 + outerLaneCount * 24 : 0;
  const padding = 52;
  minX -= padding;
  maxX += Math.max(padding, outerLaneExtent);
  minY -= padding;
  maxY += padding;

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    bounds: {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(320, maxX - minX),
      height: Math.max(240, maxY - minY)
    }
  };
}
