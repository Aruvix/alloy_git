import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { generateId } from "@alloy/shared";
import { getProviderClient, parseRemoteWithProviders } from "@alloy/provider-core";
import { DEFAULT_GLOBAL_GIT_CONFIG, normalizeGlobalGitConfig, repositoriesForAccount as filterRepositoriesForAccount } from "@alloy/git-core";
import type { GitAccount, GitProvider, GitCredentialType, GitRepository, GlobalGitConfig } from "@alloy/git-core";

let db: Awaited<ReturnType<typeof Database.load>> | null = null;
let schemaReady = false;
async function getDb() {
  if (!db) db = await Database.load("sqlite:alloy.db");
  if (!schemaReady) {
    await ensureSchema(db);
    schemaReady = true;
  }
  return db;
}

async function ensureSchema(database: Awaited<ReturnType<typeof Database.load>>) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS cloud_repositories (
      id TEXT NOT NULL,
      git_account_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      repo_name TEXT NOT NULL,
      repo_full_name TEXT NOT NULL,
      owner TEXT,
      remote_url TEXT NOT NULL,
      ssh_remote_url TEXT,
      web_url TEXT,
      default_branch TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'unknown',
      local_path TEXT,
      last_synced_at TEXT,
      updated_at TEXT,
      PRIMARY KEY (id, git_account_id)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS provider_metadata (
      provider TEXT NOT NULL,
      remote_base_url TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, remote_base_url)
    )
  `);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS workspace_indexes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    )
  `);
  try {
    await database.execute("ALTER TABLE global_git_config ADD COLUMN default_repository_id TEXT");
  } catch {
    // Column already exists in fresh databases.
  }
  for (const statement of [
    "ALTER TABLE cloud_repositories ADD COLUMN owner TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN ssh_remote_url TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN web_url TEXT",
    "ALTER TABLE cloud_repositories ADD COLUMN updated_at TEXT",
  ]) {
    try {
      await database.execute(statement);
    } catch {
      // Column already exists in fresh databases.
    }
  }
}

export const useAccountStore = defineStore("account", () => {
  const accounts = ref<GitAccount[]>([]);
  const repositories = ref<GitRepository[]>([]);
  const globalConfig = ref<GlobalGitConfig>({ ...DEFAULT_GLOBAL_GIT_CONFIG });
  const loading = ref(false);

  async function load() {
    const d = await getDb();
    const rows = await d.select<GitAccount[]>(
      `SELECT id, name, provider, username, email, remote_base_url as remoteBaseUrl,
       auth_type as authType, ssh_key_path as sshKeyPath,
       use_system_credentials as useSystemCredentials, avatar_url as avatarUrl,
       status, validation_message as validationMessage, scopes, repository_count as repositoryCount,
       last_authenticated_at as lastAuthenticatedAt, created_at as createdAt, updated_at as updatedAt
       FROM git_accounts ORDER BY created_at DESC`,
    );
    accounts.value = rows.map((r) => ({
      ...r,
      useSystemCredentials: Boolean(r.useSystemCredentials),
      scopes: r.scopes ? JSON.parse(r.scopes as unknown as string) : undefined,
    }));

    const repoRows = await d.select<GitRepository[]>(
      `SELECT id, git_account_id as gitAccountId, provider, repo_name as repoName,
       repo_full_name as repoFullName, owner, remote_url as remoteUrl,
       ssh_remote_url as sshRemoteUrl, web_url as webUrl,
       default_branch as defaultBranch, visibility, local_path as localPath,
       last_synced_at as lastSyncedAt, updated_at as updatedAt
       FROM cloud_repositories ORDER BY repo_full_name`,
    );
    repositories.value = repoRows;
    await loadGlobalConfig();
    await normalizeGlobalConfig();
  }

  async function loadGlobalConfig() {
    const d = await getDb();
    const rows = await d.select<Array<Record<string, string | number | null>>>(
      "SELECT * FROM global_git_config WHERE id = 1",
    );
    const row = rows[0];
    if (!row) return;
    globalConfig.value = {
      defaultAccountId: (row.default_account_id as string | null) ?? null,
      defaultRepositoryId: (row.default_repository_id as string | null) ?? null,
      authorName: String(row.author_name ?? ""),
      authorEmail: String(row.author_email ?? ""),
      defaultBranch: String(row.default_branch ?? "main") || "main",
      defaultCloneDirectory: String(row.default_clone_directory ?? ""),
      autoPullBeforePush: Boolean(row.auto_pull_before_push),
      autoCommitMessageTemplate: String(row.auto_commit_message_template ?? ""),
      secretScanMode: row.secret_scan_mode === "block" || row.secret_scan_mode === "off" ? row.secret_scan_mode : "warn",
    };
  }

  async function saveGlobalConfig(config: Partial<GlobalGitConfig>) {
    globalConfig.value = normalizeGlobalGitConfig({ ...globalConfig.value, ...config }, accounts.value, repositories.value);
    const d = await getDb();
    await d.execute(
      `INSERT OR REPLACE INTO global_git_config (
        id, default_account_id, default_repository_id, author_name, author_email,
        default_branch, default_clone_directory, auto_pull_before_push,
        auto_commit_message_template, secret_scan_mode
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        globalConfig.value.defaultAccountId,
        globalConfig.value.defaultRepositoryId,
        globalConfig.value.authorName,
        globalConfig.value.authorEmail,
        globalConfig.value.defaultBranch,
        globalConfig.value.defaultCloneDirectory,
        globalConfig.value.autoPullBeforePush ? 1 : 0,
        globalConfig.value.autoCommitMessageTemplate,
        globalConfig.value.secretScanMode,
      ],
    );
  }

  async function normalizeGlobalConfig() {
    const normalized = normalizeGlobalGitConfig(globalConfig.value, accounts.value, repositories.value);
    if (
      normalized.defaultAccountId !== globalConfig.value.defaultAccountId ||
      normalized.defaultRepositoryId !== globalConfig.value.defaultRepositoryId ||
      normalized.defaultBranch !== globalConfig.value.defaultBranch
    ) {
      await saveGlobalConfig(normalized);
    } else {
      globalConfig.value = normalized;
    }
  }

  async function setDefaultAccount(accountId: string | null) {
    const nextAccountId = accountId && accounts.value.some((account) => account.id === accountId) ? accountId : null;
    const nextRepositoryId = repositories.value.some((repo) => repo.id === globalConfig.value.defaultRepositoryId && repo.gitAccountId === nextAccountId)
      ? globalConfig.value.defaultRepositoryId
      : null;
    await saveGlobalConfig({ defaultAccountId: nextAccountId, defaultRepositoryId: nextRepositoryId });
  }

  async function setDefaultRepository(repositoryId: string | null) {
    const repo = repositoryId ? repositories.value.find((item) => item.id === repositoryId) : null;
    await saveGlobalConfig({
      defaultAccountId: repo?.gitAccountId ?? globalConfig.value.defaultAccountId,
      defaultRepositoryId: repo?.id ?? null,
    });
  }

  async function addAccount(params: {
    name: string;
    provider: GitProvider;
    authType: GitCredentialType;
    token?: string;
    remoteBaseUrl?: string;
    sshKeyPath?: string;
    useSystemCredentials?: boolean;
  }): Promise<GitAccount> {
    const id = generateId();
    const now = new Date().toISOString();
    const account: GitAccount = {
      id,
      name: params.name,
      provider: params.provider,
      authType: params.authType,
      remoteBaseUrl: params.remoteBaseUrl,
      sshKeyPath: params.sshKeyPath,
      useSystemCredentials: params.useSystemCredentials,
      status: "untested",
      createdAt: now,
      updatedAt: now,
    };
    const d = await getDb();
    await d.execute(
      `INSERT INTO git_accounts (id, name, provider, auth_type, remote_base_url, ssh_key_path, use_system_credentials, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, account.name, account.provider, account.authType, account.remoteBaseUrl ?? null, account.sshKeyPath ?? null, account.useSystemCredentials ? 1 : 0, account.status, now, now],
    );
    if (params.token) {
      await invoke("vault_store", { key: `account:${id}`, value: params.token });
    }
    accounts.value.unshift(account);
    if (!globalConfig.value.defaultAccountId) await setDefaultAccount(account.id);
    return account;
  }

  async function validateAccount(id: string) {
    const account = accounts.value.find((a) => a.id === id);
    if (!account) throw new Error("Account not found");
    loading.value = true;
    try {
      let token: string | undefined;
      try {
        token = await invoke<string>("vault_load", { key: `account:${id}` });
      } catch {
        // no stored token (SSH or system creds)
      }
      const client = getProviderClient(account.provider, account.remoteBaseUrl);
      const result = await client.validateAuth({ authType: account.authType, token, remoteBaseUrl: account.remoteBaseUrl });
      const now = new Date().toISOString();
      const updates: Partial<GitAccount> = {
        status: result.status,
        validationMessage: result.message,
        username: result.profile?.username,
        email: result.profile?.email,
        avatarUrl: result.profile?.avatarUrl,
        scopes: result.profile?.scopes,
        repositoryCount: result.repositories.length,
        lastAuthenticatedAt: result.status === "connected" ? now : account.lastAuthenticatedAt,
        updatedAt: now,
      };
      const d = await getDb();
      await d.execute(
        `UPDATE git_accounts SET status=?, validation_message=?, username=?, email=?, avatar_url=?, scopes=?, repository_count=?, last_authenticated_at=?, updated_at=? WHERE id=?`,
        [updates.status, updates.validationMessage, updates.username ?? null, updates.email ?? null, updates.avatarUrl ?? null, JSON.stringify(updates.scopes ?? []), updates.repositoryCount ?? null, updates.lastAuthenticatedAt ?? null, now, id],
      );
      if (result.status === "connected") await saveRepositories(id, result.repositories);
      Object.assign(account, updates);
    } finally {
      loading.value = false;
    }
  }

  async function syncRepositories(accountId: string) {
    const account = accounts.value.find((a) => a.id === accountId);
    if (!account) throw new Error("Account not found");
    loading.value = true;
    try {
      const token = await getToken(accountId);
      const client = getProviderClient(account.provider, account.remoteBaseUrl);
      const discovered = await client.listRepositories({ authType: account.authType, token, remoteBaseUrl: account.remoteBaseUrl });
      await saveRepositories(accountId, discovered);
      const now = new Date().toISOString();
      const d = await getDb();
      await d.execute(
        "UPDATE git_accounts SET repository_count = ?, updated_at = ? WHERE id = ?",
        [discovered.length, now, accountId],
      );
      account.repositoryCount = discovered.length;
      account.updatedAt = now;
      return discovered.length;
    } finally {
      loading.value = false;
    }
  }

  async function saveRepositories(accountId: string, discovered: Omit<GitRepository, "gitAccountId">[]) {
    const d = await getDb();
    await d.execute("DELETE FROM cloud_repositories WHERE git_account_id = ?", [accountId]);
    const now = new Date().toISOString();
    for (const repo of discovered) {
      await d.execute(
        `INSERT INTO cloud_repositories (
          id, git_account_id, provider, repo_name, repo_full_name, owner,
          remote_url, ssh_remote_url, web_url, default_branch, visibility,
          local_path, last_synced_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          repo.id,
          accountId,
          repo.provider,
          repo.repoName,
          repo.repoFullName,
          repo.owner ?? null,
          repo.remoteUrl,
          repo.sshRemoteUrl ?? null,
          repo.webUrl ?? null,
          repo.defaultBranch,
          repo.visibility,
          repo.localPath ?? null,
          now,
          repo.updatedAt ?? null,
        ],
      );
    }
    repositories.value = [
      ...repositories.value.filter((repo) => repo.gitAccountId !== accountId),
      ...discovered.map((repo) => ({ ...repo, gitAccountId: accountId, lastSyncedAt: now })),
    ];
    await normalizeGlobalConfig();
  }

  async function removeAccount(id: string) {
    const d = await getDb();
    await d.execute("DELETE FROM git_accounts WHERE id = ?", [id]);
    await d.execute("DELETE FROM cloud_repositories WHERE git_account_id = ?", [id]);
    try { await invoke("vault_delete", { key: `account:${id}` }); } catch { /* already gone */ }
    accounts.value = accounts.value.filter((a) => a.id !== id);
    repositories.value = repositories.value.filter((repo) => repo.gitAccountId !== id);
    await normalizeGlobalConfig();
  }

  async function getToken(id: string): Promise<string | undefined> {
    try {
      return await invoke<string>("vault_load", { key: `account:${id}` });
    } catch {
      return undefined;
    }
  }

  function repositoriesForAccount(accountId: string | null | undefined) {
    return filterRepositoriesForAccount(repositories.value, accountId);
  }

  function findRepositoryMatch(remoteUrl: string) {
    const parsed = parseRemoteWithProviders(remoteUrl, accounts.value);
    if (!parsed) return null;
    const normalizedFullName = parsed.repoFullName.toLowerCase();
    const account = accounts.value.find((candidate) => {
      if (candidate.provider !== parsed.provider) return false;
      if (!parsed.remoteBaseUrl || !candidate.remoteBaseUrl) return true;
      return trimUrl(candidate.remoteBaseUrl) === trimUrl(parsed.remoteBaseUrl);
    }) ?? null;
    const repo = repositories.value.find((candidate) => {
      if (account && candidate.gitAccountId !== account.id) return false;
      if (candidate.provider !== parsed.provider) return false;
      return candidate.repoFullName.toLowerCase() === normalizedFullName;
    }) ?? null;
    return { parsed, account, repository: repo };
  }

  function bestCloneUrl(repository: GitRepository, protocol: "https" | "ssh") {
    return protocol === "ssh" ? repository.sshRemoteUrl || repository.remoteUrl : repository.remoteUrl || repository.sshRemoteUrl || repository.webUrl || "";
  }

  return {
    accounts,
    repositories,
    globalConfig,
    loading,
    load,
    loadGlobalConfig,
    saveGlobalConfig,
    setDefaultAccount,
    setDefaultRepository,
    repositoriesForAccount,
    addAccount,
    validateAccount,
    syncRepositories,
    saveRepositories,
    removeAccount,
    getToken,
    findRepositoryMatch,
    bestCloneUrl,
  };
});

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
