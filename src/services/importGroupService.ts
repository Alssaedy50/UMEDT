import {
  loadAppState, saveTerms, saveSentences, saveTopics,
  saveCustomAffixes, saveCustomAbbreviations, createDataBackupSnapshot, restoreDataBackupById
} from './storageService';
import {
  loadStoredMcqQuestions, saveStoredMcqQuestions,
  loadStoredClinicalCases, saveStoredClinicalCases
} from './umedPackageService';
import {
  loadQuizQuestions,
  saveQuizQuestions
} from './quizEngineService';

export type ImportGroupDomain =
  | 'terms' | 'sentences' | 'topics' | 'questions'
  | 'clinicalCases' | 'affixes' | 'abbreviations';

export interface ImportGroupRecord {
  id: string;
  name: string;
  sourceName: string;
  sourceType: string;
  packageId?: string;
  createdAt: string;
  ids: Partial<Record<ImportGroupDomain, string[]>>;
  fingerprints?: Partial<Record<ImportGroupDomain, Record<string, string>>>;
  counts: Record<string, number>;
  ignoredDuplicates: number;
  requiresReview: boolean;
  reviewReason?: string;
  rollbackSnapshotId?: string;
}
export interface ImportGroupView extends ImportGroupRecord {
  legacy?: boolean;
  total: number;
}
const STORAGE_KEY = 'umedt_import_groups_v1';
const HISTORY_KEY = 'umed2_import_history_v1';
const memoryStore = new Map<string, string>();

function getItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value;
    }
  } catch { /* use memory fallback */ }
  return memoryStore.get(key) ?? null;
}
function setItem(key: string, value: string): boolean {
  memoryStore.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
    return true;
  } catch { return typeof window === 'undefined'; }
}

function readGroups(): ImportGroupRecord[] {
  try {
    const raw = getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as ImportGroupRecord[] : [];
  } catch { return []; }
}
function writeGroups(groups: ImportGroupRecord[]): boolean {
  return setItem(STORAGE_KEY, JSON.stringify(groups));
}

function notifyImportDataMutated(source: string, groupId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event('umed:import-groups-updated'));
    window.dispatchEvent(
      new CustomEvent('umed:data-mutated', { detail: { source, groupId } })
    );
  } catch {
    // ignore
  }
}

export function loadImportGroups(): ImportGroupView[] {
  const groups: ImportGroupView[] = readGroups().map(g => ({
    ...g,
    total: Object.values(g.counts || {}).reduce((n, v) => n + (v || 0), 0)
  }));
  const known = new Set(groups.map(g => g.id));
  let legacy: any[] = [];
  try {
    const raw = getItem(HISTORY_KEY);
    if (raw) legacy = JSON.parse(raw);
  } catch { /* preserve registry even if history is corrupt */ }
  for (const entry of legacy) {
    if (
      !entry ||
      !entry.id ||
      entry.id === 'import-seed-init' ||
      known.has(entry.id) ||
      entry.status !== 'success'
    ) {
      continue;
    }
    const counts = entry.summary || {};
    const legacyTotal = Object.entries(counts)
      .filter(([k]) => k !== 'ignoredDuplicates')
      .reduce((n, [, v]) => n + (typeof v === 'number' ? v : 0), 0);
    if (legacyTotal === 0) continue;
    groups.push({
      id: entry.id, name: entry.sourceName || 'استيراد سابق',
      sourceName: entry.sourceName || '', sourceType: entry.sourceType || 'unknown',
      packageId: entry.packageId, createdAt: entry.timestamp || '',
      ids: {}, counts: {}, ignoredDuplicates: counts.ignoredDuplicates || 0,
      requiresReview: true,
      reviewReason: 'عملية قديمة لا تحتوي على معرّفات العناصر ومصدر كل تعديل؛ لا يمكن حذفها انتقائياً بأمان.',
      rollbackSnapshotId: entry.rollbackSnapshotId, legacy: true,
      total: legacyTotal
    });
  }
  return groups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function registerImportGroup(group: ImportGroupRecord): void {
  const groups = readGroups().filter(g => g.id !== group.id);
  groups.unshift(group);
  writeGroups(groups.slice(0, 100));
}

export function renameImportGroup(id: string, name: string): boolean {
  const clean = name.trim().slice(0, 100);
  if (!clean) return false;
  const groups = readGroups();
  const item = groups.find(g => g.id === id);
  if (!item) return false;
  item.name = clean;
  return writeGroups(groups);
}

/**
 * Removes ONLY the log card from the import groups list (without modifying local data).
 * Useful for clearing stale/legacy/review-locked history entries.
 */
export function dismissImportGroupRecord(id: string): boolean {
  let removedAny = false;
  const groups = readGroups();
  const nextGroups = groups.filter((g) => g.id !== id);
  if (nextGroups.length !== groups.length) {
    writeGroups(nextGroups);
    removedAny = true;
  }
  try {
    const raw = getItem(HISTORY_KEY);
    if (raw) {
      const legacy = JSON.parse(raw);
      if (Array.isArray(legacy)) {
        const nextLegacy = legacy.filter((entry: any) => entry?.id !== id);
        if (nextLegacy.length !== legacy.length) {
          setItem(HISTORY_KEY, JSON.stringify(nextLegacy));
          removedAny = true;
        }
      }
    }
  } catch {
    // ignore
  }
  if (removedAny && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('umed:import-groups-updated'));
  }
  return removedAny;
}

export async function deleteImportGroup(id: string): Promise<{success:boolean; message:string}> {
  const groups = readGroups();
  const group = groups.find(g => g.id === id);
  if (!group) return { success:false, message:'المجموعة غير موجودة أو أنها استيراد قديم غير قابل للحذف الانتقائي.' };
  if (group.requiresReview) return { success:false, message:group.reviewReason || 'تحتاج هذه المجموعة إلى مراجعة قبل الحذف.' };
  let backupId: string | undefined;
  try {
    const backup = await createDataBackupSnapshot({ trigger:'manual', label:`نسخة أمان قبل حذف مجموعة: ${group.name}` });
    backupId = backup.backupId;
    const state = loadAppState();
    const currentQuizQuestions = loadQuizQuestions(state.topics, state.terms);
    const currentStoredMcqQuestions = loadStoredMcqQuestions();
    const combinedQuestionRows: Array<{ id: string }> = [
      ...currentQuizQuestions,
      ...currentStoredMcqQuestions.filter(
        (mcq) => !currentQuizQuestions.some((q) => q.id === mcq.id)
      )
    ];

    const currentRows: Partial<Record<ImportGroupDomain, Array<{id:string}>>> = {
      terms: state.terms, sentences: state.sentences, topics: state.topics,
      affixes: state.customAffixes || [], abbreviations: state.customAbbreviations || [],
      questions: combinedQuestionRows, clinicalCases: loadStoredClinicalCases()
    };
    for (const domain of Object.keys(group.ids) as ImportGroupDomain[]) {
      const ids = group.ids[domain] || [];
      if (ids.length === 0) continue;
      const fingerprints = group.fingerprints?.[domain];
      const rows = currentRows[domain] || [];
      const otherGroupOwns = groups.some(other => other.id !== id && (other.ids[domain] || []).some(recordId => ids.includes(recordId)));
      if (otherGroupOwns) return { success:false, message:'توجد مشاركة في معرّفات عناصر المجموعة مع عملية استيراد أخرى؛ أُوقف الحذف لحماية البيانات.' };
      if (!fingerprints || ids.some(recordId => {
        const row = rows.find(item => item.id === recordId);
        return !row || fingerprints[recordId] !== JSON.stringify(row);
      })) return { success:false, message:'تغيرت بعض العناصر بعد استيرادها أو لا تتوفر بصمتها الأصلية؛ أُوقف الحذف لحماية تعديلاتك. يلزم مراجعة هذه المجموعة.' };
    }
    const remove = <T extends { id: string }>(domain: ImportGroupDomain, rows: T[]): T[] => {
      const ids = new Set(group.ids[domain] || []);
      return rows.filter(row => !ids.has(row.id));
    };
    const writesOk =
      (!group.ids.terms?.length || saveTerms(remove('terms', state.terms))) &&
      (!group.ids.sentences?.length || saveSentences(remove('sentences', state.sentences))) &&
      (!group.ids.topics?.length || saveTopics(remove('topics', state.topics))) &&
      (!group.ids.affixes?.length || saveCustomAffixes(remove('affixes', state.customAffixes || []))) &&
      (!group.ids.abbreviations?.length || saveCustomAbbreviations(remove('abbreviations', state.customAbbreviations || [])));
    if (!writesOk) throw new Error('فشل حفظ أحد أجزاء الحذف؛ ستتم استعادة نسخة الأمان.');
    if (group.ids.questions?.length) {
      const targetQuestionIds = new Set(group.ids.questions);
      const hasInQuizStore = currentQuizQuestions.some((item) => targetQuestionIds.has(item.id));
      const hasInMcqStore = currentStoredMcqQuestions.some((item) => targetQuestionIds.has(item.id));
      if (hasInQuizStore) {
        saveQuizQuestions(remove('questions', currentQuizQuestions));
        const afterQuiz = loadQuizQuestions(state.topics, state.terms);
        if (afterQuiz.some(item => targetQuestionIds.has(item.id))) {
          throw new Error('تعذر التحقق من حذف أسئلة المجموعة.');
        }
      }
      if (hasInMcqStore) {
        saveStoredMcqQuestions(remove('questions', currentStoredMcqQuestions));
        if (loadStoredMcqQuestions().some(item => targetQuestionIds.has(item.id))) {
          throw new Error('تعذر التحقق من حذف أسئلة المجموعة.');
        }
      }
    }
    if (group.ids.clinicalCases?.length) {
      saveStoredClinicalCases(remove('clinicalCases', loadStoredClinicalCases()));
      if (loadStoredClinicalCases().some(item => group.ids.clinicalCases?.includes(item.id))) throw new Error('تعذر التحقق من حذف الحالات السريرية.');
    }
    if (!writeGroups(groups.filter(g => g.id !== id))) throw new Error('تعذر تحديث سجل المجموعات في التخزين المحلي؛ ستتم استعادة نسخة الأمان.');
    notifyImportDataMutated('import-group-delete', id);
    return { success:true, message:`حُذفت مساهمات مجموعة «${group.name}» فقط، مع الاحتفاظ بنسخة أمان.` };
  } catch (error) {
    try {
      if (backupId) {
        const restored = await restoreDataBackupById(backupId);
        if (!restored.result.success) {
          return { success:false, message:`فشل الحذف والاستعادة التلقائية: ${restored.result.errors.join(' | ')}` };
        }
      }
    } catch (restoreError) {
      return { success:false, message:`حدث خطأ أثناء الحذف وفشلت استعادة النسخة الاحتياطية: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}` };
    }
    return { success:false, message:`تعذر حذف المجموعة: ${error instanceof Error ? error.message : String(error)}. تم استرجاع نسخة الأمان عند توفرها.` };
  }
}
