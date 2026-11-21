/**
 * Read-only access to the public UMEDT-DATA dictionary.
 * The mobile application can download dictionary data but cannot publish or
 * modify repository content. Backups are handled separately through Telegram.
 */
const DEFAULT_REPOSITORY_OWNER = 'Alssaedy50';
const DEFAULT_REPOSITORY_NAME = 'UMEDT-DATA';
const DEFAULT_BRANCH = 'main';
const REPOSITORY_CONFIG_STORAGE_KEY = 'umedt_github_repository_config_v1';
const LEGACY_TOKEN_STORAGE_KEY = 'umedt_github_pat_aks_v1';

export type GitHubRepositoryConfig = {
  owner: string;
  repository: string;
  branch: string;
};

function validateRepositoryConfig(config: GitHubRepositoryConfig): GitHubRepositoryConfig {
  const owner = String(config.owner || '').trim();
  const repository = String(config.repository || '').trim();
  const branch = String(config.branch || '').trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
    throw new Error('اسم مالك المستودع غير صالح.');
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repository) || repository === '.' || repository === '..') {
    throw new Error('اسم المستودع غير صالح.');
  }
  if (!branch || branch.length > 255 || /\s/.test(branch) || /[~^:?*\\]/.test(branch) ||
      branch.includes('[') || branch.includes(']') || branch.startsWith('/') ||
      branch.endsWith('/') || branch.includes('//') || branch.includes('..') ||
      branch.includes('@{') || branch.endsWith('.')) {
    throw new Error('اسم الفرع غير صالح وفق قواعد Git.');
  }
  return { owner, repository, branch };
}

export function loadGitHubRepositoryConfig(): GitHubRepositoryConfig {
  const fallback = {
    owner: DEFAULT_REPOSITORY_OWNER,
    repository: DEFAULT_REPOSITORY_NAME,
    branch: DEFAULT_BRANCH
  };
  try {
    // Remove legacy write credentials from devices upgrading from older builds.
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
      const raw = localStorage.getItem(REPOSITORY_CONFIG_STORAGE_KEY);
      return raw ? validateRepositoryConfig({ ...fallback, ...JSON.parse(raw) }) : fallback;
    }
  } catch {
    // Fall back to the canonical public dictionary repository.
  }
  return fallback;
}

export function getConfiguredGitHubRawUrl(filePath: string): string {
  const config = loadGitHubRepositoryConfig();
  const branchPath = config.branch.split('/').map(encodeURIComponent).join('/');
  const safeFilePath = filePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}/${branchPath}/${safeFilePath}`;
}
