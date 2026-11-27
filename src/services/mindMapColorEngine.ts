import { MindMapDocument, MindMapNode, MindMapNodeRole } from '../types/mindMap';

export type MindMapColorMode = 'branch' | 'role';

export interface MindMapNodeColors {
  fill: string;
  stroke: string;
  text: string;
}

export const MIND_MAP_COLOR_SWATCHES = [
  { name: 'Teal', base: '#0f766e', shades: ['#0f766e', '#115e59', '#134e4a', '#164e63'] },
  { name: 'Blue', base: '#1d4ed8', shades: ['#1d4ed8', '#1e40af', '#1e3a8a', '#172554'] },
  { name: 'Violet', base: '#6d28d9', shades: ['#6d28d9', '#5b21b6', '#4c1d95', '#2e1065'] },
  { name: 'Rose', base: '#be123c', shades: ['#be123c', '#9f1239', '#881337', '#4c0519'] },
  { name: 'Amber', base: '#92400e', shades: ['#b45309', '#92400e', '#78350f', '#451a03'] },
  { name: 'Cyan', base: '#0e7490', shades: ['#0e7490', '#155e75', '#164e63', '#083344'] },
  { name: 'Indigo', base: '#4338ca', shades: ['#4338ca', '#3730a3', '#312e81', '#1e1b4b'] },
  { name: 'Emerald', base: '#047857', shades: ['#047857', '#065f46', '#064e3b', '#022c22'] }
] as const;

const ROLE_COLORS: Record<MindMapNodeRole, MindMapNodeColors> = {
  root: { fill: '#123b46', stroke: '#5eead4', text: '#f0fdfa' },
  concept: { fill: '#1e293b', stroke: '#94a3b8', text: '#f8fafc' },
  mechanism: { fill: '#172554', stroke: '#60a5fa', text: '#eff6ff' },
  diagnosis: { fill: '#2e1065', stroke: '#c4b5fd', text: '#f5f3ff' },
  treatment: { fill: '#064e3b', stroke: '#6ee7b7', text: '#ecfdf5' },
  warning: { fill: '#4c0519', stroke: '#fda4af', text: '#fff1f2' }
};

const BRANCH_ROOT_COLORS: MindMapNodeColors[] = [
  { fill: '#123f46', stroke: '#5eead4', text: '#f0fdfa' },
  { fill: '#172f59', stroke: '#93c5fd', text: '#eff6ff' },
  { fill: '#35205d', stroke: '#c4b5fd', text: '#f5f3ff' },
  { fill: '#512033', stroke: '#fda4af', text: '#fff1f2' },
  { fill: '#4b3218', stroke: '#fcd34d', text: '#fffbeb' },
  { fill: '#123b50', stroke: '#67e8f9', text: '#ecfeff' },
  { fill: '#29265b', stroke: '#a5b4fc', text: '#eef2ff' },
  { fill: '#123d31', stroke: '#6ee7b7', text: '#ecfdf5' }
];

export function getMindMapNodeColors(
  doc: Pick<MindMapDocument, 'nodes' | 'rootNodeId' | 'colorMode'>,
  node: MindMapNode
): MindMapNodeColors {
  if (node.color && /^#[0-9a-f]{6}$/i.test(node.color)) {
    return { fill: node.color, stroke: node.color, text: '#f8fafc' };
  }

  const role = ROLE_COLORS[node.role] || ROLE_COLORS.concept;
  if ((doc.colorMode || 'branch') === 'role' || node.id === doc.rootNodeId) return role;

  const byId = new Map(doc.nodes.map((item) => [item.id, item]));
  let branch = node;
  let depth = 0;
  const visited = new Set<string>([node.id]);
  while (branch.parentId && branch.parentId !== doc.rootNodeId && !visited.has(branch.parentId)) {
    visited.add(branch.parentId);
    const parent = byId.get(branch.parentId);
    if (!parent) break;
    branch = parent;
    depth += 1;
  }
  if (!branch.parentId || branch.parentId !== doc.rootNodeId) return role;

  const siblings = doc.nodes
    .filter((item) => item.parentId === doc.rootNodeId)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const branchIndex = Math.max(0, siblings.findIndex((item) => item.id === branch.id));
  const base = BRANCH_ROOT_COLORS[branchIndex % BRANCH_ROOT_COLORS.length];
  const shade = depth === 0 ? base : {
    fill: depth === 1 ? base.fill : darkenHex(base.fill, Math.min(0.08 * depth, 0.24)),
    stroke: base.stroke,
    text: base.text
  };
  return shade;
}

function darkenHex(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const factor = 1 - amount;
  const r = Math.round(((value >> 16) & 255) * factor);
  const g = Math.round(((value >> 8) & 255) * factor);
  const b = Math.round((value & 255) * factor);
  return '#' + [r, g, b].map((part) => part.toString(16).padStart(2, '0')).join('');
}
