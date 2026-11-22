import React, { useMemo, useState } from 'react';
import { X, Copy, Check, Sparkles, BookOpen, Languages, Download, Layers, Upload, FileText, FileJson, FileArchive } from 'lucide-react';
import { loadMedicalBlocks, loadMedicalSubjects } from '../services/learningHierarchyService';

interface AiContentGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast?: (msg: string, type?: string) => void;
  onOpenPasteModal?: (targetType?: 'terms' | 'topics') => void;
  onOpenUploadModal?: (targetType?: 'terms' | 'topics') => void;
}

type GeneratorMode = 'topic' | 'terms';
type TermsOutputFormat = 'text' | 'json' | 'zip';

const slugify = (value: string): string =>
  value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'topic';

const normalizeDigits = (value: string): string =>
  value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));

export const AiContentGuideModal: React.FC<AiContentGuideModalProps> = ({
  isOpen,
  onClose,
  showToast,
  onOpenPasteModal,
  onOpenUploadModal
}) => {
  const [mode, setMode] = useState<GeneratorMode>('topic');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [topicTitleEn, setTopicTitleEn] = useState('');
  const [topicTitleAr, setTopicTitleAr] = useState('');
  const [topicLevel, setTopicLevel] = useState('Intermediate medical student');
  const [topicDepth, setTopicDepth] = useState('Comprehensive');
  const [includeTables, setIncludeTables] = useState(true);
  const [includeDiagrams, setIncludeDiagrams] = useState(true);
  const [includeClinicalNotes, setIncludeClinicalNotes] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [questionCount, setQuestionCount] = useState(10);
  const [extraInstructions, setExtraInstructions] = useState('');
  const [termDomain, setTermDomain] = useState('General medical and academic English');
  const [termCount, setTermCount] = useState('');
  const [termsOutputFormat, setTermsOutputFormat] = useState<TermsOutputFormat>('text');
  const [copied, setCopied] = useState(false);

  const parsedTermCount = useMemo(() => {
    const cleaned = normalizeDigits(termCount).trim();
    if (!/^\d+$/.test(cleaned)) return 0;
    const count = Number(cleaned);
    return Number.isSafeInteger(count) && count > 0 ? count : 0;
  }, [termCount]);

  const blocks = useMemo(() => isOpen ? loadMedicalBlocks() : [], [isOpen]);
  const subjects = useMemo(() => isOpen ? loadMedicalSubjects() : [], [isOpen]);
  const selectedBlock = blocks.find((item) => item.id === selectedBlockId);
  const availableSubjects = subjects.filter((item) => item.blockId === selectedBlockId);
  const selectedSubject = availableSubjects.find((item) => item.id === selectedSubjectId);
  const hierarchyReady = Boolean(selectedBlock && selectedSubject && topicTitleEn.trim());

  const topicId = 'tp-' + slugify(selectedSubjectId || selectedBlockId || 'topic') + '-' + slugify(topicTitleEn);
  const topicPrompt = useMemo(() => {
    if (!selectedBlock || !selectedSubject) return '';
    const requestedFeatures = [
      'Bilingual English-Arabic explanations throughout the topic.',
      'Preserve accurate standard medical terminology in English and explain it in clear Arabic.',
      'Organize the article into logical sections with concise headings and coherent progression.',
      'Include learning objectives, key concepts, mechanisms, clinical correlations, and a concise high-yield summary.',
      includeTables ? 'Include clinically useful comparison tables with explicit column headers and complete rows.' : '',
      includeDiagrams ? 'Include meaningful inline SVG diagrams or flowcharts. SVG must be valid, self-contained, responsive, and contain no external dependencies.' : '',
      includeClinicalNotes ? 'Include clinical pearls, red flags, common exam traps, and practical notes where relevant.' : '',
      includeQuestions ? 'Add ' + questionCount + ' validated assessment questions using supported UMEDT types. Each question must have a correct answer and explanations in English and Arabic.' : ''
    ].filter(Boolean);
    const topic = {
      id: topicId,
      blockId: selectedBlock.id,
      subjectId: selectedSubject.id,
      titleEn: topicTitleEn.trim(),
      titleAr: topicTitleAr.trim(),
      category: 'Medical',
      sections: [{
        id: 'sec-1',
        headingEn: 'Section title',
        headingAr: 'عنوان القسم',
        contentBlocks: [
          { id: 'cb-1', type: 'paragraph', order: 1, text: 'English explanation', textAr: 'الشرح العربي' },
          ...(includeTables ? [{ id: 'cb-2', type: 'table', order: 2, titleEn: 'Comparison', titleAr: 'مقارنة', tableHeaders: ['Feature', 'Finding'], tableRows: [['Example', 'Example finding']] }] : []),
          ...(includeClinicalNotes ? [{ id: 'cb-3', type: 'clinical_note', order: 3, titleEn: 'Clinical Pearl', titleAr: 'معلومة سريرية', text: '...', textAr: '...' }] : []),
          ...(includeDiagrams ? [{ id: 'cb-4', type: 'diagram', order: 4, titleEn: 'Mechanism', titleAr: 'الآلية', diagramSvg: '<svg viewBox="0 0 420 160" xmlns="http://www.w3.org/2000/svg">...</svg>' }] : [])
        ]
      }]
    };
    const questions = includeQuestions ? [{
      id: 'q-' + slugify(topicId) + '-1',
      type: 'single_choice',
      blockId: selectedBlock.id,
      subjectId: selectedSubject.id,
      topicId,
      difficulty: 'medium',
      questionEn: 'Clinical vignette and question?',
      questionAr: 'سؤال سريري؟',
      options: [{ key: 'A', textEn: 'Option A', textAr: 'الخيار أ' }, { key: 'B', textEn: 'Option B', textAr: 'الخيار ب' }],
      correctOptionKeys: ['A'],
      explanationEn: 'Why A is correct and B is incorrect.',
      explanationAr: 'لماذا الإجابة أ صحيحة ولماذا ب خاطئة.',
      linkedTermIds: []
    }] : [];
    return [
      'You are a medical educator and UMEDT content engineer. Generate one excellent, clinically accurate learning topic.',
      '',
      'LOCAL HIERARCHY — USE THESE EXISTING RECORDS ONLY:',
      JSON.stringify({
        block: { id: selectedBlock.id, code: selectedBlock.code, titleEn: selectedBlock.titleEn, titleAr: selectedBlock.titleAr },
        subject: { id: selectedSubject.id, blockId: selectedSubject.blockId, code: selectedSubject.code, titleEn: selectedSubject.titleEn, titleAr: selectedSubject.titleAr }
      }, null, 2),
      '',
      'TOPIC REQUEST:',
      JSON.stringify({ titleEn: topicTitleEn.trim(), titleAr: topicTitleAr.trim(), level: topicLevel, depth: topicDepth }, null, 2),
      '',
      'CONTENT REQUIREMENTS:',
      ...requestedFeatures.map((item) => '- ' + item),
      extraInstructions.trim() ? '- Additional instructions: ' + extraInstructions.trim() : '',
      '',
      'STRICT UMEDT IMPORT CONTRACT:',
      '- Return exactly one valid JSON object. No Markdown fences, preface, commentary, or trailing text.',
      '- The JSON root must contain "topics" and may contain "questions". Do not include "blocks" or "subjects" arrays.',
      '- Use the exact existing blockId and subjectId above. Never create, rename, infer, or modify a Block or Subject.',
      '- The topic must include id, blockId, subjectId, titleEn, titleAr, category, and sections[]. If titleAr is empty, generate a precise Arabic title instead of leaving it blank.',
      '- Every section must include id, headingEn, headingAr, and contentBlocks[].',
      '- Use only supported content block types: heading, paragraph, table, clinical_note, diagram, image, pdf_viewer, book_reference, exam_link, audio, video, video_link, attachment, question.',
      '- Put English in text and Arabic in textAr. Keep medical terms in standard English alongside accurate Arabic explanations.',
      '- If the user supplies a lecture PDF or text, use it as the primary source and preserve its teaching sequence where possible. Do not invent media URLs, books, references, citations, files, or checksums. Only include real, verified resources supplied by the user; otherwise omit them.',
      '- Every question must use a supported type, have valid options and correctOptionKeys, and include explanations in both languages.',
      '- Do not include dictionary terms in this topic package. UMEDT automatically links the global dictionary to topic text after import.',
      '- Preserve the exact selected hierarchy IDs.',
      '',
      'EXPECTED JSON SHAPE (illustrative fields; replace all placeholders with complete content):',
      JSON.stringify({ topics: [topic], ...(includeQuestions ? { questions } : {}) }, null, 2)
    ].filter(Boolean).join('\n');
  }, [selectedBlock, selectedSubject, topicTitleEn, topicTitleAr, topicLevel, topicDepth, includeTables, includeDiagrams, includeClinicalNotes, includeQuestions, questionCount, extraInstructions, topicId]);

  const termsPrompt = useMemo(() => {
    if (parsedTermCount <= 0 || !termDomain.trim()) return '';

    const sharedHeader = [
      'You are a bilingual medical and academic lexicographer preparing import-ready UMEDT dictionary records.',
      '',
      'Generate exactly ' + parsedTermCount + ' unique English terms for this domain: ' + termDomain.trim(),
      ''
    ];

    const sharedRules = [
      'QUALITY AND DEDUPLICATION RULES:',
      '- Do not repeat a term within the output. Normalize case, whitespace, hyphens, and apostrophes when checking duplicates.',
      '- Do not include blockId, subjectId, topicId, linkedBlockIds, linkedSubjectIds, linkedTopicIds, specialty, or collection-specific hierarchy fields.',
      '- Do not generate blocks, subjects, topics, sentences, questions, or any other record type.',
      '- Do not use generic translations, fabricated IPA, circular definitions, or placeholder examples.',
      '- Prefer established medical terminology and context-appropriate Arabic translations. If a term has multiple meanings, select the domain-appropriate meaning and explain it.'
    ];

    if (termsOutputFormat === 'text') {
      return [
        ...sharedHeader,
        'OUTPUT FORMAT — DIRECT PIPE-DELIMITED TEXT LINES (READY TO PASTE IN UMEDT):',
        '- Return ONLY plain text lines, one term per line. Do NOT return JSON, Markdown code fences, headers, numbering, or commentary.',
        '- Every line MUST start with TERM || and use exactly 9 pipe-separated columns in this order:',
        '  TERM || term || translation || pos || category || definitionAr || definitionEn || exampleEn || exampleAr',
        '- term: one English word or at most two English words; never a sentence.',
        '- translation: precise Arabic translation in the requested context.',
        '- pos: noun, verb, adjective, or phrase.',
        '- category: Medical, Academic, or General.',
        '- definitionAr: clear Arabic definition (must not contain ||).',
        '- definitionEn: concise, accurate English definition (must not contain ||).',
        '- exampleEn: natural, clinically or academically relevant English sentence.',
        '- exampleAr: accurate Arabic translation of that sentence.',
        '',
        ...sharedRules,
        '',
        'EXPECTED LINE EXAMPLE:',
        'TERM || Myocardial infarction || احتشاء عضلة القلب || noun || Medical || تلف وموت غير عكوس في خلايا عضلة القلب نتيجة نقص التروية لفترة كافية. || Irreversible injury and necrosis of cardiac muscle caused by prolonged ischemia. || Early reperfusion reduces myocardial damage after an acute infarction. || تقلل إعادة التروية المبكرة من تلف عضلة القلب بعد الاحتشاء الحاد.'
      ].join('\n');
    }

    const jsonRecordExample = JSON.stringify({
      terms: [
        {
          id: 'term-myocardial-infarction',
          term: 'Myocardial infarction',
          translation: 'احتشاء عضلة القلب',
          pronunciation: '/ˌmaɪ.oʊˈkɑːr.di.əl ɪnˈfɑːrk.ʃən/',
          definitionEn: 'Irreversible injury and necrosis of cardiac muscle caused by prolonged ischemia.',
          definitionAr: 'تلف وموت غير عكوس في خلايا عضلة القلب نتيجة نقص التروية لفترة كافية.',
          exampleEn: 'Early reperfusion reduces myocardial damage after an acute infarction.',
          exampleAr: 'تقلل إعادة التروية المبكرة من تلف عضلة القلب بعد الاحتشاء الحاد.',
          examples: [
            {
              en: 'Early reperfusion reduces myocardial damage after an acute infarction.',
              ar: 'تقلل إعادة التروية المبكرة من تلف عضلة القلب بعد الاحتشاء الحاد.'
            }
          ]
        }
      ]
    }, null, 2);

    const jsonFields = [
      'REQUIRED FIELDS FOR EVERY TERM:',
      '- id: stable unique ID such as term-acute-infarction',
      '- term: one English word or at most two English words; never a sentence',
      '- translation: precise Arabic translation in the requested context',
      '- pronunciation: accurate IPA pronunciation',
      '- definitionEn: concise, accurate English definition',
      '- definitionAr: clear Arabic definition',
      '- exampleEn: natural, clinically or academically relevant English sentence',
      '- exampleAr: accurate Arabic translation of that sentence',
      '- examples: [{ "en": "same English example", "ar": "same Arabic translation" }]',
      ''
    ];

    if (termsOutputFormat === 'zip') {
      return [
        ...sharedHeader,
        'OUTPUT FORMAT — DOWNLOADABLE ZIP ARCHIVE (.zip) FOR UMEDT:',
        '- Package all generated terms into a valid UTF-8 JSON file named terms.json inside a downloadable .zip archive named umedt-terms.zip.',
        '- Inside terms.json, the root MUST be a single valid JSON object with a single "terms" array.',
        '- Do not include executable files, scripts, SQLite files, or extra folders inside the .zip archive.',
        '- If your environment can create downloadable files, generate and provide the downloadable umedt-terms.zip file directly. Otherwise, output the exact valid terms.json content ready to save and compress into .zip.',
        '',
        ...jsonFields,
        ...sharedRules,
        '',
        'EXPECTED terms.json STRUCTURE INSIDE THE .zip ARCHIVE:',
        jsonRecordExample
      ].join('\n');
    }

    return [
      ...sharedHeader,
      'OUTPUT FORMAT — DOWNLOADABLE OR COPYABLE JSON FILE (.json) FOR UMEDT:',
      '- Return exactly one valid UTF-8 JSON object with a single "terms" array (ready to save as umedt-terms.json and import into UMEDT).',
      '- No Markdown fences, preface, commentary, or trailing text.',
      '',
      ...jsonFields,
      ...sharedRules,
      '',
      'EXPECTED JSON FILE STRUCTURE:',
      jsonRecordExample
    ].join('\n');
  }, [parsedTermCount, termDomain, termsOutputFormat]);

  const generatedPrompt = mode === 'topic' ? topicPrompt : termsPrompt;
  const promptReady = mode === 'topic' ? hierarchyReady : termDomain.trim().length > 0 && parsedTermCount > 0;

  const copyPrompt = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedPrompt);
      } else {
        const element = document.createElement('textarea');
        element.value = generatedPrompt;
        document.body.appendChild(element);
        element.select();
        document.execCommand('copy');
        document.body.removeChild(element);
      }
      setCopied(true);
      showToast?.('تم نسخ البرومبت', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast?.('تعذر نسخ البرومبت تلقائياً', 'error');
    }
  };

  const downloadPrompt = () => {
    const blob = new Blob([generatedPrompt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = mode === 'topic'
      ? 'UMEDT_Topic_Prompt_' + slugify(topicTitleEn) + '.txt'
      : 'UMEDT_Global_Terms_Prompt_' + termsOutputFormat.toUpperCase() + '.txt';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    showToast?.('تم تنزيل ملف البرومبت', 'success');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <section className="w-full max-w-3xl max-h-[92dvh] flex flex-col rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <header className="px-4 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h2 className="font-extrabold text-slate-900 dark:text-white">مركز توليد محتوى UMEDT</h2>
              <p className="text-xs text-slate-500">مساران فقط · موضوع تعليمي أو قاموس مصطلحات</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-3 sm:p-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
            <button type="button" onClick={() => setMode('topic')} className={'rounded-xl px-3 py-3 text-sm font-extrabold flex items-center justify-center gap-2 ' + (mode === 'topic' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-300')}>
              <BookOpen className="w-4 h-4" /> توليد موضوع
            </button>
            <button type="button" onClick={() => setMode('terms')} className={'rounded-xl px-3 py-3 text-sm font-extrabold flex items-center justify-center gap-2 ' + (mode === 'terms' ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-300')}>
              <Languages className="w-4 h-4" /> توليد مصطلحات
            </button>
          </div>

          {mode === 'topic' ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-3">
                <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-600" /><h3 className="text-sm font-extrabold">الموقع التعليمي المحلي</h3></div>
                <p className="text-xs text-slate-500">اختر البلوك والمادة الموجودين مسبقاً في التطبيق. هذه البوابة لا تنشئهما ولا تعدلهما.</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold">البلوك</span>
                    <select value={selectedBlockId} onChange={(event) => { setSelectedBlockId(event.target.value); setSelectedSubjectId(''); }} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm">
                      <option value="">اختر بلوكاً محفوظاً</option>
                      {blocks.map((block) => <option key={block.id} value={block.id}>{block.code} — {block.titleAr || block.titleEn}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold">المادة</span>
                    <select value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)} disabled={!selectedBlockId} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm disabled:opacity-50">
                      <option value="">اختر مادة تابعة للبلوك</option>
                      {availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} — {subject.titleAr || subject.titleEn}</option>)}
                    </select>
                  </label>
                </div>
                {blocks.length === 0 ? <p className="text-xs text-amber-600">لا توجد بلوكات محلية. أنشئ البلوك والمادة من إدارة البلوكات والمواد أولاً.</p> : null}
                {selectedBlockId && availableSubjects.length === 0 ? <p className="text-xs text-amber-600">لا توجد مادة تابعة لهذا البلوك. أضف المادة محلياً أولاً.</p> : null}
                {selectedSubject ? <p className="text-[11px] text-emerald-700 dark:text-emerald-300">سيُستخدم المعرّفان المحليان: {selectedBlock?.id} / {selectedSubject.id}</p> : null}
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-3">
                <h3 className="text-sm font-extrabold">بيانات الموضوع</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label className="space-y-1 block"><span className="text-xs font-bold">عنوان الموضوع بالإنجليزية *</span><input value={topicTitleEn} onChange={(event) => setTopicTitleEn(event.target.value)} placeholder="e.g. Acute Coronary Syndrome" className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm" dir="auto" /></label>
                  <label className="space-y-1 block"><span className="text-xs font-bold">عنوان الموضوع بالعربية</span><input value={topicTitleAr} onChange={(event) => setTopicTitleAr(event.target.value)} placeholder="المتلازمة التاجية الحادة" className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm" dir="auto" /></label>
                  <label className="space-y-1 block"><span className="text-xs font-bold">المستوى العلمي</span><select value={topicLevel} onChange={(event) => setTopicLevel(event.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"><option>Basic medical student</option><option>Intermediate medical student</option><option>Advanced medical student</option><option>Clinical / Internship level</option></select></label>
                  <label className="space-y-1 block"><span className="text-xs font-bold">عمق الشرح</span><select value={topicDepth} onChange={(event) => setTopicDepth(event.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm"><option>Concise</option><option>Comprehensive</option><option>Detailed</option></select></label>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'جداول مقارنة', value: includeTables, set: setIncludeTables },
                    { label: 'رسوم SVG', value: includeDiagrams, set: setIncludeDiagrams },
                    { label: 'ملاحظات سريرية', value: includeClinicalNotes, set: setIncludeClinicalNotes },
                    { label: 'أسئلة MCQ', value: includeQuestions, set: setIncludeQuestions }
                  ].map((option) => <label key={option.label} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-950 px-2.5 py-2 text-xs font-bold"><input type="checkbox" checked={option.value} onChange={(event) => option.set(event.target.checked)} />{option.label}</label>)}
                </div>
                {includeQuestions ? <label className="flex items-center gap-2 text-xs"><span>عدد الأسئلة</span><input type="number" min={1} max={100} value={questionCount} onChange={(event) => setQuestionCount(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} className="w-24 min-h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2" /></label> : null}
                <label className="space-y-1 block"><span className="text-xs font-bold">تعليمات إضافية (اختياري)</span><textarea rows={3} value={extraInstructions} onChange={(event) => setExtraInstructions(event.target.value)} placeholder="مثلاً: اتبع ترتيب المحاضرة المرفقة، وركّز على نقاط الامتحان..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-3 text-sm" /></label>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-3">
              <h3 className="text-sm font-extrabold">قاموس المصطلحات العام</h3>
              <p className="text-xs text-slate-500">هذا المسار مستقل عن أي بلوك أو مادة أو موضوع. ستُستورد المصطلحات إلى القاموس المحلي، ويمكن ربطها تلقائياً بنصوص المواضيع.</p>
              <label className="space-y-1 block"><span className="text-xs font-bold">مجال المصطلحات (وصف حر وليس ارتباطاً هرمياً)</span><input value={termDomain} onChange={(event) => setTermDomain(event.target.value)} className="w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm" /></label>
              <label className="space-y-1 block">
                <span className="text-xs font-bold">عدد المصطلحات</span>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={termCount}
                  onChange={(event) => {
                    const normalized = normalizeDigits(event.target.value).replace(/[^\d]/g, '');
                    setTermCount(normalized);
                  }}
                  placeholder="أدخل العدد المطلوب"
                  className="w-44 min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 text-sm text-left"
                />
              </label>

              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">صيغة توليد المصطلحات المطلوبة</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">نصوص مباشرة + صيغتا ملفات فقط (.json و .zip)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    {
                      id: 'text' as TermsOutputFormat,
                      label: 'نصوص (للصق المباشر)',
                      sub: 'أسطر TERM || جاهزة للنسخ واللصق',
                      icon: FileText
                    },
                    {
                      id: 'json' as TermsOutputFormat,
                      label: 'ملف JSON (.json)',
                      sub: 'ملف بيانات منظم للاستيراد',
                      icon: FileJson
                    },
                    {
                      id: 'zip' as TermsOutputFormat,
                      label: 'ملف ZIP (.zip)',
                      sub: 'أرشيف مضغوط يحتوي terms.json',
                      icon: FileArchive
                    }
                  ].map((opt) => {
                    const IconComp = opt.icon;
                    const active = termsOutputFormat === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTermsOutputFormat(opt.id)}
                        className={
                          'rounded-xl border p-2.5 text-right transition-all flex items-start gap-2.5 ' +
                          (active
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 shadow-xs'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500/40')
                        }
                      >
                        <span className={'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' + (active ? 'bg-emerald-600 text-white' : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300')}>
                          <IconComp className="w-4 h-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-extrabold">{opt.label}</span>
                          <span className="block text-[10px] opacity-80 mt-0.5 leading-snug">{opt.sub}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 text-xs text-slate-600 dark:text-slate-300">كل سجل يحتوي على: المصطلح، الترجمة، التعريف باللغتين، ومثال باللغتين. التكرارات تُدمج أو تُتجاوز عند الاستيراد.</div>
            </div>
          )}

          <section className="rounded-2xl bg-slate-950 text-slate-100 p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div><div className="text-sm font-extrabold">{mode === 'topic' ? 'البرومبت النهائي للموضوع' : 'البرومبت النهائي للمصطلحات'}</div><p className="text-[11px] text-slate-400">جاهز للنسخ إلى ChatGPT أو Gemini أو أي نموذج آخر</p></div>
              <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-300 px-2.5 py-1">
                {mode === 'topic'
                  ? 'TOPIC JSON'
                  : termsOutputFormat === 'text'
                  ? 'TERMS TEXT'
                  : termsOutputFormat === 'zip'
                  ? 'TERMS ZIP'
                  : 'GLOBAL TERMS JSON'}
              </span>
            </div>
            <pre dir={promptReady ? 'ltr' : 'rtl'} className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-900 p-3 text-[11px] leading-relaxed text-emerald-100">{promptReady ? generatedPrompt : mode === 'topic' ? 'أكمل اختيار البلوك والمادة وعنوان الموضوع لعرض البرومبت النهائي.' : 'أدخل مجال المصطلحات وعدد المصطلحات المطلوب لعرض البرومبت النهائي.'}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!promptReady} onClick={() => void copyPrompt()} className="min-h-10 rounded-xl bg-emerald-600 px-4 text-xs font-extrabold text-white disabled:opacity-40 flex items-center gap-2">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'تم النسخ' : 'نسخ البرومبت'}</button>
              <button type="button" disabled={!promptReady} onClick={downloadPrompt} className="min-h-10 rounded-xl bg-slate-800 px-4 text-xs font-extrabold text-white disabled:opacity-40 flex items-center gap-2"><Download className="w-4 h-4" />تنزيل TXT</button>
            </div>
          </section>

          <div className="rounded-xl bg-sky-500/5 border border-sky-500/20 p-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {mode === 'terms' && termsOutputFormat === 'text'
                ? 'بعد توليد الأسطر النصية من الذكاء الاصطناعي، انسخها والصقها مباشرة داخل التطبيق.'
                : 'بعد أن ينتج الذكاء الاصطناعي النصوص أو ملف JSON / ZIP، استورده محلياً من التطبيق.'}
            </p>
            <div className="flex gap-2">
              {onOpenPasteModal ? <button type="button" onClick={() => { onClose(); onOpenPasteModal(mode === 'topic' ? 'topics' : 'terms'); }} className="min-h-9 px-3 rounded-lg bg-sky-600 text-white text-xs font-bold">لصق النص</button> : null}
              {onOpenUploadModal ? <button type="button" onClick={() => { onClose(); onOpenUploadModal(mode === 'topic' ? 'topics' : 'terms'); }} className="min-h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-bold flex items-center gap-1"><Upload className="w-3.5 h-3.5" />رفع ملف (.json / .zip)</button> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
