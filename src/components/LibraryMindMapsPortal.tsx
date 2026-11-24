import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronUp, Copy, FileUp, Network, Palette, Share2, Shapes, X } from 'lucide-react';
import { MindMapDocument, MindMapNode } from '../types/mindMap';
import { TopicArticle } from '../types/lexicon';
import { parseMindMapInput, MIND_MAP_AI_PROMPTS } from '../services/mindMapImportService';
import { loadMindMaps, upsertMindMap, deleteMindMap, MIND_MAPS_UPDATED_EVENT } from '../services/mindMapStorageService';
import { buildStandaloneMindMapHtmlV2 } from '../services/mindMapStandaloneExportServiceV2';
import { computeMindMapLayout } from '../services/mindMapLayoutEngine';
import { shareFileWithVerification } from '../utils/downloadHelper';
import { MindMapFullScreenViewer } from './MindMapFullScreenViewer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: string) => void;
  topics?: TopicArticle[];
}
const PALETTE = [
  { value: '#0f766e', label: 'فيروزي' }, { value: '#2563eb', label: 'أزرق' },
  { value: '#7c3aed', label: 'بنفسجي' }, { value: '#db2777', label: 'وردي' },
  { value: '#d97706', label: 'برتقالي' }, { value: '#dc2626', label: 'أحمر' },
  { value: '#475569', label: 'رمادي' }, { value: '#15803d', label: 'أخضر' }
];
const SHAPES = [{ value: 'rounded', label: 'مستطيل مستدير' }, { value: 'pill', label: 'بيضاوي' }, { value: 'diamond', label: 'معيّن' }, { value: 'hexagon', label: 'سداسي' }, { value: 'circle', label: 'دائري' }] as const;
const PROMPT = `أنشئ خريطة تعليمية تفاعلية متوافقة مع UMEDT حول: [اكتب الموضوع].
أخرج JSON صالحاً فقط دون Markdown أو مقدمات، بالهيكل التالي:
{
 "title":"عنوان الخريطة","titleEn":"English title","style":"hierarchical",
 "nodes":[
  {"id":"root","label":"عنوان العقدة المختصر","sublabel":"ترجمة أو عنوان فرعي","note":"شرح كامل غير محدود للعقدة، ويمكن أن يحتوي فقرات وقوائم وأمثلة","parentId":null,"role":"root","shape":"rounded","color":"#0f766e"},
  {"id":"n1","label":"العقدة التالية","sublabel":"ترجمتها","note":"شرح تفصيلي كامل","parentId":"root","role":"mechanism","shape":"diamond","color":"#2563eb"}
 ],
 "edges":[{"id":"e1","sourceId":"root","targetId":"n1","label":"العلاقة"}]
}
قواعد إلزامية:
1) اجعل label عنواناً موجزاً فقط، وضع الشرح التفصيلي كاملاً في note دون اختصار أو حد للطول.
2) أنشئ عقداً هرمية مترابطة، واستخدم parentId الصحيح لكل عقدة.
3) أضف edges للعلاقات السببية أو التسلسلية المهمة.
4) استخدم role من: root, concept, mechanism, diagnosis, treatment, warning.
5) استخدم shape من: rounded, pill, diamond, hexagon, circle، وcolor بصيغة HEX.
6) حافظ على أسماء المصطلحات الطبية باللغة الإنجليزية، وأضف الترجمة العربية والشرح عند الحاجة.
7) لا تضع نصاً خارج JSON. لا تستخدم صوراً أو روابط خارجية.`;

export const LibraryMindMapsPortal: React.FC<Props> = ({ isOpen, onClose, showToast, topics = [] }) => {
  const [maps, setMaps] = useState<MindMapDocument[]>(() => loadMindMaps());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showImporter, setShowImporter] = useState(false);
  const [showGraphViewer, setShowGraphViewer] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [fileName, setFileName] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  const [step, setStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const activeMap = maps.find(m => m.id === activeId) || maps[0] || null;
  const orderedNodes = useMemo(() => {
    if (!activeMap) return [];
    const children = new Map<string, MindMapNode[]>();
    activeMap.nodes.forEach(n => { const k = n.parentId || '__root__'; children.set(k, [...(children.get(k) || []), n]); });
    const result: MindMapNode[] = [];
    const visit = (id: string) => (children.get(id) || []).sort((a,b)=>(a.order ?? 0)-(b.order ?? 0)).forEach(n => { result.push(n); visit(n.id); });
    visit('__root__');
    activeMap.nodes.forEach(n => { if (!result.some(x => x.id === n.id)) result.push(n); });
    return result;
  }, [activeMap]);
  const currentNode = orderedNodes[Math.min(step, Math.max(0, orderedNodes.length - 1))] || null;

  if (!isOpen) return null;
  const refresh = (next?: MindMapDocument) => {
    const all = loadMindMaps(); setMaps(all);
    if (next) { setActiveId(next.id); setStep(0); }
    window.dispatchEvent(new CustomEvent(MIND_MAPS_UPDATED_EVENT));
  };
  const importPreview = sourceText.trim() ? parseMindMapInput(sourceText, { fileName: fileName || undefined, linkedTopicId: selectedTopicId || undefined }) : null;
  const doImport = () => {
    if (!importPreview?.success || !importPreview.document) { showToast(importPreview?.error || 'تعذر تحليل الخريطة', 'info'); return; }
    const saved = upsertMindMap(importPreview.document);
    refresh(importPreview.document); setShowImporter(false); setSourceText(''); setFileName('');
    showToast(`تم استيراد الخريطة: ${saved.find(x=>x.id===importPreview.document?.id)?.nodes.length || importPreview.document.nodes.length} عقدة`);
  };
  const updateNode = (patch: Partial<MindMapNode>) => {
    if (!activeMap || !currentNode) return;
    const next = { ...activeMap, nodes: activeMap.nodes.map(n => n.id === currentNode.id ? { ...n, ...patch } : n), updatedAt: new Date().toISOString() };
    upsertMindMap(next); refresh(next);
  };
  const share = async () => {
    if (!activeMap) return;
    const layout = computeMindMapLayout(activeMap);
    const safe = activeMap.title.replace(/[^\\w\\u0600-\\u06FF-]+/g, '-').slice(0, 48) || 'mind-map';
    const result = await shareFileWithVerification({ filename: safe + '.html', content: buildStandaloneMindMapHtmlV2(activeMap, layout), mime: 'text/html;charset=utf-8', title: activeMap.title, text: 'خريطة UMEDT تفاعلية مستقلة' });
    showToast(result.messageAr);
  };
  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(PROMPT); setPromptCopied(true); window.setTimeout(()=>setPromptCopied(false),1600); showToast('تم نسخ برومبت إنشاء الخرائط'); }
    catch { showToast('تعذر نسخ البرومبت', 'info'); }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const allowed = /\\.(json|md|markdown|txt)$/i.test(file.name);
    if (!allowed) { showToast('الصيغ المدعومة حالياً: JSON وMarkdown وTXT. لا يدعم المستورد OCR للصور أو PDF.', 'info'); return; }
    try { setSourceText(await file.text()); setFileName(file.name); }
    catch { showToast('تعذر قراءة الملف', 'info'); }
  };

  return <div className="fixed inset-0 z-[130] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" dir="rtl">
    <section role="dialog" aria-modal="true" aria-label="بوابة الخرائط التفاعلية" className="w-full max-w-5xl max-h-[96dvh] overflow-hidden flex flex-col rounded-3xl border border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2"><Network className="w-5 h-5 text-emerald-500"/><div><h2 className="font-black text-sm sm:text-base">بوابة الخرائط التفاعلية</h2><p className="text-[11px] text-slate-500">استيراد · شرح تسلسلي · تخصيص العقد · مشاركة مستقلة</p></div></div>
        <button onClick={onClose} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center" aria-label="إغلاق"><X className="w-4 h-4"/></button>
      </header>
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
        <button onClick={()=>setShowImporter(v=>!v)} className="min-h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-2"><FileUp className="w-4 h-4"/>استيراد خريطة</button>
        <button onClick={()=>void copyPrompt()} className="min-h-10 px-3 rounded-xl bg-violet-600 text-white text-xs font-extrabold flex items-center gap-2"><Copy className="w-4 h-4"/>{promptCopied?'تم النسخ':'نسخ برومبت الإنشاء'}</button>
        {activeMap && <button onClick={()=>setShowGraphViewer(true)} className="min-h-10 px-3 rounded-xl bg-indigo-600 text-white text-xs font-extrabold flex items-center gap-2"><Network className="w-4 h-4"/>عرض الرسم الكامل</button>}
        {activeMap && <button onClick={()=>void share()} className="min-h-10 px-3 rounded-xl bg-sky-600 text-white text-xs font-extrabold flex items-center gap-2"><Share2 className="w-4 h-4"/>مشاركة HTML تفاعلي</button>}
        <span className="mr-auto self-center text-[11px] text-slate-500">{maps.length} خريطة محفوظة محلياً</span>
      </div>
      {showImporter && <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 space-y-2 max-h-[42dvh] overflow-y-auto">
        <input ref={fileRef} type="file" accept=".json,.md,.markdown,.txt" className="hidden" onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
        <div className="flex flex-wrap gap-2"><button onClick={()=>fileRef.current?.click()} className="min-h-9 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold">اختيار ملف JSON / MD / TXT</button><span className="self-center text-[11px] text-slate-500">{fileName || 'أو الصق النص أدناه'}</span></div>
        <textarea value={sourceText} onChange={e=>setSourceText(e.target.value)} rows={7} placeholder="الصق JSON أو Markdown أو نصاً هرمياً يحتوي على الخريطة..." className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-xs leading-6 font-mono"/>
        {importPreview && <div className={`rounded-xl p-3 text-xs ${importPreview.success?'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300':'bg-rose-500/10 text-rose-700 dark:text-rose-300'}`}>
          {importPreview.success ? <><b>تم اكتشاف بنية خريطة</b> · {importPreview.detectedFormatLabelAr} · {importPreview.stats.nodeCount} عقدة · {importPreview.stats.edgeCount} علاقة · عمق {importPreview.stats.maxDepth}{importPreview.warnings.length>0&&<p className="mt-1">{importPreview.warnings.join(' · ')}</p>}</> : importPreview.error}
        </div>}
        <button disabled={!importPreview?.success} onClick={doImport} className="min-h-10 px-4 rounded-xl bg-emerald-600 text-white text-xs font-extrabold disabled:opacity-40">تحليل وحفظ الخريطة في مكتبتي</button>
        <details className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-xs">
          <summary className="cursor-pointer font-extrabold">كيف يكتشف UMEDT الخريطة ويقرأها؟</summary>
          <ol className="mt-2 list-decimal pr-5 space-y-1 text-[11px] leading-6 text-slate-600 dark:text-slate-300">
            <li>يفحص الملف كنص محلياً دون رفعه إلى خادم.</li>
            <li>يبحث أولاً عن JSON ثم Markdown والعناوين والقوائم المتداخلة.</li>
            <li>يتعرف على الترقيم والتباعد الهرمي وشجرة ASCII وأسهم التدفق A → B.</li>
            <li>ينشئ العقد والعلاقات، ويعرض معاينة بعدد العقد والروابط والعمق قبل الحفظ.</li>
            <li>ضع الشرح الطويل داخل note؛ يبقى منفصلاً عن عنوان العقدة المختصر.</li>
          </ol>
          <p className="mt-2 text-[10px] leading-5 text-amber-700 dark:text-amber-300">الصور ولقطات الشاشة وPDF وملفات Office لا تُحوّل إلى خرائط تلقائياً حالياً؛ لا يوجد OCR. حوّل الرسم إلى نص هرمي أو JSON أولاً.</p>
        </details>
      </div>}
      <div className="grid grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)] min-h-0 flex-1">
        <aside className="border-b md:border-b-0 md:border-l border-slate-200 dark:border-slate-800 p-3 overflow-y-auto max-h-36 md:max-h-none">
          <div className="text-[11px] font-black text-slate-500 mb-2">الخرائط المحفوظة</div>
          {maps.length===0 ? <p className="text-xs text-slate-500">لا توجد خرائط بعد. استورد أول خريطة.</p> : maps.map(m=><button key={m.id} onClick={()=>{setActiveId(m.id);setStep(0);}} className={`w-full text-right p-3 mb-2 rounded-xl border text-xs font-bold ${(activeMap?.id===m.id)?'border-emerald-500 bg-emerald-500/10':'border-slate-200 dark:border-slate-700'}`}><span className="block truncate">{m.title}</span><span className="text-[10px] text-slate-500">{m.nodes.length} عقدة</span></button>)}
        </aside>
        <main className="min-h-0 overflow-y-auto p-3 sm:p-5 space-y-3">
          {!activeMap || !currentNode ? <div className="h-full min-h-48 grid place-items-center text-center text-slate-500"><div><Network className="w-10 h-10 mx-auto mb-2 opacity-40"/><p className="text-sm font-bold">استورد خريطة لبدء العرض التفاعلي</p></div></div> : <>
            <div className="flex items-center justify-between gap-2"><div className="min-w-0"><h3 className="font-black text-sm sm:text-base truncate">{activeMap.title}</h3><p className="text-[11px] text-slate-500">العقدة {step+1} من {orderedNodes.length} · العرض التسلسلي</p></div><button onClick={()=>{if(window.confirm('حذف الخريطة من مكتبتي؟')){deleteMindMap(activeMap.id);setMaps(loadMindMaps());setActiveId(null);setStep(0);}}} className="text-[11px] font-bold text-rose-600">حذف</button></div>
            <label className="block text-[11px] font-bold">ارتباط الخريطة بموضوع<select value={activeMap.linkedTopicId || ''} onChange={e=>{const next={...activeMap,linkedTopicId:e.target.value || undefined,updatedAt:new Date().toISOString()};upsertMindMap(next);refresh(next);}} className="mt-1 w-full min-h-10 rounded-lg bg-slate-100 dark:bg-slate-800 p-2"><option value="">غير مرتبطة</option>{topics.map(t=><option key={t.id} value={t.id}>{t.titleAr || t.titleEn || t.title}</option>)}</select></label>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <div className="p-4 sm:p-6 min-h-40" style={{background:`linear-gradient(135deg,${currentNode.color || '#0f766e'}20,transparent)`}}>
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 mb-3"><span className="w-2.5 h-2.5 rounded-full" style={{background:currentNode.color || '#0f766e'}}/>{currentNode.role || 'concept'} · {currentNode.shape || 'rounded'}</div>
                <h4 className="text-xl sm:text-2xl font-black leading-tight break-words">{currentNode.label}</h4>
                {currentNode.sublabel&&<p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{currentNode.sublabel}</p>}
                <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-8 text-slate-700 dark:text-slate-200">{currentNode.note || 'لا يوجد شرح لهذه العقدة بعد. يمكنك إضافته أدناه.'}</div>
              </div>
              <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                <label className="block text-[11px] font-extrabold">شرح العقدة (نص غير محدود)
                  <textarea value={currentNode.note || ''} onChange={e=>updateNode({note:e.target.value})} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-xs leading-6"/>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[11px] font-extrabold">لون العقدة<select value={currentNode.color || ''} onChange={e=>updateNode({color:e.target.value})} className="mt-1 w-full min-h-10 rounded-lg bg-slate-100 dark:bg-slate-800 p-2">{PALETTE.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
                  <label className="text-[11px] font-extrabold">شكل العقدة<select value={currentNode.shape || 'rounded'} onChange={e=>updateNode({shape:e.target.value as MindMapNode['shape']})} className="mt-1 w-full min-h-10 rounded-lg bg-slate-100 dark:bg-slate-800 p-2">{SHAPES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2"><button disabled={step===0} onClick={()=>setStep(s=>Math.max(0,s-1))} className="min-h-11 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 text-xs font-extrabold disabled:opacity-35 flex items-center gap-2"><ArrowRight className="w-4 h-4"/>السابق</button><div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-emerald-500" style={{width:`${((step+1)/orderedNodes.length)*100}%`}}/></div><button disabled={step>=orderedNodes.length-1} onClick={()=>setStep(s=>Math.min(orderedNodes.length-1,s+1))} className="min-h-11 px-4 rounded-xl bg-emerald-600 text-white text-xs font-extrabold disabled:opacity-35 flex items-center gap-2">التالي<ArrowLeft className="w-4 h-4"/></button></div>
            <div className="flex flex-wrap gap-1.5">{orderedNodes.map((n,i)=><button key={n.id} onClick={()=>setStep(i)} title={n.label} className={`w-7 h-7 rounded-lg text-[10px] font-black ${i===step?'bg-emerald-600 text-white':'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{i+1}</button>)}</div>
          </>}
        </main>
      </div>
    </section>
    {showGraphViewer && activeMap && <MindMapFullScreenViewer mapDocument={activeMap} onClose={()=>setShowGraphViewer(false)} showToast={showToast}/>} 
  </div>;
};
