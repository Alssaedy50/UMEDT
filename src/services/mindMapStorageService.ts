import { TopicArticle } from '../types/lexicon';
import {
  MindMapDocument,
  MindMapEdge,
  MindMapLayoutResult,
  MindMapNode,
  MindMapNodeRole,
  MindMapStyle
} from '../types/mindMap';

export const MIND_MAPS_STORAGE_KEY = 'dictengine_umd_mind_maps_v1';
export const MIND_MAPS_UPDATED_EVENT = 'umed:mindmaps-updated';

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

function notifyMindMapsUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MIND_MAPS_UPDATED_EVENT));
  }
}

export function normalizeMindMapDocument(raw: unknown): MindMapDocument | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : '';
  if (!id || !Array.isArray(obj.nodes) || obj.nodes.length === 0) return null;

  const nodes: MindMapNode[] = (obj.nodes as Array<Record<string, unknown>>)
    .filter((n) => n && typeof n === 'object')
    .map((n, idx) => ({
      id: String(n.id || `n-${idx + 1}`),
      label: String(n.label || `Node ${idx + 1}`).trim() || `Node ${idx + 1}`,
      sublabel: typeof n.sublabel === 'string' && n.sublabel.trim() ? n.sublabel.trim() : undefined,
      note: typeof n.note === 'string' && n.note.trim() ? n.note.trim() : undefined,
      parentId: typeof n.parentId === 'string' && n.parentId.trim() ? n.parentId.trim() : null,
      role: (
        ['root', 'concept', 'mechanism', 'diagnosis', 'treatment', 'warning'].includes(
          String(n.role || '')
        )
          ? n.role
          : idx === 0
            ? 'root'
            : 'concept'
      ) as MindMapNodeRole,
      order: typeof n.order === 'number' ? n.order : idx,
      position:
        n.position &&
        typeof n.position === 'object' &&
        typeof (n.position as Record<string, unknown>).x === 'number' &&
        typeof (n.position as Record<string, unknown>).y === 'number'
          ? {
              x: Number((n.position as Record<string, unknown>).x),
              y: Number((n.position as Record<string, unknown>).y)
            }
          : undefined
    }));

  if (nodes.length === 0) return null;

  const validIds = new Set(nodes.map((n) => n.id));
  const rootNodeId =
    typeof obj.rootNodeId === 'string' && validIds.has(obj.rootNodeId)
      ? obj.rootNodeId
      : nodes.find((n) => !n.parentId)?.id || nodes[0].id;

  const edges: MindMapEdge[] = Array.isArray(obj.edges)
    ? (obj.edges as Array<Record<string, unknown>>)
        .filter(
          (e) =>
            e &&
            typeof e === 'object' &&
            validIds.has(String(e.sourceId || '')) &&
            validIds.has(String(e.targetId || '')) &&
            String(e.sourceId) !== String(e.targetId)
        )
        .map((e, idx) => ({
          id: String(e.id || `e-${idx + 1}`),
          sourceId: String(e.sourceId),
          targetId: String(e.targetId),
          label: typeof e.label === 'string' && e.label.trim() ? e.label.trim() : undefined,
          lineStyle: e.lineStyle === 'dashed' ? 'dashed' : 'solid',
          directed: e.directed !== false
        }))
    : [];

  const style: MindMapStyle =
    obj.style === 'hierarchical' || obj.style === 'medical_flow' || obj.style === 'radial'
      ? obj.style
      : 'radial';

  const now = new Date().toISOString();
  return {
    id,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : nodes[0].label,
    titleEn: typeof obj.titleEn === 'string' && obj.titleEn.trim() ? obj.titleEn.trim() : undefined,
    subtitle: typeof obj.subtitle === 'string' && obj.subtitle.trim() ? obj.subtitle.trim() : undefined,
    style,
    rootNodeId,
    nodes,
    edges,
    linkedTopicId:
      typeof obj.linkedTopicId === 'string' && obj.linkedTopicId.trim()
        ? obj.linkedTopicId.trim()
        : undefined,
    tags: Array.isArray(obj.tags) ? obj.tags.map(String).filter(Boolean) : undefined,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : now,
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : now,
    schemaVersion: typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 1
  };
}

export function loadMindMaps(): MindMapDocument[] {
  const storage = getSafeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(MIND_MAPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeMindMapDocument(item))
      .filter((item): item is MindMapDocument => Boolean(item));
  } catch {
    return [];
  }
}

export function saveMindMaps(maps: MindMapDocument[]): void {
  const storage = getSafeStorage();
  if (!storage) return;
  try {
    const normalized = maps
      .map((m) => normalizeMindMapDocument(m))
      .filter((m): m is MindMapDocument => Boolean(m));
    storage.setItem(MIND_MAPS_STORAGE_KEY, JSON.stringify(normalized));
    notifyMindMapsUpdated();
  } catch {
    // ignore storage quota errors
  }
}

export function upsertMindMap(doc: MindMapDocument): MindMapDocument[] {
  const current = loadMindMaps();
  const nextDoc: MindMapDocument = {
    ...doc,
    updatedAt: new Date().toISOString(),
    schemaVersion: doc.schemaVersion || 1
  };
  const exists = current.some((m) => m.id === nextDoc.id);
  const updated = exists
    ? current.map((m) => (m.id === nextDoc.id ? nextDoc : m))
    : [nextDoc, ...current];
  saveMindMaps(updated);
  return updated;
}

export function deleteMindMap(mindMapId: string): MindMapDocument[] {
  const current = loadMindMaps();
  const updated = current.filter((m) => m.id !== mindMapId);
  saveMindMaps(updated);
  return updated;
}

export function getMindMapsForTopic(
  topic: TopicArticle,
  allMaps?: MindMapDocument[]
): MindMapDocument[] {
  const source = allMaps || loadMindMaps();
  const linked = source.filter((m) => m.linkedTopicId === topic.id);
  const seenIds = new Set(linked.map((m) => m.id));

  // Include inline mind maps embedded inside topic content blocks if not already in storage
  for (const sec of topic.sections || []) {
    for (const blk of sec.contentBlocks || []) {
      if (blk.type === 'mind_map' && blk.mindMapData) {
        const normalized = normalizeMindMapDocument({
          ...blk.mindMapData,
          linkedTopicId: blk.mindMapData.linkedTopicId || topic.id
        });
        if (normalized && !seenIds.has(normalized.id)) {
          seenIds.add(normalized.id);
          linked.push(normalized);
        }
      }
    }
  }

  return linked;
}

export function createBlankMindMap(options?: {
  topic?: TopicArticle | null;
  title?: string;
  style?: MindMapStyle;
}): MindMapDocument {
  const now = new Date().toISOString();
  const topic = options?.topic;
  const rootLabel =
    options?.title?.trim() ||
    topic?.titleEn?.trim() ||
    topic?.title?.trim() ||
    'المفهوم الطبي الرئيسي';
  const rootSublabel = topic?.titleAr?.trim() || topic?.subtitle?.trim() || undefined;
  const id = `mm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const nodes: MindMapNode[] = [
    {
      id: 'n-root',
      label: rootLabel.slice(0, 54),
      sublabel: rootSublabel && rootSublabel !== rootLabel ? rootSublabel.slice(0, 42) : undefined,
      parentId: null,
      role: 'root',
      order: 0
    },
    {
      id: 'n-mech',
      label: 'Pathophysiology',
      sublabel: 'الآلية المرضية',
      parentId: 'n-root',
      role: 'mechanism',
      order: 1
    },
    {
      id: 'n-diag',
      label: 'Diagnosis & Workup',
      sublabel: 'التشخيص والفحوصات',
      parentId: 'n-root',
      role: 'diagnosis',
      order: 2
    },
    {
      id: 'n-tx',
      label: 'Management & Therapy',
      sublabel: 'العلاج والتدبير',
      parentId: 'n-root',
      role: 'treatment',
      order: 3
    }
  ];

  const style = options?.style || 'radial';
  const edges: MindMapEdge[] =
    style === 'medical_flow'
      ? [
          {
            id: 'e-1',
            sourceId: 'n-mech',
            targetId: 'n-diag',
            label: 'تقييم',
            directed: true,
            lineStyle: 'dashed'
          },
          {
            id: 'e-2',
            sourceId: 'n-diag',
            targetId: 'n-tx',
            label: 'خطة العلاج',
            directed: true,
            lineStyle: 'dashed'
          }
        ]
      : [];

  return {
    id,
    title: rootLabel,
    titleEn: topic?.titleEn || undefined,
    subtitle: rootSublabel,
    style,
    rootNodeId: 'n-root',
    nodes,
    edges,
    linkedTopicId: topic?.id,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1
  };
}

function inferRoleFromHeadingOrText(text: string): MindMapNodeRole {
  const lower = text.toLowerCase();
  if (
    /\b(red flag|warning|danger|emergency|complication|toxic|contraindic|trap|pitfall|critical)\b/.test(
      lower
    ) ||
    /(تحذير|خطر|مضاعف|طوارئ|فخ|تنبيه|موانع)/.test(lower)
  ) {
    return 'warning';
  }
  if (
    /\b(treat|therap|drug|medicat|manage|antibiotic|dose|surgery|intervent|first-line|regimen|prophylaxis)\b/.test(
      lower
    ) ||
    /(علاج|دواء|أدوية|تدبير|جراحة|وقاية|جرعة)/.test(lower)
  ) {
    return 'treatment';
  }
  if (
    /\b(diagnos|test|lab|ecg|ekg|xray|ct|mri|ultrasound|biopsy|criteria|score|symptom|sign|clinical|workup|finding|present)\b/.test(
      lower
    ) ||
    /(تشخيص|فحص|تحليل|أعراض|علامات|سريري|تقييم|معايير)/.test(lower)
  ) {
    return 'diagnosis';
  }
  if (
    /\b(pathophys|mechan|etiolog|cause|pathway|cascade|life cycle|transmission|morphology|biology|defini|overview)\b/.test(
      lower
    ) ||
    /(آلية|فيزيولوج|مسبب|أسباب|دورة حياة|انتقال|تعريف|نظرة)/.test(lower)
  ) {
    return 'mechanism';
  }
  return 'concept';
}

function trimConcise(text: string, maxLen: number): { short: string; wasTrimmed: boolean } {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return { short: clean, wasTrimmed: false };
  const slice = clean.slice(0, maxLen - 1).trim();
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxLen * 0.55 ? slice.slice(0, lastSpace) : slice;
  return { short: `${cut}…`, wasTrimmed: true };
}

function splitCleanSubpoints(rawText: string): string[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•◦▪\d.)]+\s*/, '').trim())
    .filter(Boolean);

  if (lines.length > 1) {
    return lines.slice(0, 4);
  }

  // Split single paragraph into concise key sentences
  return rawText
    .split(/(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6)
    .slice(0, 3);
}

/**
 * Generates an organized, concise, non-bloated interactive mind map directly from a TopicArticle's
 * title, sections, content blocks (headings, clinical notes, tables, paragraphs).
 */
export function generateMindMapFromTopic(
  topic: TopicArticle,
  style: MindMapStyle = 'radial'
): MindMapDocument {
  const now = new Date().toISOString();
  const rootEn = (topic.titleEn || topic.title || 'Medical Topic').trim();
  const rootAr = (topic.titleAr || topic.subtitle || '').trim();
  const rootTrim = trimConcise(rootEn, 48);
  const subTrim =
    rootAr && rootAr !== rootEn ? trimConcise(rootAr, 38).short : undefined;

  const nodes: MindMapNode[] = [
    {
      id: 'n-root',
      label: rootTrim.short,
      sublabel: subTrim,
      note: rootTrim.wasTrimmed ? `${rootEn}${rootAr ? `\n${rootAr}` : ''}` : undefined,
      parentId: null,
      role: 'root',
      order: 0
    }
  ];
  const edges: MindMapEdge[] = [];
  let seq = 1;
  let prevSectionNodeId: string | null = null;

  const sections = topic.sections || [];
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const secHeadingEn = (sec.headingEn || sec.heading || `Section ${sIdx + 1}`)
      .replace(/^\d+[.)]\s*/, '')
      .trim();
    const secHeadingAr = (sec.headingAr || '').trim();
    const secId = `n-sec-${seq++}`;
    const secRole = inferRoleFromHeadingOrText(`${secHeadingEn} ${secHeadingAr}`);
    const secTrim = trimConcise(secHeadingEn, 42);
    const secSub =
      secHeadingAr && secHeadingAr !== secHeadingEn
        ? trimConcise(secHeadingAr, 32).short
        : undefined;

    const fullSectionNote = (sec.paragraphs || []).slice(0, 3).join('\n\n').trim() || undefined;

    nodes.push({
      id: secId,
      label: secTrim.short,
      sublabel: secSub,
      note: secTrim.wasTrimmed ? `${secHeadingEn}\n${fullSectionNote || ''}`.trim() : fullSectionNote,
      parentId: 'n-root',
      role: secRole,
      order: sIdx + 1
    });

    if (style === 'medical_flow' && prevSectionNodeId) {
      edges.push({
        id: `e-flow-${edges.length + 1}`,
        sourceId: prevSectionNodeId,
        targetId: secId,
        directed: true,
        lineStyle: 'solid'
      });
    }
    prevSectionNodeId = secId;

    // Extract concise children from contentBlocks or fallback paragraphs (cap 4 per branch to keep map scannable)
    const childCandidates: Array<{
      label: string;
      sublabel?: string;
      note?: string;
      role: MindMapNodeRole;
    }> = [];

    const blocks = (sec.contentBlocks || []).slice().sort((a, b) => a.order - b.order);
    if (blocks.length > 0) {
      for (const blk of blocks) {
        if (childCandidates.length >= 4) break;

        if (blk.type === 'heading' && (blk.titleEn || blk.titleAr)) {
          const lbl = (blk.titleEn || blk.titleAr || '').trim();
          const sub = blk.titleAr && blk.titleAr !== lbl ? blk.titleAr.trim() : undefined;
          childCandidates.push({
            label: lbl,
            sublabel: sub,
            role: inferRoleFromHeadingOrText(`${lbl} ${sub || ''}`)
          });
        } else if (blk.type === 'clinical_note' && (blk.text || blk.titleEn)) {
          const full = (blk.text || blk.titleEn || '').trim();
          const headline = (blk.titleEn || blk.titleAr || full).trim();
          childCandidates.push({
            label: headline,
            sublabel: blk.titleAr && blk.titleAr !== headline ? blk.titleAr : undefined,
            note: full,
            role: blk.noteSeverity === 'warning' || blk.noteSeverity === 'exam-trap' ? 'warning' : secRole
          });
        } else if (blk.type === 'table' && (blk.titleEn || blk.titleAr || (blk.tableHeaders && blk.tableHeaders.length > 0))) {
          const lbl = (blk.titleEn || blk.titleAr || 'Comparison Table').trim();
          const headersSummary = (blk.tableHeaders || []).join(' | ');
          childCandidates.push({
            label: lbl,
            sublabel: blk.titleAr && blk.titleAr !== lbl ? blk.titleAr : `${(blk.tableRows || []).length} rows`,
            note: headersSummary ? `Columns: ${headersSummary}` : undefined,
            role: secRole
          });
        } else if (blk.type === 'paragraph' && blk.text) {
          const points = splitCleanSubpoints(blk.text);
          for (const pt of points) {
            if (childCandidates.length >= 4) break;
            // Check for "Term: explanation" pattern
            const colonIdx = pt.indexOf(':');
            if (colonIdx > 2 && colonIdx < 36) {
              const left = pt.slice(0, colonIdx).trim();
              const right = pt.slice(colonIdx + 1).trim();
              childCandidates.push({
                label: left,
                sublabel: trimConcise(right, 28).short,
                note: pt,
                role: inferRoleFromHeadingOrText(pt)
              });
            } else {
              childCandidates.push({
                label: pt,
                note: pt.length > 44 ? pt : undefined,
                role: inferRoleFromHeadingOrText(pt)
              });
            }
          }
        }
      }
    } else {
      for (const para of sec.paragraphs || []) {
        if (childCandidates.length >= 4) break;
        const points = splitCleanSubpoints(para);
        for (const pt of points) {
          if (childCandidates.length >= 4) break;
          childCandidates.push({
            label: pt,
            note: pt.length > 44 ? pt : undefined,
            role: inferRoleFromHeadingOrText(pt)
          });
        }
      }
    }

    childCandidates.forEach((cand, cIdx) => {
      const t = trimConcise(cand.label, 42);
      nodes.push({
        id: `n-c-${seq++}`,
        label: t.short,
        sublabel: cand.sublabel ? trimConcise(cand.sublabel, 30).short : undefined,
        note: cand.note || (t.wasTrimmed ? cand.label : undefined),
        parentId: secId,
        role: cand.role === 'root' ? 'concept' : cand.role,
        order: cIdx + 1
      });
    });
  }

  return {
    id: `mm-topic-${topic.id}-${Date.now()}`,
    title: rootEn,
    titleEn: topic.titleEn || rootEn,
    subtitle: rootAr || undefined,
    style,
    rootNodeId: 'n-root',
    nodes,
    edges,
    linkedTopicId: topic.id,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1
  };
}

function escapeXml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const SVG_ROLE_PALETTE: Record<
  MindMapNodeRole,
  { fillLight: string; strokeLight: string; textLight: string; fillDark: string; strokeDark: string; textDark: string }
> = {
  root: {
    fillLight: '#059669',
    strokeLight: '#047857',
    textLight: '#ffffff',
    fillDark: '#10b981',
    strokeDark: '#34d399',
    textDark: '#022c22'
  },
  concept: {
    fillLight: '#ffffff',
    strokeLight: '#94a3b8',
    textLight: '#0f172a',
    fillDark: '#1e293b',
    strokeDark: '#475569',
    textDark: '#f8fafc'
  },
  mechanism: {
    fillLight: '#eff6ff',
    strokeLight: '#3b82f6',
    textLight: '#1e3a8a',
    fillDark: '#172554',
    strokeDark: '#60a5fa',
    textDark: '#dbeafe'
  },
  diagnosis: {
    fillLight: '#f5f3ff',
    strokeLight: '#8b5cf6',
    textLight: '#4c1d95',
    fillDark: '#2e1065',
    strokeDark: '#a78bfa',
    textDark: '#ede9fe'
  },
  treatment: {
    fillLight: '#ecfdf5',
    strokeLight: '#10b981',
    textLight: '#065f46',
    fillDark: '#022c22',
    strokeDark: '#34d399',
    textDark: '#d1fae5'
  },
  warning: {
    fillLight: '#fff1f2',
    strokeLight: '#f43f5e',
    textLight: '#881337',
    fillDark: '#4c0519',
    strokeDark: '#fb7185',
    textDark: '#ffe4e6'
  }
};

export function buildStandaloneMindMapSvg(
  doc: MindMapDocument,
  layout: MindMapLayoutResult,
  isDark = false
): string {
  const { minX, minY, width, height } = layout.bounds;
  const bg = isDark ? '#0f172a' : '#f8fafc';
  const edgeStroke = isDark ? '#64748b' : '#94a3b8';
  const labelBg = isDark ? '#1e293b' : '#ffffff';
  const labelText = isDark ? '#cbd5e1' : '#334155';

  const edgeElements = layout.edges
    .map((e) => {
      const dash = e.lineStyle === 'dashed' ? ' stroke-dasharray="6 4"' : '';
      const marker = e.directed ? ' marker-end="url(#mm-arrow)"' : '';
      const edgeLabel = e.label
        ? `<g transform="translate(${e.labelX}, ${e.labelY})">
             <rect x="-42" y="-11" width="84" height="20" rx="6" fill="${labelBg}" stroke="${edgeStroke}" stroke-width="1"/>
             <text x="0" y="3" text-anchor="middle" font-family="Cairo, sans-serif" font-size="10" font-weight="700" fill="${labelText}">${escapeXml(e.label)}</text>
           </g>`
        : '';
      return `<g class="mm-edge" data-from="${escapeXml(e.sourceId)}" data-to="${escapeXml(e.targetId)}"><path d="${escapeXml(e.path)}" fill="none" stroke="${edgeStroke}" stroke-width="2"${dash}${marker} />${edgeLabel}</g>`;
    })
    .join('\n');

  const nodeElements = layout.nodes
    .map((pn) => {
      const palette = SVG_ROLE_PALETTE[pn.node.role] || SVG_ROLE_PALETTE.concept;
      const fill = isDark ? palette.fillDark : palette.fillLight;
      const stroke = isDark ? palette.strokeDark : palette.strokeLight;
      const textColor = isDark ? palette.textDark : palette.textLight;
      const x = pn.x - pn.width / 2;
      const y = pn.y - pn.height / 2;
      const rx = pn.node.role === 'root' ? 18 : 14;

      const totalLines = pn.lines.length + (pn.sublabelLine ? 1 : 0);
      const startY = pn.y - ((totalLines - 1) * 16) / 2 + 4;

      const textLines = pn.lines
        .map(
          (line, idx) =>
            `<text x="${pn.x}" y="${startY + idx * 17}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="${
              pn.node.role === 'root' ? 13 : 12
            }" font-weight="800" fill="${textColor}">${escapeXml(line)}</text>`
        )
        .join('');

      const subLine = pn.sublabelLine
        ? `<text x="${pn.x}" y="${startY + pn.lines.length * 17}" text-anchor="middle" font-family="Cairo, sans-serif" font-size="10.5" font-weight="600" opacity="0.82" fill="${textColor}">${escapeXml(
            pn.sublabelLine
          )}</text>`
        : '';

      return `<g class="mm-node" data-node-id="${escapeXml(pn.node.id)}" role="button" tabindex="0" aria-label="${escapeXml(pn.node.label)}">
        <rect x="${x}" y="${y}" width="${pn.width}" height="${pn.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${
        pn.node.role === 'root' ? 2.5 : 1.75
      }"/>
        ${textLines}
        ${subLine}
      </g>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${Math.round(
    width
  )}" height="${Math.round(height)}">
  <title>${escapeXml(doc.title)}</title>
  <defs>
    <marker id="mm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="${edgeStroke}" />
    </marker>
  </defs>
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${bg}" />
  ${edgeElements}
  ${nodeElements}
</svg>`;
}
