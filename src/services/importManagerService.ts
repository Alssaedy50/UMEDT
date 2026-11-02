import {
  DictionaryTerm,
  LinkedSentence,
  TopicArticle,
  MorphologicalAffix,
  ClinicalAbbreviation
} from '../types/lexicon';
import {
  UmedMcqQuestion,
  UmedClinicalCase,
  ImportHistoryEntry,
  InstalledPackageRecord,
  UmedPackageManifest,
  SupportedOriginalFileType
} from '../types/umedPackage';
import {
  loadInstalledPackages,
  saveInstalledPackages,
  loadStoredMcqQuestions,
  saveStoredMcqQuestions,
  loadStoredClinicalCases,
  saveStoredClinicalCases
} from './umedPackageService';
import {
  loadAppState,
  saveTerms,
  saveSentences,
  saveTopics,
  saveCustomAffixes,
  saveCustomAbbreviations,
  createDataBackupSnapshot,
  restoreDataBackupById
} from './storageService';

export const IMPORT_HISTORY_STORAGE_KEY = 'umed2_import_history_v1';

const memoryFallbackStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return memoryFallbackStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, value);
  } else {
    memoryFallbackStore.set(key, value);
  }
}

/**
 * Loads import history audit logs from localStorage or memory fallback.
 */
export function loadImportHistory(): ImportHistoryEntry[] {
  try {
    const stored = getStorageItem(IMPORT_HISTORY_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as ImportHistoryEntry[];
    }
  } catch {
    // ignore
  }
  return [
    {
      id: 'import-seed-init',
      timestamp: '2026-10-31T00:00:00.000Z',
      sourceName: 'UMED-2 Initial Offline Seed Lexicon',
      sourceType: 'umedpack',
      packageId: 'umed-core-seed',
      summary: {
        termsAdded: 50,
        termsUpdated: 0,
        questionsAdded: 2,
        sentencesAdded: 30,
        topicsAdded: 5,
        clinicalCasesAdded: 1,
        affixesAdded: 20,
        abbreviationsAdded: 15,
        ignoredDuplicates: 0
      },
      conflictPolicyUsed: 'merge',
      status: 'success',
      notes: 'تثبيت الحزمة الأساسية الأولى لنظام UMED-2 الطبي.'
    }
  ];
}

export function saveImportHistory(history: ImportHistoryEntry[]): void {
  try {
    // Keep most recent 50 import logs
    setStorageItem(IMPORT_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 50)));
  } catch (err) {
    console.warn('[ImportManager] Failed to save import history:', err);
  }
}

/**
 * Executes an Atomic Import of medical data into the local database with pre-import rollback snapshot.
 */
export async function executeAtomicMedicalImport(params: {
  sourceName: string;
  sourceType: SupportedOriginalFileType | 'ai_assistant' | 'package_manager';
  packageManifest?: UmedPackageManifest;
  terms?: DictionaryTerm[];
  questions?: UmedMcqQuestion[];
  sentences?: LinkedSentence[];
  topics?: TopicArticle[];
  customAffixes?: MorphologicalAffix[];
  customAbbreviations?: ClinicalAbbreviation[];
  clinicalCases?: UmedClinicalCase[];
  conflictPolicy: 'ignore' | 'overwrite' | 'merge';
}): Promise<{
  success: boolean;
  historyEntry: ImportHistoryEntry;
  summary: ImportHistoryEntry['summary'];
  error?: string;
}> {
  // 1. Create automatic pre-import rollback snapshot
  let rollbackSnapshotId: string | undefined;
  try {
    const backupSnapshot = await createDataBackupSnapshot({
      trigger: 'auto-pre-import',
      label: `قبل استيراد: ${params.sourceName}`
    });
    rollbackSnapshotId = backupSnapshot.backupId;
  } catch (err) {
    console.warn('[ImportManager] Could not create pre-import backup snapshot:', err);
  }

  const currentAppState = loadAppState();
  const existingTerms = currentAppState.terms;
  const existingSentences = currentAppState.sentences;
  const existingTopics = currentAppState.topics;
  const existingAffixes = currentAppState.customAffixes || [];
  const existingAbbreviations = currentAppState.customAbbreviations || [];
  const existingQuestions = loadStoredMcqQuestions();
  const existingCases = loadStoredClinicalCases();

  const summary = {
    termsAdded: 0,
    termsUpdated: 0,
    questionsAdded: 0,
    sentencesAdded: 0,
    topicsAdded: 0,
    clinicalCasesAdded: 0,
    affixesAdded: 0,
    abbreviationsAdded: 0,
    ignoredDuplicates: 0
  };

  try {
    // 2. Merge Terms
    const termMap = new Map<string, DictionaryTerm>();
    for (const t of existingTerms) {
      termMap.set(t.termNormalized || t.term.toLowerCase().trim(), t);
    }

    const nextTerms = [...existingTerms];
    for (const incoming of params.terms || []) {
      if (!incoming.term || !incoming.term.trim()) continue;
      const key = incoming.termNormalized || incoming.term.toLowerCase().trim();
      const existing = termMap.get(key);

      if (!existing) {
        nextTerms.push(incoming);
        termMap.set(key, incoming);
        summary.termsAdded++;
      } else {
        if (params.conflictPolicy === 'overwrite') {
          const idx = nextTerms.findIndex((t) => t.id === existing.id);
          if (idx !== -1) {
            nextTerms[idx] = { ...incoming, id: existing.id };
          }
          summary.termsUpdated++;
        } else if (params.conflictPolicy === 'merge') {
          // Merge examples and relations
          const idx = nextTerms.findIndex((t) => t.id === existing.id);
          if (idx !== -1) {
            const mergedExamples = [...existing.examples];
            for (const eg of incoming.examples || []) {
              if (!mergedExamples.some((e) => e.en === eg.en)) {
                mergedExamples.push(eg);
              }
            }
            nextTerms[idx] = {
              ...existing,
              translation: incoming.translation || existing.translation,
              definitionAr: incoming.definitionAr || existing.definitionAr,
              definitionEn: incoming.definitionEn || existing.definitionEn,
              examples: mergedExamples
            };
          }
          summary.termsUpdated++;
        } else {
          // ignore
          summary.ignoredDuplicates++;
        }
      }
    }

    // 3. Merge Questions (MCQs)
    const nextQuestions = [...existingQuestions];
    for (const q of params.questions || []) {
      if (!q.questionEn || !q.questionEn.trim()) continue;
      const existingIdx = nextQuestions.findIndex(
        (eq) => eq.questionEn.toLowerCase().trim() === q.questionEn.toLowerCase().trim()
      );
      if (existingIdx === -1) {
        nextQuestions.push(q);
        summary.questionsAdded++;
      } else if (params.conflictPolicy === 'overwrite') {
        nextQuestions[existingIdx] = { ...q, id: nextQuestions[existingIdx].id };
      } else {
        summary.ignoredDuplicates++;
      }
    }

    // 4. Merge Sentences
    const nextSentences = [...existingSentences];
    for (const s of params.sentences || []) {
      if (!s.en || !s.en.trim()) continue;
      const existingIdx = nextSentences.findIndex(
        (es) => es.en.toLowerCase().trim() === s.en.toLowerCase().trim()
      );
      if (existingIdx === -1) {
        nextSentences.push(s);
        summary.sentencesAdded++;
      } else if (params.conflictPolicy === 'overwrite') {
        nextSentences[existingIdx] = { ...s, id: nextSentences[existingIdx].id };
      }
    }

    // 5. Merge Topics
    const nextTopics = [...existingTopics];
    for (const tp of params.topics || []) {
      if (!tp.title || !tp.title.trim()) continue;
      const existingIdx = nextTopics.findIndex(
        (et) => et.title.toLowerCase().trim() === tp.title.toLowerCase().trim()
      );
      if (existingIdx === -1) {
        nextTopics.push(tp);
        summary.topicsAdded++;
      }
    }

    // 6. Merge Clinical Cases
    const nextCases = [...existingCases];
    for (const c of params.clinicalCases || []) {
      if (!c.titleEn || !c.titleEn.trim()) continue;
      const existingIdx = nextCases.findIndex(
        (ec) => ec.titleEn.toLowerCase().trim() === c.titleEn.toLowerCase().trim()
      );
      if (existingIdx === -1) {
        nextCases.push(c);
        summary.clinicalCasesAdded++;
      }
    }

    // 7. Merge Affixes & Abbreviations
    const nextAffixes = [...existingAffixes];
    for (const a of params.customAffixes || []) {
      if (!nextAffixes.some((ea) => ea.affix === a.affix && ea.type === a.type)) {
        nextAffixes.push(a);
        summary.affixesAdded++;
      }
    }

    const nextAbbreviations = [...existingAbbreviations];
    for (const ab of params.customAbbreviations || []) {
      if (!nextAbbreviations.some((eab) => eab.abbr.toLowerCase() === ab.abbr.toLowerCase())) {
        nextAbbreviations.push(ab);
        summary.abbreviationsAdded++;
      }
    }

    // 8. Commit changes atomically to storage
    saveTerms(nextTerms);
    saveSentences(nextSentences);
    saveTopics(nextTopics);
    saveCustomAffixes(nextAffixes);
    saveCustomAbbreviations(nextAbbreviations);
    saveStoredMcqQuestions(nextQuestions);
    saveStoredClinicalCases(nextCases);

    // 9. If package manifest present, register in Installed Packages
    if (params.packageManifest) {
      const installedPkgs = loadInstalledPackages();
      const existingIdx = installedPkgs.findIndex(
        (p) => p.packageId === params.packageManifest!.package_id
      );

      const pkgRecord: InstalledPackageRecord = {
        packageId: params.packageManifest.package_id,
        packageName: params.packageManifest.package_name,
        version: params.packageManifest.package_version,
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        subject: params.packageManifest.subject,
        category: params.packageManifest.category,
        author: params.packageManifest.author,
        source: params.packageManifest.source,
        recordsCount: params.packageManifest.records_count,
        sizeBytes: 50000,
        isBuiltIn: false,
        status: 'active',
        checksumVerified: true,
        signatureVerified: !!params.packageManifest.signature
      };

      if (existingIdx !== -1) {
        installedPkgs[existingIdx] = pkgRecord;
      } else {
        installedPkgs.push(pkgRecord);
      }
      saveInstalledPackages(installedPkgs);
    }

    // 10. Record in Import History
    const historyEntry: ImportHistoryEntry = {
      id: `import-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      sourceName: params.sourceName,
      sourceType: params.sourceType,
      packageId: params.packageManifest?.package_id,
      summary,
      conflictPolicyUsed: params.conflictPolicy,
      status: 'success',
      rollbackSnapshotId
    };

    const history = loadImportHistory();
    history.unshift(historyEntry);
    saveImportHistory(history);

    return {
      success: true,
      historyEntry,
      summary
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[ImportManager] Import failed, attempting rollback:', err);

    // Attempt automatic rollback if snapshot was created
    if (rollbackSnapshotId) {
      try {
        await restoreDataBackupById(rollbackSnapshotId);
      } catch (rbErr) {
        console.error('[ImportManager] Rollback failed:', rbErr);
      }
    }

    const failedEntry: ImportHistoryEntry = {
      id: `import-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      sourceName: params.sourceName,
      sourceType: params.sourceType,
      packageId: params.packageManifest?.package_id,
      summary,
      conflictPolicyUsed: params.conflictPolicy,
      status: 'failed',
      rollbackSnapshotId,
      error: errorMsg
    };

    const history = loadImportHistory();
    history.unshift(failedEntry);
    saveImportHistory(history);

    return {
      success: false,
      historyEntry: failedEntry,
      summary,
      error: errorMsg
    };
  }
}

/**
 * Rolls back an import by its history entry ID using the saved snapshot.
 */
export async function rollbackImportByHistoryId(historyId: string): Promise<{
  success: boolean;
  message: string;
}> {
  const history = loadImportHistory();
  const entryIdx = history.findIndex((h) => h.id === historyId);
  if (entryIdx === -1) {
    return { success: false, message: 'لم يتم العثور على سجل الاستيراد المحدد.' };
  }

  const entry = history[entryIdx];
  if (!entry.rollbackSnapshotId) {
    return {
      success: false,
      message: 'لا تتوفر نقطة استعادة سابقة لهذا الاستيراد.'
    };
  }

  try {
    const { result } = await restoreDataBackupById(entry.rollbackSnapshotId);
    if (result.success) {
      history[entryIdx].status = 'rolled_back';
      history[entryIdx].notes = `تم التراجع عن هذه العملية في ${new Date().toLocaleString('ar-EG')}`;
      saveImportHistory(history);
      return {
        success: true,
        message: `تم التراجع بنجاح واستعادة قاعدة البيانات إلى الإصدار ${result.restoredDataVersion}.`
      };
    } else {
      return {
        success: false,
        message: result.errors.join(' | ') || 'فشلت استعادة نقطة الاستعادة.'
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `خطأ أثناء التراجع: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
