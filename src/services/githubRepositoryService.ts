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
  return runs.find((run) => run.path === '.github/workflows/publish-data-release.yml') || null;
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
 * Publishes a complete snapshot of the app's current master collections in one Git commit.
 * The data repository's existing push workflow validates and signs the subsequent OTA release.
 */
export async function publishMasterDataToGitHub(snapshot: MasterDataSnapshot): Promise<{
  commitSha: string; filesUpdated: number; branch: string; repository: string;
}> {
  const token = loadGitHubToken();
  if (!token) throw new Error('لا يوجد GitHub Token محفوظ. أضفه من إعدادات إدارة المستودع.');
  const config = loadGitHubRepositoryConfig();
  await testGitHubConnection(token, config);

  const files: Array<{ path: string; content: string }> = [
    { path: 'data/master/terms.json', content: JSON.stringify(snapshot.terms, null, 2) },
    { path: 'data/master/sentences.json', content: JSON.stringify(snapshot.sentences, null, 2) },
    { path: 'data/master/topics.json', content: JSON.stringify(snapshot.topics, null, 2) },
    { path: 'data/master/custom-affixes.json', content: JSON.stringify(snapshot.customAffixes, null, 2) },
    { path: 'data/master/custom-abbreviations.json', content: JSON.stringify(snapshot.customAbbreviations, null, 2) },
    { path: 'data/master/blocks.json', content: JSON.stringify(snapshot.blocks, null, 2) },
    { path: 'data/master/subjects.json', content: JSON.stringify(snapshot.subjects, null, 2) },
    { path: 'data/master/books.json', content: JSON.stringify(snapshot.books, null, 2) },
    { path: 'data/master/questions.json', content: JSON.stringify(snapshot.questions, null, 2) },
    { path: 'data/master/exams.json', content: JSON.stringify(snapshot.exams, null, 2) },
    { path: 'data/master/media-index.json', content: JSON.stringify(snapshot.mediaAssets, null, 2) }
  ];
  for (const file of files) {
    const parsed = JSON.parse(file.content) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`بيانات غير صالحة في ${file.path}`);
  }
  if (files.every((file) => (JSON.parse(file.content) as unknown[]).length === 0)) {
    throw new Error('تم إيقاف النشر لأن جميع مجموعات البيانات فارغة.');
  }

  const repoPath = repositoryApiPath(config);
  const refPath = `${repoPath}${branchRefPath(config.branch)}`;
  const ref = await githubRequest<{ object: { sha: string } }>(token, refPath);
  const parentSha = ref.object.sha;
  const parent = await githubRequest<{ tree: { sha: string } }>(
    token,
    `${repoPath}/git/commits/${parentSha}`
  );
  const blobs = await Promise.all(files.map(async (file) => {
    const blob = await githubRequest<{ sha: string }>(
      token,
      `${repoPath}/git/blobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: encodeBase64Utf8(file.content),
          encoding: 'base64'
        })
      }
    );
    return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const tree = await githubRequest<{ sha: string }>(
    token,
    `${repoPath}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs })
    }
  );
  const commit = await githubRequest<{ sha: string }>(
    token,
    `${repoPath}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'chore(data): publish UMEDT local master snapshot',
        tree: tree.sha,
        parents: [parentSha]
      })
    }
  );
  const latestRef = await githubRequest<{ object: { sha: string } }>(token, refPath);
  if (latestRef.object.sha !== parentSha) throw new Error('تغير الفرع أثناء تجهيز النشر. لم يتم تحديث رأس الفرع؛ أعد المحاولة.');
  await githubRequest(
    token,
    `${repoPath}/git/refs/heads/${encodeURIComponent(config.branch)}`,
    { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) }
  );
  return {
    commitSha: commit.sha, filesUpdated: files.length, branch: config.branch,
    repository: `${config.owner}/${config.repository}`
  };
}
