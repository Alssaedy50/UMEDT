import {
  MindMapDocument,
  MindMapEdge,
  MindMapImportPreviewResult,
  MindMapImportSourceFormat,
  MindMapNode,
  MindMapNodeRole,
  MindMapStyle
} from '../types/mindMap';

const MAX_CONCISE_LABEL_LEN = 54;
const MAX_CONCISE_SUBLABEL_LEN = 42;

export const MIND_MAP_AI_PROMPTS = {
  json: `أنشئ خريطة ذهنية طبية أكاديمية تفاعلية حول: [اكتب اسم الموضوع الطبي هنا]

المخرج المطلوب:
أعد كائن JSON واحداً فقط، صالحاً للتحليل مباشرة بواسطة UMEDT. لا تستخدم Markdown أو أسوار كود أو مقدمة أو خاتمة.

المخطط الإلزامي:
{
  "schemaVersion": 1,
  "title": "عنوان الموضوع",
  "titleEn": "English topic title",
  "subtitle": "وصف مختصر",
  "style": "radial",
  "rootNodeId": "n1",
  "nodes": [
    {
      "id": "n1",
      "label": "عنوان مركزي مختصر",
      "sublabel": "ترجمة أو مؤشر مختصر",
      "note": "شرح علمي كامل ومفصل عند الحاجة",
      "parentId": null,
      "role": "root",
      "order": 0
    },
    {
      "id": "n2",
      "label": "Pathophysiology",
      "sublabel": "الفيزيولوجيا المرضية",
      "note": "اشرح الآليات خطوة بخطوة، مع الأسباب والنتائج والأمثلة والأهمية السريرية. لا تضع الشرح الطويل في label ولا تحذف التفاصيل.",
      "parentId": "n1",
      "role": "mechanism",
      "order": 1
    },
    {
      "id": "n3",
      "label": "Clinical Consequences",
      "sublabel": "النتائج السريرية",
      "note": "اشرح النتائج السريرية المرتبطة بالآلية.",
      "parentId": "n1",
      "role": "diagnosis",
      "order": 2
    }
  ],
  "edges": [
    {
      "id": "e1",
      "sourceId": "n2",
      "targetId": "n3",
      "label": "يؤدي إلى",
      "directed": true,
      "lineStyle": "solid"
    }
  ]
}

قواعد صحة البيانات:
1. استخدم عقدة جذر واحدة فقط، واجعل parentId لها null وrootNodeId مساوياً لمعرفها.
2. يجب أن يكون id فريداً لكل عقدة ولكل علاقة. استخدم معرفات قصيرة مثل n1 وn2 وe1.
3. يجب أن يشير parentId لكل عقدة فرعية إلى id موجود فعلياً في nodes، وألا تشير العقدة إلى نفسها أو إلى أحد أحفادها.
4. استخدم فقط هذه القيم في style: radial أو hierarchical أو medical_flow.
5. استخدم فقط هذه القيم في role: root أو concept أو mechanism أو diagnosis أو treatment أو warning.
6. اجعل label عنواناً بصرياً موجزاً (2–6 كلمات غالباً)، وضع التعريف والشرح والتفاصيل والأمثلة في note دون اختصار مخل.
7. استخدم sublabel للترجمة العربية أو قيمة/مؤشر قصير، وليس لشرح مطول.
8. استخدم edges للعلاقات السببية أو الوظيفية العابرة بين الفروع فقط؛ لا تكرر علاقات الأب والابن الموجودة في parentId.
9. يجب أن يكون sourceId وtargetId في كل edge معرفين موجودين في nodes، وألا تكون العلاقة بين العقدة ونفسها.
10. لا تضف حقولاً غير معرفة في المخطط، ولا تضع تعليقات أو trailing commas داخل JSON.
11. حافظ على المصطلحات الطبية الإنجليزية القياسية، وأضف المقابل العربي في sublabel عند فائدته.
12. نظّم الموضوع من المفاهيم الأساسية إلى الآليات ثم المظاهر والتشخيص والعلاج والمضاعفات. لا تخترع معلومات أو جرعات أو مراجع.
13. اجعل كل فرع مستقلاً منطقياً، وتجنب تكرار المعلومة نفسها في أكثر من عقدة.
14. إذا كان الموضوع مساراً تشخيصياً أو علاجياً متسلسلاً، استخدم style = "medical_flow" وعقداً مرتبة مع علاقات edges واضحة.
15. أخرج JSON كاملاً فقط. لا تضع أي شرح خارج كائن JSON.`
} as const;

export interface MindMapPromptOptions {
  topic: string;
  nodeCount?: number;
  style: MindMapStyle;
  outputFormat: 'text' | 'file';
}

export function buildMindMapGenerationPrompt(options: MindMapPromptOptions): string {
  const topic = options.topic.trim() || '[اكتب الموضوع الطبي]';
  const requestedCount = typeof options.nodeCount === 'number' && Number.isFinite(options.nodeCount)
    ? Math.max(3, Math.min(80, Math.round(options.nodeCount)))
    : null;
  const outputInstruction = options.outputFormat === 'file'
    ? 'أنشئ ملفاً قابلاً للتنزيل باسم medical-mind-map.json بترميز UTF-8، ويحتوي الملف على كائن JSON فقط. إذا كانت المنصة لا تدعم إنشاء الملفات، أخرج نص JSON كاملاً دون Markdown ليتمكن المستخدم من نسخه.'
    : 'أخرج نص JSON كاملاً فقط داخل المحادثة دون Markdown أو أسوار كود أو مقدمة أو خاتمة.';
  const prompt = MIND_MAP_AI_PROMPTS.json
    .replace('[اكتب اسم الموضوع الطبي هنا]', topic)
    .replace('"style": "radial"', `"style": "${options.style}"`)
    .replace(
      'أعد كائن JSON واحداً فقط، صالحاً للتحليل مباشرة بواسطة UMEDT. لا تستخدم Markdown أو أسوار كود أو مقدمة أو خاتمة.',
      outputInstruction
    );
  const constraints = [
    `- الموضوع: ${topic}.`,
    ...(requestedCount === null
      ? ['- لا يوجد عدد محدد للعقد؛ اختر العدد المناسب لتغطية الموضوع بوضوح دون حشو أو تكرار.']
      : [`- العدد المستهدف: ${requestedCount} عقدة إجمالاً، وتُحتسب عقدة الجذر ضمن العدد.`]),
    `- نمط التخطيط: ${options.style}.`,
    '- يجب أن تكون كل عقدة وعلاقة صالحة وفق المخطط أعلاه، وأن تكون جميع parentId وsourceId وtargetId مرتبطة بمعرفات موجودة.',
    '- لا تضف حقولاً أو صيغاً غير مدعومة. يجب أن يستطيع مستورد UMEDT تحليل النتيجة مباشرة دون تحويل يدوي.'
  ];
  return `${prompt}\n\nالمواصفات المحددة لهذه الخريطة:\n${constraints.join('\n')}`;
}

function inferMedicalRoleFromText(text: string, depth: number): MindMapNodeRole {
  if (depth === 0) return 'root';
  const lower = text.toLowerCase();
  if (
    /\b(red flag|warning|danger|emergency|complication|toxic|contraindic|shock|arrest|lethal|critical)\b/.test(
      lower
    ) ||
    /(تحذير|خطر|مضاعف|طوارئ|تسمم|موانع|صدمة|حرج)/.test(lower)
  ) {
    return 'warning';
  }
  if (
    /\b(treat|therap|drug|medicat|manage|antibiotic|dose|surgery|intervent|first-line|inhibitor|blocker|statin|insulin)\b/.test(
      lower
    ) ||
    /(علاج|دواء|أدوية|تدبير|جراحة|مثبط|حاصر|جرعة|تدخل)/.test(lower)
  ) {
    return 'treatment';
  }
  if (
    /\b(diagnos|test|lab|ecg|ekg|xray|ct|mri|ultrasound|biopsy|criteria|score|symptom|sign|present|workup|exam)\b/.test(
      lower
    ) ||
    /(تشخيص|فحص|تحليل|تخطيط|أشعة|أعراض|علامات|معايير|خزعة)/.test(lower)
  ) {
    return 'diagnosis';
  }
  if (
    /\b(pathophys|mechan|etiolog|cause|pathway|cascade|receptor|enzyme|gene|ischemi|inflam|mediat)\b/.test(
      lower
    ) ||
    /(آلية|فيزيولوج|مسبب|أسباب|مسار|مستقبل|إنزيم|التهاب|نقص تروية)/.test(lower)
  ) {
    return 'mechanism';
  }
  return 'concept';
}

function normalizeRole(raw: unknown, label: string, depth: number): MindMapNodeRole {
  const valid: MindMapNodeRole[] = [
    'root',
    'concept',
    'mechanism',
    'diagnosis',
    'treatment',
    'warning'
  ];
  if (typeof raw === 'string' && valid.includes(raw as MindMapNodeRole)) {
    return raw as MindMapNodeRole;
  }
  return inferMedicalRoleFromText(label, depth);
}

function normalizeStyle(raw: unknown, fallback: MindMapStyle): MindMapStyle {
  if (raw === 'radial' || raw === 'hierarchical' || raw === 'medical_flow') {
    return raw;
  }
  if (typeof raw === 'string') {
    const l = raw.toLowerCase();
    if (l.includes('flow') || l.includes('algo') || l.includes('pathway')) {
      return 'medical_flow';
    }
    if (l.includes('hier') || l.includes('tree') || l.includes('tax')) {
      return 'hierarchical';
    }
    if (l.includes('rad')) {
      return 'radial';
    }
  }
  return fallback;
}

function cleanMarkdownFormatting(raw: string): string {
  return String(raw || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMarkdownNote(raw: string): string {
  return String(raw || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/**
 * Keeps mind map nodes concise and scannable so they never duplicate long textbook paragraphs.
 * Splits `Term: short cue` into label + sublabel, and moves overflow prose into `note`.
 */
function condenseNodeText(
  rawLabel: string,
  existingSublabel?: string,
  existingNote?: string
): {
  label: string;
  sublabel?: string;
  note?: string;
  wasTrimmed: boolean;
} {
  let clean = cleanMarkdownFormatting(rawLabel);
  let sublabel = existingSublabel ? cleanMarkdownFormatting(existingSublabel) : undefined;
  let note = existingNote ? cleanMarkdownNote(existingNote) : undefined;
  let wasTrimmed = false;

  // Split "Main Label: Short Cue" or "Main Label — Short Cue" when no explicit sublabel exists
  if (!sublabel) {
    const colonMatch = clean.match(/^([^:–—-]{2,42})\s*[:–—]\s+(.+)$/);
    if (colonMatch) {
      const left = colonMatch[1].trim();
      const right = colonMatch[2].trim();
      if (left.length >= 2 && right.length >= 2) {
        clean = left;
        if (right.length <= MAX_CONCISE_SUBLABEL_LEN) {
          sublabel = right;
        } else {
          sublabel = `${right.slice(0, MAX_CONCISE_SUBLABEL_LEN - 1)}…`;
          note = note ? `${note}\n${right}` : right;
          wasTrimmed = true;
        }
      }
    }
  }

  if (clean.length > MAX_CONCISE_LABEL_LEN) {
    const fullText = clean;
    clean = `${clean.slice(0, MAX_CONCISE_LABEL_LEN - 1).trim()}…`;
    note = note ? `${fullText}\n${note}` : fullText;
    wasTrimmed = true;
  }

  if (sublabel && sublabel.length > MAX_CONCISE_SUBLABEL_LEN) {
    const fullSub = sublabel;
    sublabel = `${sublabel.slice(0, MAX_CONCISE_SUBLABEL_LEN - 1).trim()}…`;
    note = note ? `${note}\n${fullSub}` : fullSub;
    wasTrimmed = true;
  }

  return {
    label: clean || 'عقدة',
    sublabel: sublabel || undefined,
    note: note || undefined,
    wasTrimmed
  };
}

function extractJsonBlockFromText(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Direct JSON object or array
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed;
  }

  // ChatGPT / Gemini fenced ```json ... ``` block
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{') || inner.startsWith('[')) {
      return inner;
    }
  }

  // Fallback: locate outermost {...} if AI wrapped JSON in Arabic/English explanation
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return null;
    }
  }

  return null;
}


/** Validate the strict UMEDT unified JSON contract before any legacy/text parser runs. */
function validateUnifiedMindMapJson(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'يجب أن يكون JSON كائناً.';
  const obj = value as Record<string, unknown>;
  if (obj.schemaVersion !== 1) return 'إصدار المخطط غير مدعوم؛ schemaVersion يجب أن يساوي 1.';
  if (typeof obj.rootNodeId !== 'string' || !obj.rootNodeId.trim()) return 'الحقل rootNodeId مفقود أو غير صالح.';
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) return 'الحقل nodes يجب أن يحتوي على عقدة واحدة على الأقل.';
  if (!Array.isArray(obj.edges)) return 'الحقل edges يجب أن يكون مصفوفة، حتى إن كانت فارغة.';
  const ids = new Set<string>();
  for (const [index, item] of obj.nodes.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return `العقدة رقم ${index + 1} غير صالحة.`;
    const node = item as Record<string, unknown>;
    if (typeof node.id !== 'string' || !node.id.trim()) return `معرّف العقدة رقم ${index + 1} مفقود.`;
    if (ids.has(node.id)) return `معرّف العقدة مكرر: ${node.id}.`;
    ids.add(node.id);
  }
  if (!ids.has(obj.rootNodeId)) return 'rootNodeId لا يشير إلى عقدة موجودة في nodes.';
  for (const [index, item] of obj.nodes.entries()) {
    const node = item as Record<string, unknown>;
    if (node.parentId != null && (typeof node.parentId !== 'string' || !ids.has(node.parentId))) {
      return `parentId في العقدة ${node.id} لا يشير إلى عقدة موجودة.`;
    }
    if (node.id === obj.rootNodeId && node.parentId != null) return 'يجب أن يكون parentId لعقدة الجذر null.';
  }
  const edgeIds = new Set<string>();
  for (const [index, item] of obj.edges.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return `العلاقة رقم ${index + 1} غير صالحة.`;
    const edge = item as Record<string, unknown>;
    if (typeof edge.id !== 'string' || !edge.id.trim()) return `معرّف العلاقة رقم ${index + 1} مفقود.`;
    if (edgeIds.has(edge.id)) return `معرّف العلاقة مكرر: ${edge.id}.`;
    edgeIds.add(edge.id);
    if (typeof edge.sourceId !== 'string' || !ids.has(edge.sourceId)) return `sourceId في العلاقة ${edge.id} غير مرتبط بعقدة موجودة.`;
    if (typeof edge.targetId !== 'string' || !ids.has(edge.targetId)) return `targetId في العلاقة ${edge.id} غير مرتبط بعقدة موجودة.`;
    if (edge.sourceId === edge.targetId) return `العلاقة ${edge.id} تربط العقدة بنفسها.`;
  }
  return null;
}

function computeMaxDepth(nodes: MindMapNode[], rootNodeId: string): number {
  const childrenMap = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.parentId) {
      const list = childrenMap.get(n.parentId) || [];
      list.push(n.id);
      childrenMap.set(n.parentId, list);
    }
  }
  let maxDepth = 0;
  const visited = new Set<string>();
  const dfs = (id: string, depth: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    if (depth > maxDepth) maxDepth = depth;
    for (const c of childrenMap.get(id) || []) {
      dfs(c, depth + 1);
    }
  };
  dfs(rootNodeId, 0);
  return maxDepth;
}

function finalizeDocument(params: {
  title: string;
  titleEn?: string;
  subtitle?: string;
  style: MindMapStyle;
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  rootNodeId?: string;
  linkedTopicId?: string;
  detectedFormat: MindMapImportSourceFormat;
  detectedFormatLabelAr: string;
  trimmedCount: number;
  warnings: string[];
}): MindMapImportPreviewResult {
  if (params.nodes.length === 0) {
    return {
      success: false,
      detectedFormat: params.detectedFormat,
      detectedFormatLabelAr: params.detectedFormatLabelAr,
      document: null,
      stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
      warnings: params.warnings,
      error: 'لم يتم العثور على عقد صالحة داخل النص أو الملف.'
    };
  }

  const now = new Date().toISOString();
  const rootId =
    params.rootNodeId && params.nodes.some((n) => n.id === params.rootNodeId)
      ? params.rootNodeId
      : params.nodes.find((n) => !n.parentId)?.id || params.nodes[0].id;

  // Ensure root node has parentId = null and role = 'root'
  const normalizedNodes = params.nodes.map((n, idx) => ({
    ...n,
    parentId: n.id === rootId ? null : n.parentId,
    role: n.id === rootId ? ('root' as MindMapNodeRole) : n.role,
    order: n.order ?? idx
  }));

  const validIds = new Set(normalizedNodes.map((n) => n.id));
  const normalizedEdges = params.edges.filter(
    (e) =>
      validIds.has(e.sourceId) &&
      validIds.has(e.targetId) &&
      e.sourceId !== e.targetId
  );

  const doc: MindMapDocument = {
    id: `mm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: params.title.trim() || normalizedNodes[0].label,
    titleEn: params.titleEn?.trim() || undefined,
    subtitle: params.subtitle?.trim() || undefined,
    style: params.style,
    rootNodeId: rootId,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    linkedTopicId: params.linkedTopicId || undefined,
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1
  };

  if (params.trimmedCount > 0) {
    params.warnings.push(
      `تم اختصار ${params.trimmedCount} عقدة طويلة تلقائياً وحفظ النص التفصيلي داخل ملاحظة العقدة للحفاظ على وضوح الخريطة.`
    );
  }

  return {
    success: true,
    detectedFormat: params.detectedFormat,
    detectedFormatLabelAr: params.detectedFormatLabelAr,
    document: doc,
    stats: {
      nodeCount: normalizedNodes.length,
      edgeCount: normalizedEdges.length,
      maxDepth: computeMaxDepth(normalizedNodes, rootId),
      trimmedLongNodes: params.trimmedCount
    },
    warnings: params.warnings
  };
}

function parseJsonMindMap(
  jsonText: string,
  options?: { preferredStyle?: MindMapStyle; linkedTopicId?: string }
): MindMapImportPreviewResult {
  const warnings: string[] = [];
  let trimmedCount = 0;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    return {
      success: false,
      detectedFormat: 'umedt-json',
      detectedFormatLabelAr: 'ملف JSON',
      document: null,
      stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
      warnings: [],
      error: `صيغة JSON غير صالحة: ${err instanceof Error ? err.message : 'خطأ في القراءة'}`
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      success: false,
      detectedFormat: 'umedt-json',
      detectedFormatLabelAr: 'ملف JSON',
      document: null,
      stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
      warnings: [],
      error: 'محتوى JSON يجب أن يكون كائناً أو شجرة عقد صالحة.'
    };
  }

  // Unwrap envelope if exported from UMEDT wrapper ({ exportType, mindMap: {...} })
  const obj =
    (parsed as Record<string, unknown>).mindMap &&
    typeof (parsed as Record<string, unknown>).mindMap === 'object'
      ? ((parsed as Record<string, unknown>).mindMap as Record<string, unknown>)
      : (parsed as Record<string, unknown>);

  // Case 1: Flat nodes (+ optional edges) format (UMEDT native or graph JSON)
  if (Array.isArray(obj.nodes)) {
    const rawNodes = obj.nodes as Array<Record<string, unknown>>;
    const rawEdges = Array.isArray(obj.edges)
      ? (obj.edges as Array<Record<string, unknown>>)
      : Array.isArray(obj.links)
        ? (obj.links as Array<Record<string, unknown>>)
        : Array.isArray(obj.connections)
          ? (obj.connections as Array<Record<string, unknown>>)
          : [];

    const nodes: MindMapNode[] = [];
    const seenIds = new Set<string>();

    rawNodes.forEach((rn, idx) => {
      const rawId = String(rn.id ?? `n-${idx + 1}`).trim() || `n-${idx + 1}`;
      const id = seenIds.has(rawId) ? `${rawId}-${idx}` : rawId;
      seenIds.add(id);

      const rawLabel = String(
        rn.label ?? rn.title ?? rn.name ?? rn.text ?? `Node ${idx + 1}`
      );
      const condensed = condenseNodeText(
        rawLabel,
        typeof rn.sublabel === 'string'
          ? rn.sublabel
          : typeof rn.subtitle === 'string'
            ? rn.subtitle
            : typeof rn.ar === 'string'
              ? rn.ar
              : undefined,
        typeof rn.note === 'string'
          ? rn.note
          : typeof rn.description === 'string'
            ? rn.description
            : undefined
      );
      if (condensed.wasTrimmed) trimmedCount += 1;

      const parentId =
        typeof rn.parentId === 'string' && rn.parentId.trim()
          ? rn.parentId.trim()
          : typeof rn.parent === 'string' && rn.parent.trim()
            ? rn.parent.trim()
            : null;

      const pos =
        rn.position &&
        typeof rn.position === 'object' &&
        typeof (rn.position as Record<string, unknown>).x === 'number' &&
        typeof (rn.position as Record<string, unknown>).y === 'number'
          ? {
              x: Number((rn.position as Record<string, unknown>).x),
              y: Number((rn.position as Record<string, unknown>).y)
            }
          : undefined;

      nodes.push({
        id,
        label: condensed.label,
        sublabel: condensed.sublabel,
        note: condensed.note,
        parentId,
        role: normalizeRole(rn.role ?? rn.type ?? rn.category, condensed.label, parentId ? 1 : 0),
        order: typeof rn.order === 'number' ? rn.order : idx,
        shape: ['rounded', 'pill', 'diamond', 'hexagon', 'circle'].includes(String(rn.shape))
          ? (String(rn.shape) as MindMapNode['shape'])
          : undefined,
        color: typeof rn.color === 'string' && /^#[0-9a-f]{6}$/i.test(rn.color) ? rn.color : undefined,
        position: pos
      });
    });

    const edges: MindMapEdge[] = rawEdges
      .map((re, idx): MindMapEdge | null => {
        const sourceId = String(re.sourceId ?? re.source ?? re.from ?? '').trim();
        const targetId = String(re.targetId ?? re.target ?? re.to ?? '').trim();
        if (!sourceId || !targetId) return null;
        return {
          id: String(re.id ?? `e-${idx + 1}`),
          sourceId,
          targetId,
          label: typeof re.label === 'string' ? re.label.trim().slice(0, 32) : undefined,
          lineStyle: re.lineStyle === 'dashed' || re.dashed === true ? 'dashed' : 'solid',
          directed: re.directed !== false
        };
      })
      .filter((e): e is MindMapEdge => Boolean(e));

    // If graph JSON provided edges but no parentIds on non-root nodes, derive parentId tree via BFS
    const hasParentLinks = nodes.some((n) => Boolean(n.parentId));
    if (!hasParentLinks && edges.length > 0 && nodes.length > 1) {
      const targetCounts = new Map<string, number>();
      for (const e of edges) {
        targetCounts.set(e.targetId, (targetCounts.get(e.targetId) || 0) + 1);
      }
      const rootCandidate =
        (typeof obj.rootNodeId === 'string' ? obj.rootNodeId : null) ||
        nodes.find((n) => !targetCounts.has(n.id))?.id ||
        nodes[0].id;
      const visited = new Set<string>([rootCandidate]);
      const queue = [rootCandidate];
      const nodeById = new Map(nodes.map((n) => [n.id, n]));
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const e of edges) {
          if (e.sourceId === cur && !visited.has(e.targetId)) {
            visited.add(e.targetId);
            const tgtNode = nodeById.get(e.targetId);
            if (tgtNode) tgtNode.parentId = cur;
            queue.push(e.targetId);
          }
        }
      }
    }

    const fallbackStyle: MindMapStyle =
      edges.length >= Math.max(2, Math.floor(nodes.length * 0.4))
        ? 'medical_flow'
        : 'radial';
    const isNative = Boolean(obj.schemaVersion || obj.rootNodeId);

    return finalizeDocument({
      title: String(obj.title ?? obj.name ?? nodes[0]?.label ?? 'خريطة ذهنية'),
      titleEn: typeof obj.titleEn === 'string' ? obj.titleEn : undefined,
      subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : undefined,
      style: options?.preferredStyle || normalizeStyle(obj.style ?? obj.layout, fallbackStyle),
      nodes,
      edges,
      rootNodeId: typeof obj.rootNodeId === 'string' ? obj.rootNodeId : undefined,
      linkedTopicId:
        options?.linkedTopicId ||
        (typeof obj.linkedTopicId === 'string' ? obj.linkedTopicId : undefined),
      detectedFormat: isNative ? 'umedt-json' : 'graph-json',
      detectedFormatLabelAr: isNative ? 'UMEDT Mind Map JSON' : 'JSON (عقد وعلاقات)',
      trimmedCount,
      warnings
    });
  }

  // Case 2: Nested tree JSON ({ title / name / label, children / branches / subtopics / nodes: [...] })
  const nodes: MindMapNode[] = [];
  const edges: MindMapEdge[] = [];
  let seq = 0;

  const rootObj =
    obj.root && typeof obj.root === 'object'
      ? (obj.root as Record<string, unknown>)
      : obj;

  const visitTree = (
    item: unknown,
    parentId: string | null,
    depth: number,
    order: number
  ) => {
    seq += 1;
    const id = `n-${seq}`;

    if (typeof item === 'string' || typeof item === 'number') {
      const condensed = condenseNodeText(String(item));
      if (condensed.wasTrimmed) trimmedCount += 1;
      nodes.push({
        id,
        label: condensed.label,
        sublabel: condensed.sublabel,
        note: condensed.note,
        parentId,
        role: inferMedicalRoleFromText(condensed.label, depth),
        order
      });
      return;
    }

    if (!item || typeof item !== 'object') return;
    const rec = item as Record<string, unknown>;
    const rawLabel = String(
      rec.label ?? rec.title ?? rec.name ?? rec.topic ?? rec.text ?? `Branch ${seq}`
    );
    const condensed = condenseNodeText(
      rawLabel,
      typeof rec.sublabel === 'string'
        ? rec.sublabel
        : typeof rec.subtitle === 'string'
          ? rec.subtitle
          : typeof rec.ar === 'string'
            ? rec.ar
            : undefined,
      typeof rec.note === 'string'
        ? rec.note
        : typeof rec.description === 'string'
          ? rec.description
          : undefined
    );
    if (condensed.wasTrimmed) trimmedCount += 1;

    nodes.push({
      id,
      label: condensed.label,
      sublabel: condensed.sublabel,
      note: condensed.note,
      parentId,
      role: normalizeRole(rec.role ?? rec.type, condensed.label, depth),
      order,
      shape: ['rounded', 'pill', 'diamond', 'hexagon', 'circle'].includes(String(rec.shape))
        ? (String(rec.shape) as MindMapNode['shape'])
        : undefined,
      color:
        typeof rec.color === 'string' && /^#[0-9a-f]{6}$/i.test(rec.color.trim())
          ? rec.color.trim()
          : undefined
    });

    if (parentId && typeof rec.edgeLabel === 'string' && rec.edgeLabel.trim()) {
      edges.push({
        id: `e-${parentId}-${id}`,
        sourceId: parentId,
        targetId: id,
        label: rec.edgeLabel.trim().slice(0, 32),
        directed: true,
        lineStyle: 'solid'
      });
    }

    const rawKids =
      rec.children ?? rec.branches ?? rec.subtopics ?? rec.items ?? rec.subnodes;
    if (Array.isArray(rawKids)) {
      rawKids.forEach((child, idx) => visitTree(child, id, depth + 1, idx));
    }
  };

  visitTree(rootObj, null, 0, 0);

  return finalizeDocument({
    title: String(obj.title ?? obj.name ?? nodes[0]?.label ?? 'خريطة ذهنية'),
    titleEn: typeof obj.titleEn === 'string' ? obj.titleEn : undefined,
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : undefined,
    style: options?.preferredStyle || normalizeStyle(obj.style ?? obj.layout, 'radial'),
    nodes,
    edges,
    rootNodeId: nodes[0]?.id,
    linkedTopicId: options?.linkedTopicId,
    detectedFormat: 'tree-json',
    detectedFormatLabelAr: 'شجرة JSON متداخلة',
    trimmedCount,
    warnings
  });
}

function parseMedicalFlowText(
  lines: string[],
  options?: { preferredStyle?: MindMapStyle; linkedTopicId?: string }
): MindMapImportPreviewResult {
  const warnings: string[] = [];
  let trimmedCount = 0;
  let explicitTitle = '';

  const nodeIdByKey = new Map<string, string>();
  const nodes: MindMapNode[] = [];
  const edges: MindMapEdge[] = [];
  const edgeKeys = new Set<string>();

  const getOrCreateNode = (rawText: string, suggestedParent: string | null): string => {
    const cleaned = cleanMarkdownFormatting(rawText);
    const key = cleaned.toLowerCase();
    const existing = nodeIdByKey.get(key);
    if (existing) return existing;

    const id = `n-${nodes.length + 1}`;
    const condensed = condenseNodeText(cleaned);
    if (condensed.wasTrimmed) trimmedCount += 1;

    nodes.push({
      id,
      label: condensed.label,
      sublabel: condensed.sublabel,
      note: condensed.note,
      parentId: nodes.length === 0 ? null : suggestedParent,
      role: inferMedicalRoleFromText(condensed.label, nodes.length === 0 ? 0 : 1),
      order: nodes.length
    });
    nodeIdByKey.set(key, id);
    return id;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('```')) continue;

    const titleMatch = line.match(/^(?:#\s*|title\s*:\s*|العنوان\s*:\s*)(.+)$/i);
    if (titleMatch && !/(->|=>|-->|→)/.test(line)) {
      if (!explicitTitle) explicitTitle = cleanMarkdownFormatting(titleMatch[1]);
      continue;
    }

    // Split chain like: "A -> [causes] B -> C" or "A --> B => C"
    const arrowRegex = /\s*(?:--+>|==+>|->|=>|→)\s*/g;
    if (!arrowRegex.test(line)) continue;

    const segments = line
      .replace(/^[-*•\d.)]+\s*/, '')
      .split(/\s*(?:--+>|==+>|->|=>|→)\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (segments.length < 2) continue;

    let prevId: string | null = null;
    for (let i = 0; i < segments.length; i++) {
      let segmentText = segments[i];
      let edgeLabel: string | undefined;

      // Support inline edge label syntax: "[causes] Target" or "(if +ve) Target"
      const labelMatch = segmentText.match(/^\[([^\]]{1,36})\]\s*(.+)$/);
      if (labelMatch) {
        edgeLabel = cleanMarkdownFormatting(labelMatch[1]);
        segmentText = labelMatch[2].trim();
      }

      if (!segmentText) continue;
      const curId = getOrCreateNode(segmentText, prevId);

      if (prevId && prevId !== curId) {
        const edgeKey = `${prevId}::${curId}`;
        if (!edgeKeys.has(edgeKey)) {
          edgeKeys.add(edgeKey);
          edges.push({
            id: `e-${edges.length + 1}`,
            sourceId: prevId,
            targetId: curId,
            label: edgeLabel,
            directed: true,
            lineStyle: 'solid'
          });
        }
      }
      prevId = curId;
    }
  }

  return finalizeDocument({
    title: explicitTitle || nodes[0]?.label || 'خريطة تدفق طبية',
    style: options?.preferredStyle || 'medical_flow',
    nodes,
    edges,
    rootNodeId: nodes[0]?.id,
    linkedTopicId: options?.linkedTopicId,
    detectedFormat: 'flow-text',
    detectedFormatLabelAr: 'نص تدفق طبي (أسهم)',
    trimmedCount,
    warnings
  });
}

function parseOutlineOrMarkdown(
  rawText: string,
  options?: { preferredStyle?: MindMapStyle; linkedTopicId?: string }
): MindMapImportPreviewResult {
  const warnings: string[] = [];
  let trimmedCount = 0;

  // Strip surrounding markdown code fences if someone pasted ```markdown ... ```
  const unfenced = rawText
    .trim()
    .replace(/^```(?:markdown|md|txt|text)?\s*\n?/i, '')
    .replace(/\n?```$/i, '');

  const rawLines = unfenced.split(/\r?\n/);
  const nonEmptyLines = rawLines.filter((l) => l.trim().length > 0);

  // Detect Medical Flow text if arrows appear on multiple lines (or on the primary content lines)
  const arrowLineCount = nonEmptyLines.filter((l) =>
    /(?:--+>|==+>|->|=>|→)/.test(l)
  ).length;
  if (arrowLineCount >= 2 || (arrowLineCount === 1 && nonEmptyLines.length <= 3)) {
    const flowResult = parseMedicalFlowText(nonEmptyLines, options);
    if (flowResult.success && flowResult.document && flowResult.document.nodes.length >= 2) {
      return flowResult;
    }
  }

  let hasMarkdownSyntax = false;
  interface ParsedOutlineLine {
    level: number;
    text: string;
    isHeading: boolean;
  }

  const parsedLines: ParsedOutlineLine[] = [];
  let activeHeadingLevel = 0;

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) continue;
    // Skip markdown horizontal rules or code fence lines
    if (/^\s*(?:---|===|\*\*\*|```)/.test(rawLine)) continue;

    // 1. Markdown Heading (# .. ######)
    const headingMatch = rawLine.match(/^\s*(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      hasMarkdownSyntax = true;
      const hLevel = headingMatch[1].length;
      activeHeadingLevel = hLevel;
      parsedLines.push({
        level: hLevel - 1,
        text: headingMatch[2].trim(),
        isHeading: true
      });
      continue;
    }

    // 2. ASCII tree connectors (├──, └──, │)
    const asciiMatch = rawLine.match(/^([│|\s]*)(?:├──|└──|├--|└--|\+--)\s*(.+)$/);
    if (asciiMatch) {
      const prefix = asciiMatch[1].replace(/\t/g, '    ');
      const indentDepth = Math.floor(prefix.length / 2) + 1;
      parsedLines.push({
        level: Math.max(1, indentDepth),
        text: asciiMatch[2].trim(),
        isHeading: false
      });
      continue;
    }

    // 3. Bullet list (-, *, +, •, ◦, ▪)
    const bulletMatch = rawLine.match(/^(\s*)[-*+•◦▪]\s+(.+)$/);
    if (bulletMatch) {
      hasMarkdownSyntax = true;
      const spaces = bulletMatch[1].replace(/\t/g, '  ').length;
      const indentLevel = Math.floor(spaces / 2);
      const base = activeHeadingLevel > 0 ? activeHeadingLevel : 1;
      parsedLines.push({
        level: base + indentLevel,
        text: bulletMatch[2].trim(),
        isHeading: false
      });
      continue;
    }

    // 4. Numbered hierarchy (1., 1.1, 1.2.3, A))
    const multiNumMatch = rawLine.match(/^(\s*)(\d+(?:\.\d+)+)[.)]?\s+(.+)$/);
    if (multiNumMatch) {
      const partsCount = multiNumMatch[2].split('.').length;
      parsedLines.push({
        level: Math.max(1, partsCount),
        text: multiNumMatch[3].trim(),
        isHeading: false
      });
      continue;
    }

    const numMatch = rawLine.match(/^(\s*)(?:\d+|[a-zA-Z])[.)]\s+(.+)$/);
    if (numMatch) {
      const spaces = numMatch[1].replace(/\t/g, '  ').length;
      const indentLevel = Math.floor(spaces / 2);
      const base = activeHeadingLevel > 0 ? activeHeadingLevel : 1;
      parsedLines.push({
        level: base + indentLevel,
        text: numMatch[2].trim(),
        isHeading: false
      });
      continue;
    }

    // 5. Plain indented line
    const indentMatch = rawLine.match(/^(\s*)(.+)$/);
    if (indentMatch) {
      const spaces = indentMatch[1].replace(/\t/g, '  ').length;
      const text = indentMatch[2].trim();
      if (parsedLines.length === 0 && spaces === 0) {
        parsedLines.push({ level: 0, text, isHeading: true });
        activeHeadingLevel = 1;
      } else {
        const indentLevel = Math.floor(spaces / 2);
        const level =
          spaces > 0
            ? Math.max(1, indentLevel)
            : activeHeadingLevel > 0
              ? activeHeadingLevel
              : 1;
        parsedLines.push({ level, text, isHeading: false });
      }
    }
  }

  if (parsedLines.length === 0) {
    return {
      success: false,
      detectedFormat: 'indented-text',
      detectedFormatLabelAr: 'نص منظم',
      document: null,
      stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
      warnings: [],
      error: 'النص فارغ أو لا يحتوي على بنية صالحة لإنشاء خريطة ذهنية.'
    };
  }

  // Normalize levels so the root sits cleanly at level 0
  const minLevel = Math.min(...parsedLines.map((l) => l.level));
  const normalizedLines = parsedLines.map((l) => ({
    ...l,
    level: l.level - minLevel
  }));

  // If multiple level-0 items exist, synthesize a clean root wrapper
  const topLevelCount = normalizedLines.filter((l) => l.level === 0).length;
  const nodes: MindMapNode[] = [];
  const stack: Array<{ level: number; id: string }> = [];

  if (topLevelCount > 1) {
    const rootId = 'n-root';
    nodes.push({
      id: rootId,
      label: 'خريطة ذهنية طبية',
      parentId: null,
      role: 'root',
      order: 0
    });
    stack.push({ level: -1, id: rootId });
  }

  normalizedLines.forEach((line, idx) => {
    const id = `n-${nodes.length + 1}`;
    while (stack.length > 0 && stack[stack.length - 1].level >= line.level) {
      stack.pop();
    }
    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
    const depth = stack.length;

    const condensed = condenseNodeText(line.text);
    if (condensed.wasTrimmed) trimmedCount += 1;

    nodes.push({
      id,
      label: condensed.label,
      sublabel: condensed.sublabel,
      note: condensed.note,
      parentId,
      role: inferMedicalRoleFromText(condensed.label, depth),
      order: idx
    });
    stack.push({ level: line.level, id });
  });

  const maxDepth = computeMaxDepth(nodes, nodes[0].id);
  const autoStyle: MindMapStyle = maxDepth >= 3 ? 'hierarchical' : 'radial';

  return finalizeDocument({
    title: nodes[0]?.label || 'خريطة ذهنية',
    style: options?.preferredStyle || autoStyle,
    nodes,
    edges: [],
    rootNodeId: nodes[0]?.id,
    linkedTopicId: options?.linkedTopicId,
    detectedFormat: hasMarkdownSyntax ? 'markdown' : 'indented-text',
    detectedFormatLabelAr: hasMarkdownSyntax
      ? 'Markdown (عناوين وقوائم)'
      : 'نص هرمي (TXT / ChatGPT / Gemini)',
    trimmedCount,
    warnings
  });
}

/**
 * Universal parser for Mind Map imports:
 * Accepts JSON (UMEDT native, nested tree, graph, fenced AI JSON),
 * Markdown (# headings + nested bullets), TXT outlines, ASCII trees, and Flow arrows (`A -> B`).
 */
export function parseMindMapInput(
  rawInput: string,
  options?: {
    fileName?: string;
    preferredStyle?: MindMapStyle;
    linkedTopicId?: string;
  }
): MindMapImportPreviewResult {
  const text = String(rawInput || '').trim();
  if (!text) {
    return {
      success: false,
      detectedFormat: 'indented-text',
      detectedFormatLabelAr: 'نص فارغ',
      document: null,
      stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
      warnings: [],
      error: 'يرجى لصق نص الخريطة أو رفع ملف JSON / Markdown / TXT.'
    };
  }

  const fileLower = (options?.fileName || '').toLowerCase();
  const extractedJson = extractJsonBlockFromText(text);

  // JSON has absolute precedence. A successfully parsed JSON document is never
  // reinterpreted as TXT/Markdown, even when its schema is invalid.
  if (extractedJson) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(extractedJson);
    } catch (error) {
      return parseJsonMindMap(extractedJson, options);
    }
    const candidate =
      parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)
        ? ((parsedJson as Record<string, unknown>).mindMap &&
            typeof (parsedJson as Record<string, unknown>).mindMap === 'object'
            ? (parsedJson as Record<string, unknown>).mindMap
            : parsedJson)
        : parsedJson;
    if (candidate && typeof candidate === 'object' &&
        (candidate as Record<string, unknown>).schemaVersion !== undefined) {
      const validationError = validateUnifiedMindMapJson(candidate);
      if (validationError) {
        return {
          success: false,
          detectedFormat: 'umedt-json',
          detectedFormatLabelAr: 'ملف JSON الموحد',
          document: null,
          stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
          warnings: [],
          error: validationError
        };
      }
    }
    return parseJsonMindMap(extractedJson, options);
  }

  // Explicit JSON uploads must not silently fall through to a one-node text map.
  if (fileLower.endsWith('.json') || text.startsWith('{') || text.startsWith('[') || text.startsWith('```')) {
    return {
      success: false,
      detectedFormat: 'umedt-json',
      detectedFormatLabelAr: 'ملف JSON',
      document: null,
      stats: { nodeCount: 0, edgeCount: 0, maxDepth: 0, trimmedLongNodes: 0 },
      warnings: [],
      error: 'تعذر العثور على كائن JSON صالح في الملف. تحقق من المحتوى والأسوار الخارجية.'
    };
  }

  return parseOutlineOrMarkdown(text, options);
}
