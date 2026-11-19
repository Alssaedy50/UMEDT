import React, { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Pencil, Trash2, RefreshCw, ShieldAlert } from 'lucide-react';
import { deleteImportGroup, ImportGroupView, loadImportGroups, renameImportGroup } from '../services/importGroupService';

const LABELS: Record<string, string> = {
  terms: 'مصطلحات', sentences: 'جمل وأمثلة', topics: 'مواضيع',
  questions: 'أسئلة MCQ', clinicalCases: 'حالات سريرية',
  affixes: 'جذور ولواحق', abbreviations: 'اختصارات'
};

export const ImportGroupsPanel: React.FC = () => {
  const [groups, setGroups] = useState<ImportGroupView[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');
  const refresh = useCallback(() => setGroups(loadImportGroups()), []);
  useEffect(() => { refresh(); }, [refresh]);

  const handleRename = (group: ImportGroupView) => {
    if (group.legacy) return;
    const next = window.prompt('اسم المجموعة الموضوعي:', group.name);
    if (next === null) return;
    if (!renameImportGroup(group.id, next)) {
      setFeedback('أدخل اسماً صالحاً للمجموعة.');
      return;
    }
    refresh();
  };

  const handleDelete = async (group: ImportGroupView) => {
    if (group.legacy || group.requiresReview) return;
    const details = Object.entries(group.counts || {})
      .filter(([, count]) => Number(count) > 0)
      .map(([domain, count]) => `${LABELS[domain] || domain}: ${count}`).join('\n');
    const confirmed = window.confirm(
      `حذف مجموعة «${group.name}»؟\n\nالعناصر التي ستُحذف:\n${details || 'لا توجد عناصر'}\n\nسيتم إنشاء نسخة أمان أولاً. لن تُحذف العناصر التي لم تضفها هذه المجموعة.`
    );
    if (!confirmed) return;
    setBusyId(group.id);
    setFeedback('');
    const result = await deleteImportGroup(group.id);
    setFeedback(result.message);
    setBusyId(null);
    refresh();
  };

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FolderOpen className="w-4 h-4 text-emerald-500 shrink-0" />
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">مجموعات البيانات المستوردة</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">إدارة الدفعات حسب موضوعها ومصدرها</p>
          </div>
        </div>
        <button type="button" onClick={refresh} aria-label="تحديث المجموعات" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        {groups.length === 0 && <p className="text-xs text-slate-500 text-center py-4">لا توجد مجموعات استيراد مسجلة بعد. ستظهر عمليات الاستيراد الجديدة هنا.</p>}
        {groups.map(group => (
          <article key={group.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900 dark:text-white break-words">{group.name}</div>
                <div className="text-[11px] text-slate-500 mt-1 break-all">{group.sourceName} · {group.createdAt ? new Date(group.createdAt).toLocaleString() : 'تاريخ غير متاح'}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">{group.total} عنصر مسجل · {group.ignoredDuplicates} مكرر تم تجاهله</div>
              </div>
              {!group.legacy && (
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => handleRename(group)} aria-label="تعديل اسم المجموعة" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="w-4 h-4" /></button>
                  <button type="button" disabled={group.requiresReview || busyId === group.id} onClick={() => handleDelete(group)} aria-label="حذف المجموعة" className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {Object.entries(group.counts || {}).filter(([, count]) => Number(count) > 0).map(([domain, count]) => (
                <span key={domain} className="text-[10px] rounded-full px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{LABELS[domain] || domain}: {count}</span>
              ))}
            </div>
            {(group.requiresReview || group.legacy) && (
              <div className="mt-2 flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{group.reviewReason || 'هذه عملية قديمة لا تحتوي على تفاصيل كافية للحذف الانتقائي. لم يتم تفعيل الحذف منعاً لفقدان بيانات أخرى.'}</span>
              </div>
            )}
          </article>
        ))}
        {feedback && <p role="status" className="text-xs text-slate-600 dark:text-slate-300 p-2">{feedback}</p>}
      </div>
    </section>
  );
};
