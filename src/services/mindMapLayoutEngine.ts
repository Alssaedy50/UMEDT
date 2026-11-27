import {
  MindMapDocument,
  MindMapEdge,
  MindMapLayoutResult,
  MindMapNode,
  MindMapNodeRole,
  PositionedMindMapEdge,
  PositionedMindMapNode
} from '../types/mindMap';

const MAX_LABEL_CHARS_PER_LINE = 24;
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
      current = word.length > MAX_LABEL_CHARS_PER_LINE
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
      current = word.length > MAX_LABEL_CHARS_PER_LINE
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
  return clean.length > 28 ? `${clean.slice(0, 27)}…` : clean;
}

function wrapNotePreview(note?: string): string[] {
  const clean = String(note || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const safeWord = word.length > 34 ? word.slice(0, 33) + '…' : word;
    const next = current ? current + ' ' + safeWord : safeWord;
    if (next.length <= 34) current = next;
    else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === 2) break;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  const rendered = lines.join(' ');
  if (rendered.length < clean.length && lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/[.…]*$/, '') + '…';
  return lines.slice(0, 2);
}

function measureNodeBox(node: MindMapNode, isRoot: boolean): {
  width: number;
  height: number;
  lines: string[];
  sublabelLine?: string;
  noteLines: string[];
} {
  const lines = wrapConciseNodeLabel(node.label);
  const sublabelLine = truncateSublabel(node.sublabel);
  const noteLines = wrapNotePreview(node.note);
  const maxChars = Math.max(
    ...lines.map((l) => l.length),
    sublabelLine ? Math.min(sublabelLine.length, 26) : 0,
    ...noteLines.map((line) => line.length)
  );

  const minWidth = isRoot ? 204 : 164;
  const maxWidth = isRoot ? 280 : 260;
  const estimatedWidth = Math.round(maxChars * 7.6 + 48);
  const width = Math.max(minWidth, Math.min(maxWidth, estimatedWidth));

  const baseHeight = isRoot ? 64 : 56;
  const extraLine = lines.length > 1 ? 18 : 0;
  const extraSub = sublabelLine ? 16 : 0;
  const extraNote = noteLines.length * 13;
  // Reserve a dedicated visual line for the parent label so every child card
  // remains identifiable even when relationship connectors are dense.
  const extraParent = node.parentId ? 15 : 0;
  const height = baseHeight + extraLine + extraSub + extraNote + extraParent;

  return { width, height, lines, sublabelLine, noteLines };
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
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0));
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

  const rootId = nodeMap.has(doc.rootNodeId)
    ? doc.rootNodeId
    : doc.nodes[0]?.id;
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
      // Only include if it has no parent, or its parent does not exist in map (not hidden by collapse)
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
      labelY: (sy + ty) / 2 - 8
    };
  }
  const midY = (sy + ty) / 2;
  const path = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
  return {
    path,
    labelX: (sx + tx) / 2,
    labelY: (sy + ty) / 2 - 8
  };
}

function computeAnchorPoints(
  src: PositionedMindMapNode,
  tgt: PositionedMindMapNode,
  style: MindMapDocument['style']
): { sx: number; sy: number; tx: number; ty: number; orientation: 'horizontal' | 'vertical' } {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const clearance = 5;

  let orientation: 'horizontal' | 'vertical';
  if (style === 'hierarchical') {
    orientation = Math.abs(dy) >= 24 ? 'vertical' : 'horizontal';
  } else if (style === 'medical_flow') {
    orientation = Math.abs(dx) >= Math.abs(dy) * 0.85 ? 'horizontal' : 'vertical';
  } else {
    orientation = Math.abs(dx) >= Math.abs(dy) * 0.45 ? 'horizontal' : 'vertical';
  }

  if (orientation === 'horizontal') {
    const direction = dx >= 0 ? 1 : -1;
    return {
      sx: src.x + direction * (src.width / 2 + clearance),
      sy: src.y,
      tx: tgt.x - direction * (tgt.width / 2 + clearance),
      ty: tgt.y,
      orientation
    };
  }

  const direction = dy >= 0 ? 1 : -1;
  return {
    sx: src.x,
    sy: src.y + direction * (src.height / 2 + clearance),
    tx: tgt.x,
    ty: tgt.y - direction * (tgt.height / 2 + clearance),
    orientation
  };
}

function computeCrossLinkPath(
  src: PositionedMindMapNode,
  tgt: PositionedMindMapNode,
  side: 'left' | 'right',
  laneX: number
): { path: string; labelX: number; labelY: number } {
  const clearance = 5;
  const direction = side === 'right' ? 1 : -1;
  const sx = src.x + direction * (src.width / 2 + clearance);
  const sy = src.y;
  const tx = tgt.x + direction * (tgt.width / 2 + clearance);
  const ty = tgt.y;

  // Both control points live in the external lane. The curve therefore leaves
  // the source card, travels outside the complete card field, and re-enters
  // the target from the same outer side without crossing intermediate cards.
  const c1x = laneX;
  const c2x = laneX;
  const path = `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`;

  // Exact cubic Bezier midpoint (t = 0.5), not the midpoint of the endpoints.
  const labelX = 0.125 * sx + 0.375 * c1x + 0.375 * c2x + 0.125 * tx;
  const labelY = 0.125 * sy + 0.375 * sy + 0.375 * ty + 0.125 * ty;
  return { path, labelX, labelY };
}

/**
 * Computes deterministic, non-overlapping node & edge geometry for all 3 academic styles:
 * - radial: Balanced bilateral radial branches extending smoothly left & right from the central concept
 * - hierarchical: Top-down structured medical taxonomy tree with proportional subtree spacing
 * - medical_flow: Layered left-to-right clinical algorithm / pathophysiology pathway with arrows
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
    // Balanced Bilateral Radial Mind Map:
    // Root sits at (0,0); Level-1 branches split symmetrically between right and left wings,
    // each subtree allocated vertical space proportional to its leaf span so zero nodes collide.
    autoPositions.set(rootId, { x: 0, y: 0, side: 'center' });
    const rootChildren = getVisibleChildren(rootId);

    const verticalGap = 40;
    const horizontalGap = 104;

    const subtreeHeightCache = new Map<string, number>();
    const measureSubtreeHeight = (id: string, seen = new Set<string>()): number => {
      if (subtreeHeightCache.has(id)) return subtreeHeightCache.get(id)!;
      if (seen.has(id)) return 64;
      seen.add(id);
      const box = boxes.get(id) || { width: 160, height: 52 };
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
      const box = boxes.get(id) || { width: 160, height: 52 };
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

    const rootBox = boxes.get(rootId) || { width: 210, height: 64 };
    const placeWing = (branchRoots: MindMapNode[], dir: 1 | -1) => {
      if (branchRoots.length === 0) return;
      const wingGap = 40;
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
    // Top-Down Structured Medical Taxonomy Tree
    const hGap = 62;
    const levelGap = 124;

    const subtreeWidthCache = new Map<string, number>();
    const measureSubtreeWidth = (id: string, seen = new Set<string>()): number => {
      if (subtreeWidthCache.has(id)) return subtreeWidthCache.get(id)!;
      if (seen.has(id)) return 170;
      seen.add(id);
      const box = boxes.get(id) || { width: 170, height: 52 };
      const kids = getVisibleChildren(id);
      if (kids.length === 0) {
        subtreeWidthCache.set(id, box.width);
        return box.width;
      }
      const sumKids =
        kids.reduce((acc, k) => acc + measureSubtreeWidth(k.id, seen), 0) +
        hGap * (kids.length - 1);
      const w = Math.max(box.width, sumKids);
      subtreeWidthCache.set(id, w);
      return w;
    };

    const placeHierarchical = (
      id: string,
      centerX: number,
      topY: number,
      seen = new Set<string>()
    ) => {
      if (seen.has(id)) return;
      seen.add(id);
      const box = boxes.get(id) || { width: 170, height: 52 };
      const y = topY + box.height / 2;
      autoPositions.set(id, { x: centerX, y, side: 'center' });

      const kids = getVisibleChildren(id);
      if (kids.length === 0) return;

      const totalW =
        kids.reduce((acc, k) => acc + measureSubtreeWidth(k.id), 0) +
        hGap * (kids.length - 1);
      let cursorX = centerX - totalW / 2;
      const nextTopY = topY + box.height + levelGap;

      for (const kid of kids) {
        const kw = measureSubtreeWidth(kid.id);
        placeHierarchical(kid.id, cursorX + kw / 2, nextTopY, seen);
        cursorX += kw + hGap;
      }
    };

    placeHierarchical(rootId, 0, 0);
  } else {
    // Medical Flow Map (Layered Clinical Pathway / Diagnostic-Treatment Algorithm)
    // Assign layers via BFS across BOTH parent-child relations and explicit directed edges
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

    // Any disconnected visible nodes go to layer 1
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
    const colGap = 128;
    const rowGap = 52;
    let cursorX = 0;

    for (const layerIdx of sortedLayers) {
      const ids = layers.get(layerIdx) || [];
      ids.sort((a, b) => (hierarchyRank.get(a) ?? Number.MAX_SAFE_INTEGER) - (hierarchyRank.get(b) ?? Number.MAX_SAFE_INTEGER));

      const maxColWidth = Math.max(
        ...ids.map((id) => (boxes.get(id)?.width ?? 170))
      );
      const totalColHeight =
        ids.reduce((acc, id) => acc + (boxes.get(id)?.height ?? 54), 0) +
        rowGap * Math.max(0, ids.length - 1);

      const centerX = cursorX + maxColWidth / 2;
      let cursorY = -totalColHeight / 2;

      for (const id of ids) {
        const box = boxes.get(id) || { width: 170, height: 54 };
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

  // Fallback position for any independent visible nodes not placed by tree traversal
  let extraIndex = 0;
  for (const id of visibleIds) {
    if (!autoPositions.has(id)) {
      autoPositions.set(id, {
        x: 260,
        y: 180 + extraIndex * 96,
        side: 'right'
      });
      extraIndex += 1;
    }
  }

  // Assemble Positioned Nodes (respecting manual user drag positions when set)
  const positionedNodes: PositionedMindMapNode[] = [];
  const positionedMap = new Map<string, PositionedMindMapNode>();

  for (const id of visibleIds) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const box = boxes.get(id)!;
    const auto = autoPositions.get(id) || { x: 0, y: 0, side: 'center' as const };
    const x = typeof node.position?.x === 'number' && Number.isFinite(node.position.x)
      ? node.position.x
      : auto.x;
    const y = typeof node.position?.y === 'number' && Number.isFinite(node.position.y)
      ? node.position.y
      : auto.y;

    const allChildren = childrenMap.get(id) || [];
    const isCollapsed = collapsedIds.has(id) && allChildren.length > 0;
    const hiddenDescendantsCount = isCollapsed
      ? countAllDescendants(id, childrenMap)
      : 0;

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
  // Move a colliding branch as a unit so parent-child geometry remains coherent.
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
          Math.abs(current.x - placed.x) < (current.width + placed.width) / 2 + 18;
        const verticalOverlap =
          top < placed.y + placed.height / 2 + 22 &&
          bottom > placed.y - placed.height / 2 - 22;
        return horizontalOverlap && verticalOverlap;
      });
      if (!collision) break;
      const requiredTop = collision.y + collision.height / 2 + 24;
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

  // Assemble hierarchy connectors and routed cross-branch relationships.
  const positionedEdges: PositionedMindMapEdge[] = [];
  const existingEdgeLookup = new Map<string, MindMapEdge>();
  for (const edge of doc.edges || []) {
    existingEdgeLookup.set(`${edge.sourceId}::${edge.targetId}`, edge);
  }
  const renderedEdgePairs = new Set<string>();
  const cardMinX = Math.min(...positionedNodes.map((node) => node.x - node.width / 2));
  const cardMaxX = Math.max(...positionedNodes.map((node) => node.x + node.width / 2));
  const fieldCenterX = (cardMinX + cardMaxX) / 2;
  const laneIntervals: Record<'left' | 'right', Array<{ top: number; bottom: number; lane: number }>> = {
    left: [],
    right: []
  };
  let routedMinX = cardMinX;
  let routedMaxX = cardMaxX;

  for (const pNode of positionedNodes) {
    const parentId = pNode.node.parentId;
    if (!parentId) continue;
    const pParent = positionedMap.get(parentId);
    if (!pParent) continue;

    const pairKey = `${parentId}::${pNode.node.id}`;
    renderedEdgePairs.add(pairKey);
    const matchingCustomEdge = existingEdgeLookup.get(pairKey);
    const anchor = computeAnchorPoints(pParent, pNode, doc.style);
    const curve = computeCubicPath(anchor.sx, anchor.sy, anchor.tx, anchor.ty, anchor.orientation);

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

  const crossEdges = (doc.edges || [])
    .filter((edge) => {
      const pairKey = `${edge.sourceId}::${edge.targetId}`;
      return !renderedEdgePairs.has(pairKey) &&
        positionedMap.has(edge.sourceId) &&
        positionedMap.has(edge.targetId) &&
        edge.sourceId !== edge.targetId;
    })
    .map((edge) => {
      const source = positionedMap.get(edge.sourceId)!;
      const target = positionedMap.get(edge.targetId)!;
      return { edge, source, target, top: Math.min(source.y, target.y), bottom: Math.max(source.y, target.y) };
    })
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom);

  for (const item of crossEdges) {
    const { edge, source, target } = item;
    const side: 'left' | 'right' =
      (source.x + target.x) / 2 >= fieldCenterX ? 'right' : 'left';
    const intervals = laneIntervals[side];
    let lane = 0;
    while (intervals.some((used) =>
      used.lane === lane &&
      item.top - 24 < used.bottom + 24 &&
      item.bottom + 24 > used.top - 24
    )) lane += 1;
    intervals.push({ top: item.top, bottom: item.bottom, lane });

    const laneClearance = 56 + lane * 28;
    const laneX = side === 'right' ? cardMaxX + laneClearance : cardMinX - laneClearance;
    routedMinX = Math.min(routedMinX, laneX - 12);
    routedMaxX = Math.max(routedMaxX, laneX + 12);
    const curve = computeCrossLinkPath(source, target, side, laneX);

    positionedEdges.push({
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      path: curve.path,
      label: edge.label,
      labelX: curve.labelX,
      labelY: curve.labelY,
      isCrossLink: true,
      directed: edge.directed ?? true,
      lineStyle: edge.lineStyle || 'dashed',
      role: target.node.role
    });
  }

  // Compute overall bounding box with generous academic margin
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pn of positionedNodes) {
    minX = Math.min(minX, pn.x - pn.width / 2);
    maxX = Math.max(maxX, pn.x + pn.width / 2);
    minY = Math.min(minY, pn.y - pn.height / 2);
    maxY = Math.max(maxY, pn.y + pn.height / 2);
  }

  if (!Number.isFinite(minX)) {
    minX = -200;
    maxX = 200;
    minY = -150;
    maxY = 150;
  }

  minX = Math.min(minX, routedMinX);
  maxX = Math.max(maxX, routedMaxX);

  // Include routed relationship labels so outer-lane pills remain inside the SVG viewBox.
  for (const edge of positionedEdges) {
    if (!edge.label) continue;
    const labelHalfWidth = Math.max(32, Math.min(110, edge.label.length * 3.6 + 12));
    minX = Math.min(minX, edge.labelX - labelHalfWidth);
    maxX = Math.max(maxX, edge.labelX + labelHalfWidth);
    minY = Math.min(minY, edge.labelY - 14);
    maxY = Math.max(maxY, edge.labelY + 14);
  }

  const padding = 84;
  minX -= padding;
  maxX += padding;
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
