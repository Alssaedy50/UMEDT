import React, { useCallback, useEffect, useState } from 'react';
import {
  FolderOpen,
  Pencil,
  Trash2,
  RefreshCw,
  ShieldAlert,
  ChevronDown,
  Check,
  X
} from 'lucide-react';
import {
  deleteImportGroup,
  dismissImportGroupRecord,
  ImportGroupView,
  loadImportGroups,
  renameImportGroup
} from '../services/importGroupService';
import { MobileSafeInput } from './MobileSafeInput';

const LABELS: Record<string, string> = {
  terms: 'مصطلحات',
  sentences: 'جمل وأمثلة',
  topics: 'مواضيع',
  questions: 'أسئلة تفاعلية',
  clinicalCases: 'حالات سريرية',
  affixes: 'جذور ولواحق',
  abbreviations: 'اختصارات',
  blocks: 'بلوكات',
  subjects: 'مواد',
  books: 'كتب',
  exams: 'اختبارات',
  mediaAssets: 'وسائط'
};

export const ImportGroupsPanel: React.FC = () => {
  const [groups, setGroups] = useState<ImportGroupView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    mode: 'delete' | 'dismiss';
  } | null>(null);

  const refresh = useCallback(() => setGroups(loadImportGroups()), []);
  useEffect(() => {
    refresh();
    window.addEventListener('umed:import-groups-updated', refresh);
    return () => window.removeEventListener('umed:import-groups-updated', refresh);
  }, [refresh]);

  const getRecordLabel = (domain: string, id: string, group: ImportGroupView): string => {
    try {
      const raw = group.fingerprints?.[domain as keyof typeof group.fingerprints]?.[id];
      const record = raw ? JSON.parse(raw) : null;
      if (!record) return id;
      return (
        record.term ||
        record.questionEn ||
        record.title ||
        record.en ||
        record.affix ||
        record.abbr ||
        record.titleEn ||
        id
      );
    } catch {
      return id;
    }
  };

  const handleStartRename = (group: ImportGroupView) => {
    if (group.legacy) return;
    setConfirmAction(null);
    setRenamingId(group.id);
    setRenameDraft(group.name);
  };

  const handleCommitRename = (groupId: string) => {
    if (!renameImportGroup(groupId, renameDraft)) {
      setFeedback('أدخل اسماً صالحاً للمجموعة.');
      return;
    }
    setRenamingId(null);
    setRenameDraft('');
    setFeedback('تم تحديث اسم المجموعة.');
    refresh();
  };

  const handleConfirmDelete = async (group: ImportGroupView) => {
    if (group.legacy || group.requiresReview) return;
    setBusyId(group.id);
    setConfirmAction(null);
    setFeedback('');
    const result = await deleteImportGroup(group.id);
    setFeedback(result.message);
    setBusyId(null);
    refresh();
  };

  const handleConfirmDismiss = (group: ImportGroupView) => {
    setConfirmAction(null);
    if (dismissImportGroupRecord(group.id)) {
      setFeedback(`تمت إزالة بطاقة «${group.name}» من السجل دون المساس ببياناتك المحلية.`);
      refresh();
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-emerald-500 shrink-0" />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              مجموعات البيانات المستوردة
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              إدارة الدفعات حسب موضوعها ومصدرها
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={refresh}
          aria-label="تحديث المجموعات"
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        {groups.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-4">
            لا توجد مجموعات استيراد مسجلة بعد. ستظهر عمليات الاستيراد الجديدة هنا.
          </p>
        )}
        {groups.map((group) => {
          const isRenaming = renamingId === group.id;
          const isConfirmingDelete =
            confirmAction?.id === group.id && confirmAction.mode === 'delete';
          const isConfirmingDismiss =
            confirmAction?.id === group.id && confirmAction.mode === 'dismiss';
          const canSelectiveDelete = !group.legacy && !group.requiresReview;

          return (
            <article
              key={group.id}
              className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {isRenaming ? (
                    <div className="flex items-center gap-1.5">
                      <MobileSafeInput
                        type="text"
                        value={renameDraft}
                        onValueChange={setRenameDraft}
                        placeholder="اسم المجموعة..."
                        className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-emerald-500 text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleCommitRename(group.id)}
                        aria-label="حفظ الاسم"
                        className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 shrink-0"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(null);
                          setRenameDraft('');
                        }}
                        aria-label="إلغاء التعديل"
                        className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="font-bold text-sm text-slate-900 dark:text-white break-words">
                      {group.name}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 mt-1 break-all">
                    {group.sourceName} ·{' '}
                    {group.createdAt
                      ? new Date(group.createdAt).toLocaleString()
                      : 'تاريخ غير متاح'}
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                    {group.total} عنصر مسجل · {group.ignoredDuplicates} مكرر تم تجاهله
                  </div>
                </div>
                {!group.legacy && !isRenaming && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartRename(group)}
                      aria-label="تعديل اسم المجموعة"
                      className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={!canSelectiveDelete || busyId === group.id}
                      onClick={() =>
                        setConfirmAction(
                          isConfirmingDelete ? null : { id: group.id, mode: 'delete' }
                        )
                      }
                      aria-label="حذف المجموعة"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {isConfirmingDelete && (
                <div className="mt-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-2.5 space-y-2">
                  <p className="text-[11px] font-bold text-red-700 dark:text-red-300 leading-relaxed">
                    حذف مساهمات مجموعة «{group.name}» نهائياً؟ سيتم حفظ نسخة أمان تلقائياً ولن تتأثر أي عناصر أخرى.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === group.id}
                      onClick={() => void handleConfirmDelete(group)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold disabled:opacity-50"
                    >
                      {busyId === group.id ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => setExpandedId(expandedId === group.id ? null : group.id)}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    expandedId === group.id ? 'rotate-180' : ''
                  }`}
                />
                {expandedId === group.id ? 'إخفاء المحتويات' : 'معاينة المحتويات'}
              </button>
              {expandedId === group.id && (
                <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-950 p-2 space-y-2">
                  {Object.entries(group.ids || {})
                    .filter(([, ids]) => Boolean(ids?.length))
                    .map(([domain, ids]) => (
                      <div key={domain}>
                        <div className="text-[10px] font-extrabold text-slate-500 mb-1">
                          {LABELS[domain] || domain}
                        </div>
                        <ul className="space-y-1">
                          {(ids || []).slice(0, 40).map((recordId) => (
                            <li
                              key={recordId}
                              className="text-[11px] text-slate-700 dark:text-slate-300 break-words"
                            >
                              • {getRecordLabel(domain, recordId, group)}
                            </li>
                          ))}
                          {(ids || []).length > 40 && (
                            <li className="text-[10px] text-slate-500">
                              و{(ids || []).length - 40} عناصر أخرى…
                            </li>
                          )}
                        </ul>
                      </div>
                    ))}
                  {Object.values(group.ids || {}).every((arr) => !arr?.length) && (
                    <p className="text-[11px] text-slate-500">
                      لا توجد معرّفات عناصر فردية محفوظة في هذه الدفعة.
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(group.counts || {})
                  .filter(([, count]) => Number(count) > 0)
                  .map(([domain, count]) => (
                    <span
                      key={domain}
                      className="text-[10px] rounded-full px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      {LABELS[domain] || domain}: {count}
                    </span>
                  ))}
              </div>

              {(group.requiresReview || group.legacy) && (
                <div className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2.5 space-y-2">
                  <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      {group.reviewReason ||
                        'هذه عملية قديمة لا تحتوي على تفاصيل كافية للحذف الانتقائي. لم يتم تفعيل الحذف منعاً لفقدان بيانات أخرى.'}
                    </span>
                  </div>
                  {isConfirmingDismiss ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleConfirmDismiss(group)}
                        className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-extrabold"
                      >
                        تأكيد إزالة البطاقة من السجل
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAction(null)}
                        className="px-2.5 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold"
                      >
                        إلغاء
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAction({ id: group.id, mode: 'dismiss' })}
                      className="text-[11px] font-extrabold text-amber-700 dark:text-amber-300 underline underline-offset-2"
                    >
                      إزالة هذه البطاقة من السجل فقط (دون حذف البيانات)
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {feedback && (
          <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 font-bold p-2">
            {feedback}
          </p>
        )}
      </div>
    </section>
  );
};
