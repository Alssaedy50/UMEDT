import React, { useState, useRef } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Type,
  AlignLeft,
  Table as TableIcon,
  Image as ImageIcon,
  Video,
  Mic,
  Paperclip,
  HelpCircle,
  AlertCircle,
  ExternalLink,
  Download,
  Upload,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import {
  TopicContentBlock,
  ContentBlockType,
  UnifiedQuizQuestion
} from '../types/lexicon';
import { VoiceRecorderBlock } from './VoiceRecorderBlock';
import {
  saveLocalMediaRecord,
  formatBytesLabel
} from '../services/mediaStorageService';
import { executeVerifiedExportDownload } from '../services/exportDownloadService';

const CONTENT_BLOCK_TYPE_META: Record<
  ContentBlockType,
  {
    labelEn: string;
    labelAr: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  heading: {
    labelEn: 'Heading / Subheading',
    labelAr: 'عنوان فرعي أكاديمي',
    icon: Type
  },
  paragraph: {
    labelEn: 'Paragraph Explanation',
    labelAr: 'فقرة شرح علمي',
    icon: AlignLeft
  },
  table: {
    labelEn: 'Comparison Table',
    labelAr: 'جدول مقارنة طبي',
    icon: TableIcon
  },
  image: {
    labelEn: 'Image / Diagram',
    labelAr: 'صورة أو مخطط توضيحي',
    icon: ImageIcon
  },
  video_link: {
    labelEn: 'Video / Reference Link',
    labelAr: 'فيديو أو رابط مرجعي',
    icon: Video
  },
  audio: {
    labelEn: 'Audio / Voice Recording',
    labelAr: 'صوت أو تسجيل ميكروفون',
    icon: Mic
  },
  attachment: {
    labelEn: 'File / PDF Attachment',
    labelAr: 'ملف PDF أو مستند مرفق',
    icon: Paperclip
  },
  question: {
    labelEn: 'Inline Interactive Question',
    labelAr: 'سؤال تفاعلي مدمج بالشرح',
    icon: HelpCircle
  },
  clinical_note: {
    labelEn: 'Clinical Correlation / High-Yield Note',
    labelAr: 'ملاحظة سريرية أو تنبيه امتحاني',
    icon: AlertCircle
  }
};

// ============================================================================
// 1. INLINE READER COMPONENT (Renders ContentBlocks in exact pedagogical order)
// ============================================================================

interface SectionContentBlocksRendererProps {
  topicId: string;
  sectionId: string;
  blocks: TopicContentBlock[];
  showToast: (msg: string, type?: string) => void;
}

export const SectionContentBlocksRenderer: React.FC<
  SectionContentBlocksRendererProps
> = ({ topicId, sectionId, blocks, showToast }) => {
  const [inlineQuizAnswers, setInlineQuizAnswers] = useState<
    Record<string, string>
  >({});

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  const handleDownloadInlineAttachment = async (blk: TopicContentBlock) => {
    const fileName = blk.mediaFileName || blk.titleEn || 'Attachment.txt';
    const contentOrUrl = blk.mediaUrl || blk.text || '';
    if (!contentOrUrl) {
      showToast('الملف المرفق فارغ', 'info');
      return;
    }

    if (contentOrUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = contentOrUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`تم تنزيل الملف المرفق "${fileName}" بنجاح`);
      return;
    }

    await executeVerifiedExportDownload({
      fileName,
      content: contentOrUrl,
      format: 'json',
      recordsCount: 1,
      deliveryMode: 'download',
      titleAr: fileName
    });
    showToast(`تم تنزيل المرفق "${fileName}"`);
  };

  return (
    <div className="space-y-4">
      {sortedBlocks.map((blk) => {
        if (blk.type === 'heading') {
          return (
            <div key={blk.id} className="pt-2 space-y-0.5">
              <h3
                dir="ltr"
                className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white text-left"
              >
                {blk.titleEn || blk.text}
              </h3>
              {blk.titleAr && blk.titleAr !== blk.titleEn && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {blk.titleAr}
                </p>
              )}
            </div>
          );
        }

        if (blk.type === 'paragraph') {
          return (
            <div key={blk.id} className="space-y-1.5">
              {blk.text && (
                <p
                  dir="auto"
                  className="text-sm sm:text-[15px] leading-[1.85] text-slate-800 dark:text-slate-200 whitespace-pre-line"
                >
                  {blk.text}
                </p>
              )}
              {blk.textAr && blk.textAr !== blk.text && (
                <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-line">
                  {blk.textAr}
                </p>
              )}
            </div>
          );
        }

        if (blk.type === 'clinical_note') {
          return (
            <div
              key={blk.id}
              className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-2 text-xs font-extrabold text-amber-800 dark:text-amber-300">
                <span dir="ltr">{blk.titleEn || 'Clinical Correlation & High-Yield Note'}</span>
                <span>{blk.titleAr || 'ملاحظة سريرية هامة'}</span>
              </div>
              <p
                dir="auto"
                className="text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-line"
              >
                {blk.text}
              </p>
            </div>
          );
        }

        if (blk.type === 'table') {
          const headers = blk.tableHeaders || [];
          const rows = blk.tableRows || [];
          return (
            <div
              key={blk.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900"
            >
              {(blk.titleEn || blk.titleAr) && (
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span dir="ltr" className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {blk.titleEn}
                  </span>
                  {blk.titleAr && (
                    <span className="text-xs text-slate-500">{blk.titleAr}</span>
                  )}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse" dir="ltr">
                  {headers.length > 0 && (
                    <thead>
                      <tr className="bg-slate-100/80 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                        {headers.map((h, hIdx) => (
                          <th
                            key={hIdx}
                            className="p-3 font-extrabold text-slate-800 dark:text-slate-200"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-950/50"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            dir="auto"
                            className="p-3 text-slate-700 dark:text-slate-300 align-top"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        }

        if (blk.type === 'image' && blk.mediaUrl) {
          return (
            <figure
              key={blk.id}
              className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 my-2"
            >
              <img
                src={blk.mediaUrl}
                alt={blk.captionEn || blk.captionAr || 'Medical diagram'}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                }}
                className="w-full max-h-[420px] object-contain mx-auto bg-slate-950"
              />
              {(blk.captionEn || blk.captionAr) && (
                <figcaption className="p-3 bg-slate-900 text-slate-200 text-xs leading-relaxed text-center">
                  {blk.captionEn || blk.captionAr}
                </figcaption>
              )}
            </figure>
          );
        }

        if (blk.type === 'video_link' && blk.externalUrl) {
          return (
            <a
              key={blk.id}
              href={blk.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="min-w-0">
                <p
                  dir="ltr"
                  className="text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-400 truncate text-left"
                >
                  {blk.titleEn || blk.externalUrl}
                </p>
                {(blk.titleAr || blk.text) && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {blk.titleAr || blk.text}
                  </p>
                )}
              </div>
              <ExternalLink className="w-4 h-4 text-emerald-500 shrink-0" />
            </a>
          );
        }

        if (blk.type === 'audio') {
          return (
            <VoiceRecorderBlock
              key={blk.id}
              topicId={topicId}
              sectionId={sectionId}
              blockId={blk.id}
              initialAudioUrl={blk.mediaUrl}
              initialMediaIdbKey={blk.mediaIdbKey}
              initialDurationSeconds={blk.mediaDurationSeconds}
              initialTitleEn={blk.titleEn}
              initialTitleAr={blk.titleAr}
              readOnly={true}
              showToast={showToast}
            />
          );
        }

        if (blk.type === 'attachment') {
          return (
            <div
              key={blk.id}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Paperclip className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p
                    dir="ltr"
                    className="text-xs font-extrabold text-slate-900 dark:text-white truncate text-left"
                  >
                    {blk.mediaFileName || blk.titleEn || 'Attached Medical Document'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {blk.mediaMimeType || blk.titleAr || 'Document'} ·{' '}
                    {blk.mediaSizeBytes
                      ? formatBytesLabel(blk.mediaSizeBytes)
                      : blk.text || 'Local Attachment'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleDownloadInlineAttachment(blk)}
                className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>تنزيل / فتح</span>
              </button>
            </div>
          );
        }

        if (blk.type === 'question' && blk.inlineQuestion) {
          const iq = blk.inlineQuestion;
          const chosenKey = inlineQuizAnswers[blk.id] || '';
          const isCorrect =
            chosenKey && iq.correctOptionKeys.includes(chosenKey.toUpperCase());

          return (
            <div
              key={blk.id}
              className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/30 space-y-3"
            >
              <div className="flex items-center justify-between text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                <span dir="ltr">Inline Self-Check Question</span>
                <span>سؤال تحقق ذاتي مدمج بالشرح</span>
              </div>
              <p
                dir="ltr"
                className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white text-left"
              >
                {iq.questionEn}
              </p>
              <div className="space-y-1.5">
                {iq.options.map((opt) => {
                  const selected = chosenKey === opt.key;
                  const right = iq.correctOptionKeys.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() =>
                        setInlineQuizAnswers((prev) => ({
                          ...prev,
                          [blk.id]: opt.key
                        }))
                      }
                      className={`w-full min-h-[42px] px-3 py-2 rounded-xl border text-left text-xs font-bold flex items-center justify-between ${
                        chosenKey
                          ? right
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                            : selected
                              ? 'bg-rose-500/15 border-rose-500 text-rose-900 dark:text-rose-200'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-500'
                      }`}
                    >
                      <span dir="ltr">
                        {opt.key}) {opt.textEn}
                      </span>
                      {chosenKey && right && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      )}
                      {chosenKey && selected && !right && (
                        <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
              {chosenKey && (
                <p
                  dir="ltr"
                  className={`text-xs p-2.5 rounded-xl ${
                    isCorrect
                      ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : 'bg-rose-500/10 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  {iq.explanationEn}
                </p>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

// ============================================================================
// 2. REORDERABLE CONTENT BLOCKS EDITOR (Supports all 9 ContentBlock types)
// ============================================================================

interface SectionContentBlocksEditorProps {
  topicId?: string;
  sectionId: string;
  blocks: TopicContentBlock[];
  onChangeBlocks: (nextBlocks: TopicContentBlock[]) => void;
  showToast: (msg: string, type?: string) => void;
}

export const SectionContentBlocksEditor: React.FC<
  SectionContentBlocksEditorProps
> = ({ topicId, sectionId, blocks, onChangeBlocks, showToast }) => {
  const [showAddBlockPicker, setShowAddBlockPicker] = useState<boolean>(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [activeUploadBlockId, setActiveUploadBlockId] = useState<string | null>(
    null
  );

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  const updateBlockById = (
    blockId: string,
    patch: Partial<TopicContentBlock>
  ) => {
    const updated = sortedBlocks.map((b) =>
      b.id === blockId ? { ...b, ...patch } : b
    );
    onChangeBlocks(updated);
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= sortedBlocks.length) return;
    const copy = [...sortedBlocks];
    const [removed] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, removed);
    const reordered = copy.map((b, i) => ({ ...b, order: i + 1 }));
    onChangeBlocks(reordered);
  };

  const deleteBlock = (blockId: string) => {
    const filtered = sortedBlocks
      .filter((b) => b.id !== blockId)
      .map((b, i) => ({ ...b, order: i + 1 }));
    onChangeBlocks(filtered);
  };

  const addNewContentBlock = (type: ContentBlockType) => {
    const newId = `cblk-${sectionId}-${Date.now()}`;
    const nextOrder = sortedBlocks.length + 1;
    let newBlock: TopicContentBlock = {
      id: newId,
      type,
      order: nextOrder
    };

    if (type === 'heading') {
      newBlock = {
        ...newBlock,
        titleEn: 'New Academic Subheading',
        titleAr: 'عنوان فرعي جديد'
      };
    } else if (type === 'paragraph') {
      newBlock = {
        ...newBlock,
        text: ''
      };
    } else if (type === 'clinical_note') {
      newBlock = {
        ...newBlock,
        titleEn: 'Clinical Correlation & High-Yield Note',
        titleAr: 'ملاحظة سريرية وامتحانية هامة',
        text: '',
        noteSeverity: 'high-yield'
      };
    } else if (type === 'table') {
      newBlock = {
        ...newBlock,
        titleEn: 'Diagnostic Comparison Table',
        titleAr: 'جدول مقارنة تشخيصي',
        tableHeaders: ['Feature / Parameter', 'Condition A', 'Condition B'],
        tableRows: [
          ['Key Morphology', '', ''],
          ['Diagnostic Test', '', '']
        ]
      };
    } else if (type === 'image') {
      newBlock = {
        ...newBlock,
        mediaUrl: '',
        captionEn: '',
        captionAr: ''
      };
    } else if (type === 'video_link') {
      newBlock = {
        ...newBlock,
        titleEn: '',
        titleAr: '',
        externalUrl: ''
      };
    } else if (type === 'audio') {
      newBlock = {
        ...newBlock,
        titleEn: 'Clinical Audio / Voice Recording',
        titleAr: 'تسجيل صوتي للشرح الطبي',
        mediaUrl: ''
      };
    } else if (type === 'attachment') {
      newBlock = {
        ...newBlock,
        titleEn: '',
        mediaFileName: '',
        mediaUrl: ''
      };
    } else if (type === 'question') {
      const inlineQ: UnifiedQuizQuestion = {
        id: `inl-q-${Date.now()}`,
        type: 'single_choice',
        questionEn: '',
        options: [
          { key: 'A', textEn: '' },
          { key: 'B', textEn: '' },
          { key: 'C', textEn: '' },
          { key: 'D', textEn: '' }
        ],
        correctOptionKeys: ['A'],
        explanationEn: '',
        linkedTermIds: [],
        createdAt: new Date().toISOString()
      };
      newBlock = {
        ...newBlock,
        inlineQuestion: inlineQ
      };
    }

    onChangeBlocks([...sortedBlocks, newBlock]);
    setShowAddBlockPicker(false);
  };

  const handleUploadInlineImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadBlockId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const idbKey = `img-${activeUploadBlockId}-${Date.now()}`;
      const saved = await saveLocalMediaRecord({
        id: idbKey,
        topicId,
        sectionId,
        blockId: activeUploadBlockId,
        mediaType: 'image',
        fileName: file.name,
        mimeType: file.type || 'image/png',
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      });
      if (!saved.success) {
        showToast(saved.errorAr || 'حجم الصورة كبير جداً', 'info');
        return;
      }
      updateBlockById(activeUploadBlockId, {
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaFileName: file.name,
        mediaSizeBytes: file.size,
        captionEn: file.name.replace(/\.[^/.]+$/, '')
      });
      showToast(`تم إدراج الصورة "${file.name}" في موضعها داخل الشرح`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUploadInlineAttachment = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadBlockId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const idbKey = `att-${activeUploadBlockId}-${Date.now()}`;
      const saved = await saveLocalMediaRecord({
        id: idbKey,
        topicId,
        sectionId,
        blockId: activeUploadBlockId,
        mediaType: 'pdf_document',
        fileName: file.name,
        mimeType: file.type || 'application/pdf',
        sizeBytes: file.size,
        dataUrl,
        createdAt: new Date().toISOString()
      });
      if (!saved.success) {
        showToast(saved.errorAr || 'حجم الملف يتجاوز الحد الآمن', 'info');
        return;
      }
      updateBlockById(activeUploadBlockId, {
        mediaUrl: dataUrl,
        mediaIdbKey: idbKey,
        mediaFileName: file.name,
        mediaMimeType: file.type || 'application/pdf',
        mediaSizeBytes: file.size,
        titleEn: file.name,
        text: formatBytesLabel(file.size)
      });
      showToast(`تم إرفاق الملف "${file.name}" (${formatBytesLabel(file.size)}) في هذا القسم`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-3">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleUploadInlineImage}
        className="hidden"
      />
      <input
        ref={attachmentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,.json,.csv,application/pdf"
        onChange={handleUploadInlineAttachment}
        className="hidden"
      />

      {sortedBlocks.map((blk, idx) => {
        const meta = CONTENT_BLOCK_TYPE_META[blk.type];
        const IconComp = meta.icon;

        return (
          <div
            key={blk.id}
            className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5"
          >
            {/* Block Header & Reorder Controls */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700 dark:text-slate-300">
                <IconComp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  #{idx + 1} · {meta.labelEn} ({meta.labelAr})
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveBlock(idx, 'up')}
                  className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-30 flex items-center justify-center"
                  title="نقل للأعلى"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === sortedBlocks.length - 1}
                  onClick={() => moveBlock(idx, 'down')}
                  className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-30 flex items-center justify-center"
                  title="نقل للأسفل"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteBlock(blk.id)}
                  className="min-h-[34px] min-w-[34px] rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center"
                  title="حذف هذه الكتلة"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Type-Specific Editor Fields */}
            {blk.type === 'heading' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  dir="ltr"
                  value={blk.titleEn || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { titleEn: e.target.value })
                  }
                  placeholder="English Subheading (Primary)..."
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                />
                <input
                  type="text"
                  value={blk.titleAr || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { titleAr: e.target.value })
                  }
                  placeholder="الترجمة العربية للعنوان الفرعي..."
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {(blk.type === 'paragraph' || blk.type === 'clinical_note') && (
              <div className="space-y-2">
                {blk.type === 'clinical_note' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      value={blk.titleEn || ''}
                      onChange={(e) =>
                        updateBlockById(blk.id, { titleEn: e.target.value })
                      }
                      placeholder="Clinical Note Title (EN)..."
                      className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                    />
                    <input
                      type="text"
                      value={blk.titleAr || ''}
                      onChange={(e) =>
                        updateBlockById(blk.id, { titleAr: e.target.value })
                      }
                      placeholder="عنوان الملاحظة السريرية (عربي)..."
                      className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                )}
                <textarea
                  rows={4}
                  dir="auto"
                  value={blk.text || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { text: e.target.value })
                  }
                  placeholder="اكتب الشرح العلمي هنا (المصطلحات الإنجليزية ستُربط تلقائياً بالقاموس)..."
                  className="w-full p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed"
                />
              </div>
            )}

            {blk.type === 'table' && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.titleEn || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { titleEn: e.target.value })
                    }
                    placeholder="Table Title (English)..."
                    className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                  />
                  <input
                    type="text"
                    value={blk.titleAr || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { titleAr: e.target.value })
                    }
                    placeholder="عنوان الجدول بالعربية..."
                    className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block">
                    عناوين الأعمدة (افصل بين الأعمدة بعلامة | ):
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={(blk.tableHeaders || []).join(' | ')}
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        tableHeaders: e.target.value.split('|').map((s) => s.trim())
                      })
                    }
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 block">
                    صفوف الجدول (كل سطر يمثل صفاً، وافصل الخلايا بعلامة | ):
                  </label>
                  <textarea
                    rows={4}
                    dir="ltr"
                    value={(blk.tableRows || [])
                      .map((r) => r.join(' | '))
                      .join('\n')}
                    onChange={(e) =>
                      updateBlockById(blk.id, {
                        tableRows: e.target.value
                          .split('\n')
                          .map((line) => line.split('|').map((c) => c.trim()))
                      })
                    }
                    className="w-full p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {blk.type === 'image' && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUploadBlockId(blk.id);
                      imageInputRef.current?.click();
                    }}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع صورة من الجهاز</span>
                  </button>
                  <input
                    type="text"
                    dir="ltr"
                    value={blk.mediaUrl || ''}
                    onChange={(e) =>
                      updateBlockById(blk.id, { mediaUrl: e.target.value })
                    }
                    placeholder="أو الصق رابط الصورة المباشر (https://...)"
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                  />
                </div>
                <input
                  type="text"
                  dir="auto"
                  value={blk.captionEn || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      captionEn: e.target.value,
                      captionAr: e.target.value
                    })
                  }
                  placeholder="وصف الشكل أو الصورة التوضيحية..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                {blk.mediaUrl && (
                  <img
                    src={blk.mediaUrl}
                    alt={blk.captionEn || 'Preview'}
                    referrerPolicy="no-referrer"
                    className="max-h-40 rounded-xl object-contain border border-slate-200 dark:border-slate-800"
                  />
                )}
              </div>
            )}

            {blk.type === 'video_link' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  dir="ltr"
                  value={blk.titleEn || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { titleEn: e.target.value })
                  }
                  placeholder="Link / Video Title (EN)..."
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                />
                <input
                  type="url"
                  dir="ltr"
                  value={blk.externalUrl || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, { externalUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
                <input
                  type="text"
                  value={blk.titleAr || ''}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      titleAr: e.target.value,
                      text: e.target.value
                    })
                  }
                  placeholder="وصف مختصر بالعربية..."
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}

            {blk.type === 'audio' && (
              <VoiceRecorderBlock
                topicId={topicId}
                sectionId={sectionId}
                blockId={blk.id}
                initialAudioUrl={blk.mediaUrl}
                initialMediaIdbKey={blk.mediaIdbKey}
                initialDurationSeconds={blk.mediaDurationSeconds}
                initialTitleEn={blk.titleEn}
                initialTitleAr={blk.titleAr}
                readOnly={false}
                onChange={(updated) => updateBlockById(blk.id, updated)}
                showToast={showToast}
              />
            )}

            {blk.type === 'attachment' && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveUploadBlockId(blk.id);
                    attachmentInputRef.current?.click();
                  }}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>رفع ملف PDF أو مستند من الجهاز</span>
                </button>
                {blk.mediaFileName && (
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    تم إرفاق: {blk.mediaFileName} ({blk.text})
                  </span>
                )}
              </div>
            )}

            {blk.type === 'question' && blk.inlineQuestion && (
              <div className="space-y-2">
                <input
                  type="text"
                  dir="ltr"
                  value={blk.inlineQuestion.questionEn}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      inlineQuestion: {
                        ...blk.inlineQuestion!,
                        questionEn: e.target.value
                      }
                    })
                  }
                  placeholder="Inline Question Stem (English)..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {blk.inlineQuestion.options.map((opt, oIdx) => {
                    const isRight = blk.inlineQuestion!.correctOptionKeys.includes(
                      opt.key
                    );
                    return (
                      <div key={opt.key} className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateBlockById(blk.id, {
                              inlineQuestion: {
                                ...blk.inlineQuestion!,
                                correctOptionKeys: [opt.key]
                              }
                            })
                          }
                          className={`min-h-[36px] min-w-[36px] rounded-lg font-mono text-xs font-bold border ${
                            isRight
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {opt.key}
                        </button>
                        <input
                          type="text"
                          dir="ltr"
                          value={opt.textEn}
                          onChange={(e) => {
                            const val = e.target.value;
                            const nextOpts = blk.inlineQuestion!.options.map(
                              (item, i) =>
                                i === oIdx ? { ...item, textEn: val } : item
                            );
                            updateBlockById(blk.id, {
                              inlineQuestion: {
                                ...blk.inlineQuestion!,
                                options: nextOpts
                              }
                            });
                          }}
                          placeholder={`Option ${opt.key}...`}
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={blk.inlineQuestion.explanationEn}
                  onChange={(e) =>
                    updateBlockById(blk.id, {
                      inlineQuestion: {
                        ...blk.inlineQuestion!,
                        explanationEn: e.target.value
                      }
                    })
                  }
                  placeholder="Explanation of the correct answer..."
                  className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add Content Block Trigger & Bottom Sheet Picker */}
      <div className="pt-1">
        {!showAddBlockPicker ? (
          <button
            type="button"
            onClick={() => setShowAddBlockPicker(true)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-dashed border-emerald-500/50 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-extrabold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة عنصر محتوى جديد في هذا القسم (صورة، جدول، صوت، PDF، سؤال...)</span>
          </button>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold">
                اختر نوع العنصر لإدراجه في هذا الموضع:
              </span>
              <button
                type="button"
                onClick={() => setShowAddBlockPicker(false)}
                className="text-xs text-slate-500 font-bold"
              >
                إغلاق
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(CONTENT_BLOCK_TYPE_META) as ContentBlockType[]).map(
                (bType) => {
                  const meta = CONTENT_BLOCK_TYPE_META[bType];
                  const IconComp = meta.icon;
                  return (
                    <button
                      key={bType}
                      type="button"
                      onClick={() => addNewContentBlock(bType)}
                      className="min-h-[48px] p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-right flex items-center gap-2 transition-colors"
                    >
                      <IconComp className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate">
                          {meta.labelAr}
                        </p>
                        <p dir="ltr" className="text-[10px] text-slate-500 truncate">
                          {meta.labelEn}
                        </p>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
