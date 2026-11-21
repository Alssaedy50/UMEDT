/**
 * Direct GitHub repository management for UMEDT.
 * Secrets are persisted only through the native Android Keystore bridge.
 */
const DEFAULT_REPOSITORY_OWNER = 'Alssaedy50';
const DEFAULT_REPOSITORY_NAME = 'UMEDT-DATA';
const DEFAULT_BRANCH = 'main';
const TOKEN_STORAGE_KEY = 'umedt_github_pat_aks_v1';
const REPOSITORY_CONFIG_STORAGE_KEY = 'umedt_github_repository_config_v1';

type NativeSecretBridge = {
  encryptSecretWithKeystore?: (plainText: string) => string;
  decryptSecretWithKeystore?: (cipherText: string) => string;
};

export type GitHubRepositoryConfig = { owner: string; repository: string; branch: string };

export type MasterDataSnapshot = {
  terms: unknown[];
  sentences: unknown[];
  topics: unknown[];
  customAffixes: unknown[];
  customAbbreviations: unknown[];
  blocks: unknown[];
  subjects: unknown[];
  books: unknown[];
  questions: unknown[];
  exams: unknown[];
  mediaAssets: unknown[];
};

function validateRepositoryConfig(config: GitHubRepositoryConfig): GitHubRepositoryConfig {
  const owner = String(config.owner || '').trim();
  const repository = String(config.repository || '').trim();
  const branch = String(config.branch || '').trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) throw new Error('اسم مالك المستودع غير صالح.');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repository) || repository === '.' || repository === '..') throw new Error('اسم المستودع غير صالح.');
  if (!branch || branch.length > 255 || /[\s~^:?*\\]/.test(branch) || branch.includes('[') || branch.includes(']') ||
      branch.startsWith('/') || branch.endsWith('/') || branch.includes('//') || branch.includes('..') ||
      branch.includes('@{') || branch.endsWith('.')) throw new Error('اسم الفرع غير صالح وفق قواعد Git.');
  return { owner, repository, branch };
}

export function loadGitHubRepositoryConfig(): GitHubRepositoryConfig {
  const fallback = { owner: DEFAULT_REPOSITORY_OWNER, repository: DEFAULT_REPOSITORY_NAME, branch: DEFAULT_BRANCH };
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(REPOSITORY_CONFIG_STORAGE_KEY) : null;
    return raw ? validateRepositoryConfig({ ...fallback, ...JSON.parse(raw) }) : fallback;
  } catch { return fallback; }
}

export function saveGitHubRepositoryConfig(config: GitHubRepositoryConfig): GitHubRepositoryConfig {
  const value = validateRepositoryConfig(config);
  if (typeof localStorage === 'undefined') throw new Error('لا يتوفر التخزين المحلي لحفظ إعدادات المستودع.');
  localStorage.setItem(REPOSITORY_CONFIG_STORAGE_KEY, JSON.stringify(value));
  return value;
}

function repositoryApiPath(config: GitHubRepositoryConfig): string {
  const value = validateRepositoryConfig(config);
  return `/repos/${encodeURIComponent(value.owner)}/${encodeURIComponent(value.repository)}`;
}

function branchRefPath(branch: string): string {
  return `/git/ref/heads/${encodeURIComponent(branch)}`;
}

export function getConfiguredGitHubRawUrl(filePath: string): string {
  const config = loadGitHubRepositoryConfig();
  const branchPath = config.branch.split('/').map(encodeURIComponent).join('/');
  const safeFilePath = filePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/${branchPath}/${safeFilePath}`;
}

function nativeBridge(): NativeSecretBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    UMEDAndroidBridge?: NativeSecretBridge;
    UMEDNativeDownloader?: NativeSecretBridge;
  };
  const bridge = w.UMEDAndroidBridge || w.UMEDNativeDownloader;
  return bridge &&
    typeof bridge.encryptSecretWithKeystore === 'function' &&
    typeof bridge.decryptSecretWithKeystore === 'function'
    ? bridge
    : null;
}

function parseBridgeResult<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function saveGitHubToken(token: string): void {
  const clean = token.trim();
  if (!clean) throw new Error('أدخل GitHub Token أولاً.');
  const bridge = nativeBridge();
  if (!bridge) {
    throw new Error('الحفظ الآمن للتوكن يتطلب تطبيق Android الأصلي الذي يدعم Android Keystore. لن يُحفظ التوكن في المتصفح.');
  }
  const result = parseBridgeResult<{ ok?: boolean; cipherText?: string }>(
    bridge.encryptSecretWithKeystore!(clean)
  );
  if (!result.ok || !result.cipherText?.startsWith('aks_v1:')) {
    throw new Error('تعذر تشفير التوكن بواسطة Android Keystore.');
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, result.cipherText);
}

export function loadGitHubToken(): string {
  const cipher = localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  if (!cipher) return '';
  const bridge = nativeBridge();
  if (!bridge || !cipher.startsWith('aks_v1:')) return '';
  try {
    const result = parseBridgeResult<{ ok?: boolean; plainText?: string }>(
      bridge.decryptSecretWithKeystore!(cipher)
    );
    return result.ok && typeof result.plainText === 'string' ? result.plainText : '';
  } catch {
    return '';
  }
}

export function hasSavedGitHubToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_STORAGE_KEY));
}

export function clearGitHubToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function githubRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });
  const body = await response.text();
  let parsed: unknown = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = body; }
  if (!response.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'message' in parsed
        ? String((parsed as { message?: unknown }).message)
        : `GitHub API returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return parsed as T;
}

export async function listGitHubBranches(tokenOverride?: string, configOverride?: GitHubRepositoryConfig): Promise<string[]> {
  const token = (tokenOverride || loadGitHubToken()).trim();
  if (!token) throw new Error('أدخل التوكن واحفظه أولاً.');
  const config = validateRepositoryConfig(configOverride || loadGitHubRepositoryConfig());
  const branches = await githubRequest<Array<{ name: string }>>(token, `${repositoryApiPath(config)}/branches?per_page=100`);
  return branches.map((branch) => branch.name).filter((name) => typeof name === 'string');
}

export type GitHubWorkflowRunSummary = {
  id: number;
  run_number: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
  head_sha: string;
};

export async function getLatestDataReleaseRun(configOverride?: GitHubRepositoryConfig): Promise<GitHubWorkflowRunSummary | null> {
  const config = validateRepositoryConfig(configOverride || loadGitHubRepositoryConfig());
  const url = `https://api.github.com${repositoryApiPath(config)}/actions/runs?branch=${encodeURIComponent(config.branch)}&per_page=20`;
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
  if (response.status === 404) {
    throw new Error('تعذر قراءة سجل GitHub Actions. قد يكون المستودع خاصاً أو لا يتيح السجل العام.');
  }
  if (!response.ok) throw new Error(`تعذر قراءة GitHub Actions (HTTP ${response.status}).`);
  const payload = await response.json() as { workflow_runs?: Array<GitHubWorkflowRunSummary & { path?: string }> };
  const runs = Array.isArray(payload.workflow_runs) ? payload.workflow_runs : [];
  return runs.find((run) => run.path === '.github/workflows/validate-terms.yml') || null;
}

export async function testGitHubConnection(tokenOverride?: string, configOverride?: GitHubRepositoryConfig): Promise<{
  repository: string; branch: string; defaultBranch: string; canWrite: boolean; isPublic: boolean;
}> {
  const token = (tokenOverride || loadGitHubToken()).trim();
  if (!token) throw new Error('أدخل التوكن واحفظه أولاً.');
  const config = validateRepositoryConfig(configOverride || loadGitHubRepositoryConfig());
  const repo = await githubRequest<{
    full_name: string; default_branch: string; archived?: boolean; private?: boolean;
    permissions?: { push?: boolean; admin?: boolean };
  }>(token, repositoryApiPath(config));
  if (repo.archived) throw new Error('المستودع مؤرشف ولا يقبل النشر.');
  if (!repo.permissions?.push) throw new Error('التوكن متصل، لكنه لا يمتلك صلاحية الكتابة. امنح Contents: Read and write.');
  await githubRequest<{ object: { sha: string } }>(token, `${repositoryApiPath(config)}${branchRefPath(config.branch)}`);
  return {
    repository: repo.full_name, branch: config.branch,
    defaultBranch: repo.default_branch || DEFAULT_BRANCH, canWrite: true, isPublic: !repo.private
  };
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}


/**
 * Publishes only reviewed dictionary terms to the terms-only UMEDT-DATA repository.
 * Educational content and local user data are never written to the cloud dictionary.
 */
export async function publishMasterDataToGitHub(snapshot: MasterDataSnapshot): Promise<{
  commitSha: string; filesUpdated: number; branch: string; repository: string;
}> {
  const token = loadGitHubToken();
  if (!token) throw new Error('لا يوجد GitHub Token محفوظ. أضفه من إعدادات إدارة المستودع.');
  const config = loadGitHubRepositoryConfig();
  await testGitHubConnection(token, config);

  const normalize = (value: string) => value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑‒–—]/g, '-')
    .replace(/[^a-z0-9'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const validWord = /^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*$/;
  const seen = new Map<string, string>();
  const terms = snapshot.terms.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`سجل المصطلح رقم ${index + 1} غير صالح.`);
    const item = raw as Record<string, unknown>;
    const term = typeof item.term === 'string' ? item.term.trim().replace(/\s+/g, ' ') : '';
    const words = term ? term.split(' ') : [];
    if (words.length < 1 || words.length > 2 || words.some((word) => !validWord.test(word))) {
      throw new Error(`المصطلح "${term || index + 1}" يجب أن يكون كلمة إنجليزية واحدة أو كلمتين فقط، وليس جملة.`);
    }
    const key = normalize(term);
    if (seen.has(key)) throw new Error(`مصطلح مكرر: "${term}" يتعارض مع "${seen.get(key)}".`);
    seen.set(key, term);

    const translation = typeof item.translation === 'string' ? item.translation.trim() : '';
    const pronunciation = typeof item.phonetic === 'string'
      ? item.phonetic.trim()
      : typeof item.pronunciation === 'string' ? item.pronunciation.trim() : '';
    const definitionEn = typeof item.definitionEn === 'string' ? item.definitionEn.trim() : '';
    const definitionAr = typeof item.definitionAr === 'string' ? item.definitionAr.trim() : '';
    const examples = Array.isArray(item.examples) ? item.examples as Array<Record<string, unknown>> : [];
    const exampleEn = typeof examples[0]?.en === 'string' ? String(examples[0].en).trim() : '';
    const exampleAr = typeof examples[0]?.ar === 'string' ? String(examples[0].ar).trim() : '';
    if (!translation || !/[\u0600-\u06FF]/.test(translation) || /^(مصطلح طبي|ترجمة عربية|غير معروف)$/i.test(translation)) {
      throw new Error(`الترجمة العربية مفقودة أو عامة وغير صالحة للمصطلح "${term}".`);
    }
    if (!pronunciation || !definitionEn || !definitionAr || !exampleEn || !exampleAr ||
      /^clinical medical term:/i.test(definitionEn) ||
      /^مصطلح طبي سريري يعني/i.test(definitionAr)) {
      throw new Error(`المصطلح "${term}" يحتاج إلى النطق والتعريف باللغتين ومثال باللغتين قبل النشر.`);
    }
    const slug = key.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return {
      id: `term-${slug}`,
      term,
      definitionEn,
      definitionAr,
      translation,
      pronunciation,
      exampleEn,
      exampleAr,
      createdAt: typeof item.ingestedAt === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(item.ingestedAt)
        ? item.ingestedAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
  if (!terms.length) throw new Error('لا توجد مصطلحات محلية جديدة للنشر.');

  // Read the current cloud dictionary and append only genuinely new terms.
  // Existing cloud records are never replaced by a device snapshot.
  const remoteResponse = await fetch(getConfiguredGitHubRawUrl('data/master/terms.json'), {
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });
  if (!remoteResponse.ok) throw new Error(`تعذر قراءة القاموس السحابي قبل الإضافة (HTTP ${remoteResponse.status}).`);
  const remoteJson = await remoteResponse.json() as unknown;
  if (!Array.isArray(remoteJson)) throw new Error('ملف المصطلحات السحابي ليس مصفوفة JSON صالحة.');
  const mergedTerms = [...remoteJson] as Array<Record<string, unknown>>;
  const remoteByKey = new Map<string, Record<string, unknown>>();
  for (const remoteTerm of mergedTerms) {
    const remoteName = typeof remoteTerm.term === 'string' ? remoteTerm.term : '';
    const remoteKey = normalize(remoteName);
    if (!remoteKey) throw new Error('يوجد سجل غير صالح في القاموس السحابي؛ أوقفنا الإضافة لحماية البيانات.');
    if (remoteByKey.has(remoteKey)) throw new Error(`القاموس السحابي يحتوي بالفعل على تكرار للمصطلح "${remoteName}".`);
    remoteByKey.set(remoteKey, remoteTerm);
  }

  const additions: typeof terms = [];
  const comparableFields = ['term', 'definitionEn', 'definitionAr', 'translation', 'pronunciation', 'exampleEn', 'exampleAr'] as const;
  for (const localTerm of terms) {
    const key = normalize(localTerm.term);
    const existing = remoteByKey.get(key);
    if (!existing) {
      additions.push(localTerm);
      continue;
    }
    const sameMeaning = comparableFields.every((field) =>
      String(existing[field] ?? '').trim() === String(localTerm[field] ?? '').trim()
    );
    if (!sameMeaning) {
      throw new Error(`المصطلح "${localTerm.term}" موجود سحابياً لكن بياناته تختلف. لم نستبدل الترجمة أو التعريف؛ راجع السجل يدوياً أولاً.`);
    }
  }
  if (!additions.length) throw new Error('كل المصطلحات المحلية موجودة بالفعل في القاموس السحابي؛ لم تُجرَ أي كتابة.');

  const nextCloudTerms = [...mergedTerms, ...additions];
  const file = { path: 'data/master/terms.json', content: JSON.stringify(nextCloudTerms, null, 2) + '\n' };
  const repoPath = repositoryApiPath(config);
  const refPath = `${repoPath}${branchRefPath(config.branch)}`;
  const ref = await githubRequest<{ object: { sha: string } }>(token, refPath);
  const parentSha = ref.object.sha;
  const parent = await githubRequest<{ tree: { sha: string } }>(token, `${repoPath}/git/commits/${parentSha}`);
  const blob = await githubRequest<{ sha: string }>(token, `${repoPath}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: encodeBase64Utf8(file.content), encoding: 'base64' })
  });
  const tree = await githubRequest<{ sha: string }>(token, `${repoPath}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: [{ path: file.path, mode: '100644', type: 'blob', sha: blob.sha }] })
  });
  const commit = await githubRequest<{ sha: string }>(token, `${repoPath}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: 'chore(terms): publish reviewed dictionary terms', tree: tree.sha, parents: [parentSha] })
  });
  const latestRef = await githubRequest<{ object: { sha: string } }>(token, refPath);
  if (latestRef.object.sha !== parentSha) throw new Error('تغير الفرع أثناء تجهيز النشر. لم يتم تحديث رأس الفرع؛ أعد المحاولة.');
  await githubRequest(token, `${repoPath}/git/refs/heads/${encodeURIComponent(config.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false })
  });
  return {
    commitSha: commit.sha,
    filesUpdated: 1,
    branch: config.branch,
    repository: `${config.owner}/${config.repository}`
  };
}
