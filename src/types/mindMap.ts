export type MindMapStyle = 'radial' | 'hierarchical' | 'medical_flow';
export type MindMapColorMode = 'branch' | 'role';

export type MindMapNodeRole =
  | 'root'
  | 'concept'
  | 'mechanism'
  | 'diagnosis'
  | 'treatment'
  | 'warning';

export interface MindMapPoint {
  x: number;
  y: number;
}

export interface MindMapNode {
  id: string;
  /** Concise primary display label (kept short & clear for fast visual scanning) */
  label: string;
  /** Optional short secondary cue (e.g., Arabic translation, key value, or drug class) */
  sublabel?: string;
  /** Optional clinical note shown in a two-line card preview and fully in the inspector. */
  note?: string;
  /** Parent node ID for tree hierarchy; null/undefined for root or independent flow nodes */
  parentId: string | null;
  /** Semantic medical-academic role for dual-coded visual clarity */
  role: MindMapNodeRole;
  /** Optional sibling ordering */
  order?: number;
  /** Optional visual shape and accent color for this node */
  shape?: 'rounded' | 'pill' | 'diamond' | 'hexagon' | 'circle';
  color?: string;
  /** Optional manual coordinates set when the user drags the node in the editor */
  position?: MindMapPoint;
}

export interface MindMapEdge {
  id: string;
  sourceId: string;
  targetId: string;
  /** Short relationship label (e.g. "يؤدي إلى", "يُثبّط", "First-line", "If +ve") */
  label?: string;
  /** Visual line type */
  lineStyle?: 'solid' | 'dashed';
  /** Whether to draw a directional arrowhead (defaults to true for flow & cross-links) */
  directed?: boolean;
}

export interface MindMapDocument {
  id: string;
  title: string;
  titleEn?: string;
  subtitle?: string;
  style: MindMapStyle;
  /** Automatic node palette: branch hierarchy by default, or semantic medical role. */
  colorMode?: MindMapColorMode;
  rootNodeId: string;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  /** Optional local link to an in-app TopicArticle (strictly local, never synced to UMEDT-DATA) */
  linkedTopicId?: string;
  /** Optional short tags for local filtering */
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

export type MindMapImportSourceFormat =
  | 'umedt-json'
  | 'tree-json'
  | 'graph-json'
  | 'markdown'
  | 'flow-text'
  | 'indented-text';

export interface MindMapImportPreviewResult {
  success: boolean;
  detectedFormat: MindMapImportSourceFormat;
  detectedFormatLabelAr: string;
  document: MindMapDocument | null;
  stats: {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
    trimmedLongNodes: number;
  };
  warnings: string[];
  error?: string;
}

export interface PositionedMindMapNode {
  node: MindMapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  side: 'center' | 'left' | 'right';
  hasChildren: boolean;
  hiddenDescendantsCount: number;
  isCollapsed: boolean;
  lines: string[];
  sublabelLine?: string;
  noteLines?: string[];
}

export interface PositionedMindMapEdge {
  id: string;
  sourceId: string;
  targetId: string;
  path: string;
  label?: string;
  labelX: number;
  labelY: number;
  isCrossLink: boolean;
  directed: boolean;
  lineStyle: 'solid' | 'dashed';
  role: MindMapNodeRole;
}

export interface MindMapLayoutResult {
  nodes: PositionedMindMapNode[];
  edges: PositionedMindMapEdge[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}
