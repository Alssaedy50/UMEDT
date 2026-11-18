/**
 * Direct GitHub repository management for UMEDT.
 * Secrets are persisted only through the native Android Keystore bridge.
 */
const REPOSITORY_OWNER = 'Alssaedy50';
const REPOSITORY_NAME = 'UMEDT-DATA';
const DEFAULT_BRANCH = 'main';
const TOKEN_STORAGE_KEY = 'umedt_github_pat_aks_v1';

type NativeSecretBridge = {
  encryptSecretWithKeystore?: (plainText: string) => string;
  decryptSecretWithKeystore?: (cipherText: string) => string;
};

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

export async function testGitHubConnection(tokenOverride?: string): Promise<{
  repository: string;
  branch: string;
  canWrite: boolean;
}> {
  const token = (tokenOverride || loadGitHubToken()).trim();
  if (!token) throw new Error('أدخل التوكن واحفظه أولاً.');
  const repo = await githubRequest<{
    full_name: string;
    default_branch: string;
    permissions?: { push?: boolean; admin?: boolean };
  }>(token, `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}`);
  if (!repo.permissions?.push) {
    throw new Error('التوكن متصل، لكنه لا يمتلك صلاحية الكتابة على مستودع UMEDT-DATA.');
  }
  return {
    repository: repo.full_name,
    branch: repo.default_branch || DEFAULT_BRANCH,
    canWrite: true
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
  commitSha: string;
  filesUpdated: number;
  branch: string;
}> {
  const token = loadGitHubToken();
  if (!token) throw new Error('لا يوجد GitHub Token محفوظ. أضفه من إعدادات إدارة المستودع.');
  await testGitHubConnection(token);

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
  const required = files.slice(0, 5);
  for (const file of required) {
    const parsed = JSON.parse(file.content) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`بيانات غير صالحة في ${file.path}`);
  }
  if (snapshot.terms.length + snapshot.sentences.length + snapshot.topics.length +
      snapshot.customAffixes.length + snapshot.customAbbreviations.length === 0) {
    throw new Error('تم إيقاف النشر لأن مجموع البيانات الأساسية فارغ.');
  }

  const ref = await githubRequest<{ object: { sha: string } }>(
    token,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/ref/heads/${DEFAULT_BRANCH}`
  );
  const parentSha = ref.object.sha;
  const parent = await githubRequest<{ tree: { sha: string } }>(
    token,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits/${parentSha}`
  );
  const blobs = await Promise.all(files.map(async (file) => {
    const blob = await githubRequest<{ sha: string }>(
      token,
      `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/blobs`,
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
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs })
    }
  );
  const commit = await githubRequest<{ sha: string }>(
    token,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: 'chore(data): publish UMEDT local master snapshot',
        tree: tree.sha,
        parents: [parentSha]
      })
    }
  );
  await githubRequest(
    token,
    `/repos/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/git/refs/heads/${DEFAULT_BRANCH}`,
    { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) }
  );
  return { commitSha: commit.sha, filesUpdated: files.length, branch: DEFAULT_BRANCH };
}
