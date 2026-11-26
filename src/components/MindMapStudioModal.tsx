import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X,
  Plus,
  Sparkles,
  Upload,
  FileText,
  Trash2,
  Network,
  Copy,
  Check,
  Wand2,
  BookOpen,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { TopicArticle } from '../types/lexicon';
import { MindMapDocument, MindMapStyle } from '../types/mindMap';
import {
  loadMindMaps,
  upsertMindMap,
  deleteMindMap,
  createBlankMindMap,
  generateMindMapFromTopic,
  MIND_MAPS_UPDATED_EVENT
} from '../services/mindMapStorageService';
import {
  parseMindMapInput,
  MIND_MAP_AI_PROMPTS
} from '../services/mindMapImportService';
import { InteractiveMindMapCanvas } from './InteractiveMindMapCanvas';
import { parseUploadedFile } from '../services/fileParserService';

interface MindMapStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  topics: TopicArticle[];
  initialTopic?: TopicArticle | null;
  initialMindMapId?: string | null;
  onEmbedMapInTopic?: (topic: TopicArticle, mindMap: MindMapDocument) => void;
  onOpenLinkedTopic?: (topicId: string) => void;
  backLabel?: string;
  showToast: (msg: string, type?: string) => void;
}

export const MindMapStudioModal: React.FC<MindMapStudioModalProps> = ({
  isOpen,
  onClose,
  topics,
  initialTopic = null,
  initialMindMapId = null,
  onEmbedMapInTopic,
  backLabel,
  showToast
}) => {
  const [allMaps, setAllMaps] = useState<MindMapDocument[]>(() => loadMindMaps());
  const [scopeTopicId, setScopeTopicId] = useState<string>(initialTopic?.id || 'ALL');
  const [activeMapId, setActiveMapId] = useState<string | null>(initialMindMapId || null);
  const [studioMode, setStudioMode] = useState<'canvas' | 'import'>('canvas');

  // Importer state
  const [importText, setImportText] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [preferredStyle, setPreferredStyle] = useState<MindMapStyle | 'auto'>('auto');
  const [copiedPromptKey, setCopiedPromptKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  const historyEntryRef = useRef(false);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const requestClose = useCallback(() => {
    if (historyEntryRef.current) {
      historyEntryRef.current = false;
      window.history.back();
    } else {
      onCloseRef.current();
    }
  }, []);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const overlayWindow = window as Window & { __umedtMindMapStudioOpen?: boolean; __umedtMindMapViewerOpen?: boolean };
    overlayWindow.__umedtMindMapStudioOpen = true;
    window.history.pushState({ ...(window.history.state || {}), umedtMindMapStudio: true }, '', window.location.href);
    historyEntryRef.current = true;
    const handlePopState = () => {
      if (overlayWindow.__umedtMindMapViewerOpen) return;
      historyEntryRef.current = false;
      overlayWindow.__umedtMindMapStudioOpen = false;
      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !overlayWindow.__umedtMindMapViewerOpen) requestClose();
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
      overlayWindow.__umedtMindMapStudioOpen = false;
    };
  }, [isOpen]);

  // Sync with storage changes
  useEffect(() => {
    if (!isOpen) return;
    const loaded = loadMindMaps();
    setAllMaps(loaded);

    const nextScope = initialTopic?.id || 'ALL';
    setScopeTopicId(nextScope);
    setStudioMode('canvas');

    if (initialMindMapId && loaded.some((m) => m.id === initialMindMapId)) {
      setActiveMapId(initialMindMapId);
    } else if (initialTopic) {
      const forTopic = loaded.filter((m) => m.linkedTopicId === initialTopic.id);
      if (forTopic.length > 0) {
        setActiveMapId(forTopic[0].id);
      } else {
        // Also check inline mind_map blocks inside the topic
        const inlineBlockMap = initialTopic.sections
          ?.flatMap((s) => s.contentBlocks || [])
          .find((b) => b.type === 'mind_map' && b.mindMapData)?.mindMapData;
        if (inlineBlockMap) {
          const synced = upsertMindMap({
            ...inlineBlockMap,
            linkedTopicId: inlineBlockMap.linkedTopicId || initialTopic.id
          });
          setAllMaps(synced);
          setActiveMapId(inlineBlockMap.id);
        } else {
          setActiveMapId(null);
        }
      }
    } else {
      setActiveMapId(loaded[0]?.id || null);
    }
  }, [isOpen, initialTopic, initialMindMapId]);

  useEffect(() => {
    const onUpdated = () => setAllMaps(loadMindMaps());
    window.addEventListener(MIND_MAPS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(MIND_MAPS_UPDATED_EVENT, onUpdated);
  }, []);

  const scopedTopic = useMemo(
    () =>
      scopeTopicId !== 'ALL'
        ? topics.find((t) => t.id === scopeTopicId) || initialTopic || null
        : null,
    [scopeTopicId, topics, initialTopic]
  );

  const visibleMaps = useMemo(() => {
    if (scopeTopicId === 'ALL') return allMaps;
    return allMaps.filter((m) => m.linkedTopicId === scopeTopicId);
  }, [allMaps, scopeTopicId]);

  const activeMap = useMemo(
    () => visibleMaps.find((m) => m.id === activeMapId) || allMaps.find((m) => m.id === activeMapId) || visibleMaps[0] || null,
    [visibleMaps, allMaps, activeMapId]
  );

  const importPreview = useMemo(() => {
    if (!importText.trim()) return null;
    return parseMindMapInput(importText, {
      fileName: importFileName || undefined,
      preferredStyle: preferredStyle === 'auto' ? undefined : preferredStyle,
      linkedTopicId: scopedTopic?.id
    });
  }, [importText, importFileName, preferredStyle, scopedTopic]);

  if (!isOpen) return null;

  const handleSaveMapUpdate = (nextDoc: MindMapDocument) => {
    const updated = upsertMindMap(nextDoc);
    setAllMaps(updated);
  };

  const handleCreateBlank = () => {
    const created = createBlankMindMap({
      topic: scopedTopic,
      style: preferredStyle === 'auto' ? 'radial' : preferredStyle
    });
    const updated = upsertMindMap(created);
    setAllMaps(updated);
    setActiveMapId(created.id);
    setStudioMode('canvas');
    showToast('تم إنشاء خريطة ذهنية جديدة قابلة للتعديل');
  };

  const handleAutoGenerateFromTopic = (targetTopic: TopicArticle, style: MindMapStyle = 'radial') => {
    const generated = generateMindMapFromTopic(targetTopic, style);
    const updated = upsertMindMap(generated);
    setAllMaps(updated);
    setScopeTopicId(targetTopic.id);
    setActiveMapId(generated.id);
    setStudioMode('canvas');
    showToast(`تم توليد خريطة ذهنية تفاعلية (${generated.nodes.length} عقدة) من أقسام الموضوع`);
  };

  const handleDeleteActiveMap = () => {
    if (!activeMap) return;
    const updated = deleteMindMap(activeMap.id);
    setAllMaps(updated);
    const remaining =
      scopeTopicId === 'ALL'
        ? updated
        : updated.filter((m) => m.linkedTopicId === scopeTopicId);
    setActiveMapId(remaining[0]?.id || null);
    showToast('تم حذف الخريطة الذهنية');
  };

  const handleConfirmImport = () => {
    if (!importPreview?.success || !importPreview.document) return;
    const docToSave: MindMapDocument = {
      ...importPreview.document,
      linkedTopicId: scopedTopic?.id || importPreview.document.linkedTopicId
    };
    const updated = upsertMindMap(docToSave);
    setAllMaps(updated);
    setActiveMapId(docToSave.id);
    setStudioMode('canvas');
    setImportText('');
    setImportFileName('');
    showToast(
      `تم استيراد الخريطة بنجاح (${docToSave.nodes.length} عقدة)`
    );
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let content = '';
      if (['pdf', 'docx'].includes(ext)) {
        const parsed = await parseUploadedFile(file);
        content = parsed.extractedText || '';
        if (!content.trim()) throw new Error(parsed.parseWarnings?.join(' ') || 'لم يتم العثور على نص قابل للاستخراج');
        if (parsed.parseWarnings?.length) showToast(parsed.parseWarnings.join(' · '), 'info');
      } else {
        content = await file.text();
        if (['html', 'htm'].includes(ext)) content = content.replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
      }
      setImportFileName(file.name);
      setImportText(content);
    } catch {
      showToast('تعذر قراءة الملف المرفوع أو لا يحتوي على نص قابل للاستخراج', 'info');
    } finally {
      e.target.value = '';
    }
  };

  const handleCopyPrompt = async (key: 'json') => {
    try {
      await navigator.clipboard.writeText(MIND_MAP_AI_PROMPTS[key]);
      setCopiedPromptKey(key);
      window.setTimeout(() => setCopiedPromptKey(null), 1800);
      showToast('تم نسخ قالب الذكاء الاصطناعي');
    } catch {
      showToast('تعذر النسخ إلى الحافظة', 'info');
    }
  };

  return (
    <div
      onClick={requestClose}
      className="fixed inset-0 z-[65] bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl max-h-[94dvh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.md,.markdown,.txt,.pdf,.docx,.html,.htm"
          onChange={handleUploadFile}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Network className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                استوديو الخرائط الذهنية التفاعلية
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {scopedTopic
                  ? `الموضوع: ${scopedTopic.titleEn || scopedTopic.title}`
                  : `جميع الخرائط الذهنية المحفوظة (${allMaps.length})`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Topic Scope Selector when multiple topics exist */}
            <select
              dir="auto"
              value={scopeTopicId}
              onChange={(e) => {
                const nextId = e.target.value;
                setScopeTopicId(nextId);
                const nextList =
                  nextId === 'ALL'
                    ? allMaps
                    : allMaps.filter((m) => m.linkedTopicId === nextId);
                setActiveMapId(nextList[0]?.id || null);
              }}
              className="max-w-[200px] min-h-[36px] px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">كل المواضيع ({allMaps.length})</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titleAr || t.titleEn || t.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setStudioMode((m) => (m === 'import' ? 'canvas' : 'import'))}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border transition-colors ${
                studioMode === 'import'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-emerald-500'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>استيراد نص / JSON</span>
            </button>

            <button
              type="button"
              onClick={handleCreateBlank}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>خريطة جديدة</span>
            </button>

            <button
              type="button"
              onClick={requestClose}
              className="min-h-[36px] min-w-[36px] rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center"
              aria-label={backLabel || "العودة"}
              title={backLabel || "العودة"}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
          {studioMode === 'import' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    استيراد خريطة ذهنية موحد (JSON / ملفات قديمة متوافقة)
                  </h3>
                  <p className="text-xs text-slate-500">
                    استخدم برمبت JSON الموحد للمخرجات الجديدة. يمكن استيراد الخرائط القديمة أيضاً عبر نفس مسار التحليل والمعاينة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStudioMode('canvas')}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>العودة للخريطة</span>
                </button>
              </div>

              {/* Copyable AI Prompt Templates */}
              <div className="p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/25 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>قالب توليد موحد متوافق مع مستورد UMEDT:</span>
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyPrompt('json')}
                      className="min-h-[32px] px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-[11px] font-bold flex items-center gap-1"
                    >
                      {copiedPromptKey === 'json' ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-emerald-500" />
                      )}
                      <span>{copiedPromptKey === 'json' ? 'تم نسخ البرمبت الموحد' : 'نسخ برمبت JSON الموحد'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Input Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-emerald-500" />
                    <span>رفع ملف (.json / .md / .txt)</span>
                  </button>
                  {importFileName && (
                    <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                      {importFileName}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">نمط العرض:</span>
                  <select
                    value={preferredStyle}
                    onChange={(e) =>
                      setPreferredStyle(e.target.value as MindMapStyle | 'auto')
                    }
                    className="min-h-[36px] px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  >
                    <option value="auto">تحديد تلقائي ذكي</option>
                    <option value="radial">شعاعية متوازنة (Radial)</option>
                    <option value="hierarchical">شجرة هرمية (Hierarchical)</option>
                    <option value="medical_flow">مسار تدفق سريري (Medical Flow)</option>
                  </select>
                </div>
              </div>

              <textarea
                rows={8}
                dir="auto"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={`مثال Markdown:\n# Iron Deficiency Anemia\n## Etiology\n- Chronic blood loss: نزف مزمن\n- Dietary insufficiency\n## Diagnosis\n- Low Ferritin: أدق مؤشر\n- Microcytic hypochromic RBCs\n\nأو مثال مسار تدفق:\nChest Pain -> [ECG] ST Elevation -> PCI within 90 min`}
                className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono leading-relaxed focus:outline-none focus:border-emerald-500"
              />

              <div className="rounded-xl border border-violet-200 bg-violet-50/70 px-3 py-2 text-[11px] leading-5 text-violet-900 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-200">
                <strong>كيف يتعرف UMEDT على الخريطة؟</strong>
                <p>يقرأ JSON لاكتشاف nodes وedges أو children، ويحلل Markdown من العناوين والقوائم المتداخلة، وTXT من المسافات والتفرعات، وأسهم A -&gt; B لمسارات التدفق. يمكن استخراج النص من PDF وDOCX قبل التحليل. يعرض التطبيق الصيغة والعقد والعلاقات وعمق الشجرة قبل الحفظ.</p>
                <p>الملفات المصورة أو PDF الممسوح ضوئياً تحتاج OCR خارجياً أولاً؛ لا يدّعي المستورد قراءة الصور تلقائياً.</p>
              </div>

              {/* Live Parse Preview */}
              {importPreview && (
                <div
                  className={`p-4 rounded-2xl border space-y-3 ${
                    importPreview.success
                      ? 'bg-emerald-500/5 border-emerald-500/40'
                      : 'bg-rose-500/5 border-rose-500/40'
                  }`}
                >
                  {importPreview.success && importPreview.document ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                            تم التعرف على الصيغة: {importPreview.detectedFormatLabelAr}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                            {importPreview.stats.nodeCount} عقدة · {importPreview.stats.edgeCount} علاقة · عمق{' '}
                            {importPreview.stats.maxDepth}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={handleConfirmImport}
                          className="min-h-[40px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          <span>اعتماد وحفظ الخريطة</span>
                        </button>
                      </div>

                      {importPreview.warnings.length > 0 && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5">
                          {importPreview.warnings.map((w, i) => (
                            <div key={i}>• {w}</div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{importPreview.error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Quick Map Selector & Topic Auto-Generator Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  {visibleMaps.map((m) => {
                    const isActive = activeMap?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setActiveMapId(m.id)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-extrabold max-w-[230px] truncate transition-colors ${
                          isActive
                            ? 'bg-emerald-600 text-white border-emerald-600 dark:bg-emerald-500 dark:text-slate-950'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-emerald-500'
                        }`}
                      >
                        {m.title}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {scopedTopic && (
                    <button
                      type="button"
                      onClick={() =>
                        handleAutoGenerateFromTopic(
                          scopedTopic,
                          preferredStyle === 'auto' ? 'radial' : preferredStyle
                        )
                      }
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-1.5"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>توليد تلقائي من الموضوع</span>
                    </button>
                  )}

                  {activeMap && scopedTopic && onEmbedMapInTopic && (
                    <button
                      type="button"
                      onClick={() => onEmbedMapInTopic(scopedTopic, activeMap)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500/15 text-xs font-bold flex items-center gap-1.5"
                      title="إدراج هذه الخريطة داخل نص الموضوع كعنصر محتوى"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                      <span>إدراج داخل الموضوع</span>
                    </button>
                  )}

                  {activeMap && (
                    <button
                      type="button"
                      onClick={handleDeleteActiveMap}
                      className="min-h-[36px] px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-1"
                      title="حذف الخريطة الحالية"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Active Canvas OR Empty State */}
              {activeMap ? (
                <div className="space-y-3">
                  {/* Editable Map Title & Topic Link Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-7">
                      <input
                        type="text"
                        dir="auto"
                        value={activeMap.title}
                        onChange={(e) =>
                          handleSaveMapUpdate({
                            ...activeMap,
                            title: e.target.value
                          })
                        }
                        placeholder="عنوان الخريطة الذهنية..."
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-extrabold"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <select
                        dir="auto"
                        value={activeMap.linkedTopicId || ''}
                        onChange={(e) =>
                          handleSaveMapUpdate({
                            ...activeMap,
                            linkedTopicId: e.target.value || undefined
                          })
                        }
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                      >
                        <option value="">غير مرتبطة بموضوع محدد</option>
                        {topics.map((t) => (
                          <option key={t.id} value={t.id}>
                            مرتبطة بـ: {t.titleAr || t.titleEn || t.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <InteractiveMindMapCanvas
                    document={activeMap}
                    onChangeDocument={handleSaveMapUpdate}
                    editable={true}
                    showToast={showToast}
                  />
                </div>
              ) : (
                <div className="p-8 sm:p-10 rounded-3xl bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-800 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <Network className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 max-w-md mx-auto">
                    <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                      {scopedTopic
                        ? 'لا توجد خريطة ذهنية لهذا الموضوع بعد'
                        : 'لا توجد خرائط ذهنية محفوظة بعد'}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      يمكنك توليد خريطة ذهنية تفاعلية تلقائياً من أقسام الموضوع وملاحظاته السريرية، أو استيرادها من Markdown / JSON / ChatGPT / Gemini، أو بناؤها من الصفر.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {scopedTopic && (
                      <button
                        type="button"
                        onClick={() => handleAutoGenerateFromTopic(scopedTopic, 'radial')}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5"
                      >
                        <Wand2 className="w-4 h-4" />
                        <span>توليد خريطة تلقائياً من الموضوع</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setStudioMode('import')}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-xs font-bold flex items-center gap-1.5"
                    >
                      <FileText className="w-4 h-4 text-emerald-500" />
                      <span>استيراد Markdown / JSON / أسهم</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCreateBlank}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 text-emerald-500" />
                      <span>إنشاء خريطة فارغة</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
