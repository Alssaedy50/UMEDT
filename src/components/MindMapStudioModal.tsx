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
  ArrowRight,
  ChevronDown,
  Clock3,
  CalendarClock
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
  buildMindMapGenerationPrompt
} from '../services/mindMapImportService';
import { InteractiveMindMapCanvas } from './InteractiveMindMapCanvas';
import { parseUploadedFile } from '../services/fileParserService';
import { MobileSafeNumericInput } from './MobileSafeInput';

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
  const [studioMode, setStudioMode] = useState<'list' | 'create' | 'import' | 'canvas'>('list');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [sortMode, setSortMode] = useState<'updated' | 'created' | 'name'>('updated');
  const [creationTitle, setCreationTitle] = useState(initialTopic?.titleEn || initialTopic?.title || '');
  const [creationTopicId, setCreationTopicId] = useState(initialTopic?.id || '');
  const [creationStyle, setCreationStyle] = useState<MindMapStyle>('hierarchical');
  const [importLinkedTopicId, setImportLinkedTopicId] = useState(initialTopic?.id || '');

  // Importer state
  const [importText, setImportText] = useState<string>('');
  const [importFileName, setImportFileName] = useState<string>('');
  const [preferredStyle, setPreferredStyle] = useState<MindMapStyle | 'auto'>('auto');
  const [copiedPromptKey, setCopiedPromptKey] = useState<string | null>(null);
  const [promptTopic, setPromptTopic] = useState(initialTopic?.title || '');
  const [promptNodeCount, setPromptNodeCount] = useState('24');
  const [promptStyle, setPromptStyle] = useState<MindMapStyle>('hierarchical');
  const [promptOutputFormat, setPromptOutputFormat] = useState<'text' | 'file'>('text');
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
    setCreationTopicId(initialTopic?.id || '');
    setImportLinkedTopicId(initialTopic?.id || '');
    setCreationTitle(initialTopic?.titleEn || initialTopic?.title || '');
    setStudioMode(initialMindMapId ? 'canvas' : 'list');

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
    const filtered = scopeTopicId === 'ALL'
      ? [...allMaps]
      : allMaps.filter((m) => m.linkedTopicId === scopeTopicId);
    return filtered.sort((a, b) => {
      if (sortMode === 'name') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      const aTime = Date.parse(sortMode === 'created' ? a.createdAt : a.updatedAt) || 0;
      const bTime = Date.parse(sortMode === 'created' ? b.createdAt : b.updatedAt) || 0;
      return bTime - aTime;
    });
  }, [allMaps, scopeTopicId, sortMode]);

  const activeMap = useMemo(
    () => visibleMaps.find((m) => m.id === activeMapId) || allMaps.find((m) => m.id === activeMapId) || visibleMaps[0] || null,
    [visibleMaps, allMaps, activeMapId]
  );

  const importPreview = useMemo(() => {
    if (!importText.trim()) return null;
    return parseMindMapInput(importText, {
      fileName: importFileName || undefined,
      preferredStyle: preferredStyle === 'auto' ? undefined : preferredStyle,
      linkedTopicId: importLinkedTopicId || undefined
    });
  }, [importText, importFileName, preferredStyle, importLinkedTopicId]);

  if (!isOpen) return null;

  const handleSaveMapUpdate = (nextDoc: MindMapDocument) => {
    const updated = upsertMindMap(nextDoc);
    setAllMaps(updated);
  };

  const handleCreateBlank = () => {
    const selectedTopic = topics.find((topic) => topic.id === creationTopicId) || null;
    const created = createBlankMindMap({
      topic: selectedTopic,
      title: creationTitle.trim() || undefined,
      style: creationStyle
    });
    const updated = upsertMindMap(created);
    setAllMaps(updated);
    setActiveMapId(created.id);
    setScopeTopicId('ALL');
    setStudioMode('canvas');
    setShowAddMenu(false);
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
      linkedTopicId: importLinkedTopicId || importPreview.document.linkedTopicId
    };
    const updated = upsertMindMap(docToSave);
    setAllMaps(updated);
    setActiveMapId(docToSave.id);
    setScopeTopicId('ALL');
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

  const buildConfiguredPrompt = () => buildMindMapGenerationPrompt({
    topic: promptTopic.trim() || scopedTopic?.title || initialTopic?.title || '',
    nodeCount: Number(promptNodeCount) || 24,
    style: promptStyle,
    outputFormat: promptOutputFormat
  });

  const handleCopyPrompt = async (key: 'json') => {
    try {
      await navigator.clipboard.writeText(buildConfiguredPrompt());
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

          {studioMode === 'list' ? (
            <div className="relative flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddMenu((open) => !open)}
                aria-expanded={showAddMenu}
                className="min-h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm"
                aria-label="إضافة خريطة"
                title="إضافة خريطة"
              >
                <Plus className="w-5 h-5" />
              </button>
              {showAddMenu && (
                <div className="absolute left-0 top-full z-30 mt-2 w-52 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-2xl">
                  <button type="button" onClick={() => { setCreationTopicId(scopeTopicId === 'ALL' ? '' : scopeTopicId); setCreationTitle(scopedTopic?.titleEn || scopedTopic?.title || ''); setStudioMode('create'); setShowAddMenu(false); }} className="w-full rounded-xl px-3 py-3 text-right text-xs font-extrabold hover:bg-emerald-500/10">إنشاء يدوي</button>
                  <button type="button" onClick={() => { setImportLinkedTopicId(scopeTopicId === 'ALL' ? '' : scopeTopicId); setStudioMode('import'); setShowAddMenu(false); }} className="w-full rounded-xl px-3 py-3 text-right text-xs font-extrabold hover:bg-emerald-500/10">استيراد خريطة</button>
                </div>
              )}
              <button type="button" onClick={requestClose} className="min-h-10 min-w-10 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center" aria-label={backLabel || "العودة"} title={backLabel || "العودة"}><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setStudioMode('list')} className="min-h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">العودة إلى قائمة الخرائط</button>
              <button type="button" onClick={requestClose} className="min-h-10 min-w-10 rounded-xl bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center" aria-label={backLabel || "العودة"}><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-4">
          {studioMode === 'list' ? (
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-base font-black">خرائطي التفاعلية</h3>
                  <p className="mt-1 text-xs text-slate-500">{allMaps.length} خريطة محفوظة · اختر خريطة لفتح محررها</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="text-[10px] font-bold text-slate-500">ترتيب حسب
                    <select value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)} className="mt-1 block min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-bold">
                      <option value="updated">آخر تحديث</option>
                      <option value="created">تاريخ الإنشاء</option>
                      <option value="name">الاسم</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-bold text-slate-500">الموضوع
                    <select value={scopeTopicId} onChange={(e) => setScopeTopicId(e.target.value)} className="mt-1 block min-h-9 max-w-[190px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-xs font-bold">
                      <option value="ALL">كل المواضيع ({allMaps.length})</option>
                      {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.titleAr || topic.titleEn || topic.title}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              {visibleMaps.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-8 text-center">
                  <Network className="mx-auto mb-3 h-10 w-10 text-emerald-500/60" />
                  <h4 className="text-sm font-black">{scopeTopicId === 'ALL' ? 'لا توجد خرائط محفوظة بعد' : 'لا توجد خرائط مرتبطة بهذا الموضوع'}</h4>
                  <p className="mt-2 text-xs text-slate-500">استخدم زر الإضافة لإنشاء خريطة يدوياً أو استيراد خريطة موجودة.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleMaps.map((map) => {
                    const linkedTopic = topics.find((topic) => topic.id === map.linkedTopicId);
                    return (
                      <button key={map.id} type="button" onClick={() => { setActiveMapId(map.id); setStudioMode('canvas'); }} className="group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-4 text-right shadow-sm transition hover:border-emerald-500 hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-black group-hover:text-emerald-600">{map.title}</h4>
                            <p className="mt-1 text-[10px] text-slate-500">{map.nodes.length} عقدة · {map.edges.length} علاقة</p>
                          </div>
                          <Network className="h-5 w-5 shrink-0 text-emerald-500" />
                        </div>
                        <div className="mt-4 space-y-1 text-[10px] text-slate-500">
                          <p>{linkedTopic ? `الموضوع: ${linkedTopic.titleAr || linkedTopic.titleEn || linkedTopic.title}` : 'غير مرتبطة بموضوع'}</p>
                          <p className="flex items-center gap-1"><CalendarClock className="h-3 w-3" /> أُنشئت: {new Date(map.createdAt).toLocaleString('ar')}</p>
                          <p className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> آخر تحديث: {new Date(map.updatedAt).toLocaleString('ar')}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ) : studioMode === 'create' ? (
            <section className="mx-auto w-full max-w-2xl space-y-5">
              <div><h3 className="text-base font-black">إنشاء خريطة يدوياً</h3><p className="mt-1 text-xs text-slate-500">حدد بيانات الخريطة الأولية ثم انتقل إلى المحرر لإضافة العقد والروابط وتعديلها.</p></div>
              <label className="block text-xs font-extrabold">اسم الخريطة
                <input dir="auto" value={creationTitle} onChange={(e) => setCreationTitle(e.target.value)} placeholder="مثال: Atherosclerosis" className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm" />
              </label>
              <label className="block text-xs font-extrabold">ربط الخريطة بموضوع
                <select value={creationTopicId} onChange={(e) => { setCreationTopicId(e.target.value); if (!creationTitle.trim()) setCreationTitle(topics.find((topic) => topic.id === e.target.value)?.titleEn || topics.find((topic) => topic.id === e.target.value)?.title || ''); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-xs">
                  <option value="">غير مرتبطة بموضوع</option>
                  {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.titleAr || topic.titleEn || topic.title}</option>)}
                </select>
              </label>
              <label className="block text-xs font-extrabold">نمط التخطيط
                <select value={creationStyle} onChange={(e) => setCreationStyle(e.target.value as MindMapStyle)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-xs font-bold">
                  <option value="hierarchical">هرمي</option><option value="radial">شعاعي</option><option value="medical_flow">مسار سريري</option>
                </select>
              </label>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setStudioMode('list')} className="min-h-10 rounded-xl px-4 text-xs font-bold bg-slate-100 dark:bg-slate-800">إلغاء</button><button type="button" disabled={!creationTitle.trim()} onClick={handleCreateBlank} className="min-h-10 rounded-xl bg-emerald-600 px-5 text-xs font-extrabold text-white disabled:opacity-40">إنشاء وفتح المحرر</button></div>
            </section>
          ) : studioMode === 'import' ? (
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
                  onClick={() => setStudioMode('list')}
                  className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold flex items-center gap-1"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>العودة إلى قائمة الخرائط</span>
                </button>
              </div>

              <label className="block text-xs font-extrabold">ربط الخريطة بموضوع محدد
                <select value={importLinkedTopicId} onChange={(e) => setImportLinkedTopicId(e.target.value)} className="mt-1 min-h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs">
                  <option value="">غير مرتبطة بموضوع</option>
                  {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.titleAr || topic.titleEn || topic.title}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  موضوع الخريطة
                  <input
                    type="text"
                    value={promptTopic}
                    onChange={(e) => setPromptTopic(e.target.value)}
                    placeholder={scopedTopic?.title || 'مثال: Atherosclerosis'}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  العدد المستهدف للعقد (بما فيها الجذر)
                  <MobileSafeNumericInput
                    value={promptNodeCount}
                    onRawChange={setPromptNodeCount}
                    min={3}
                    max={80}
                    fallbackOnBlur={24}
                    aria-label="العدد المستهدف للعقد"
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  نمط الخريطة
                  <select
                    value={promptStyle}
                    onChange={(e) => setPromptStyle(e.target.value as MindMapStyle)}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="hierarchical">هرمية واضحة</option>
                    <option value="radial">شعاعية متوازنة</option>
                    <option value="medical_flow">مسار سريري</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  صيغة النتيجة
                  <select
                    value={promptOutputFormat}
                    onChange={(e) => setPromptOutputFormat(e.target.value as 'text' | 'file')}
                    className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    <option value="text">نص JSON قابل للنسخ واللصق</option>
                    <option value="file">ملف JSON قابل للتنزيل</option>
                  </select>
                </label>
                <p className="sm:col-span-2 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
                  في الحالتين يبقى المحتوى JSON مطابقاً لمستورد UMEDT. يمكن لصق النص مباشرة أو رفع ملف .json من أداة الاستيراد، ويجب أن يحتوي الملف على JSON فقط.
                </p>
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
