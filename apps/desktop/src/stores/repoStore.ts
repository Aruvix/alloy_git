import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { generateId } from "@alloy/shared";
import { gitApi } from "@alloy/git-core";
import { parseRemoteWithProviders } from "@alloy/provider-core";
import type { GitAccount, GitRepository, LocalRepository, RepositoryGroup } from "@alloy/git-core";
import { getDb } from "./db.js";

export const useRepoStore = defineStore("repo", () => {
  const repos = ref<LocalRepository[]>([]);
  const groups = ref<RepositoryGroup[]>([]);
  const activeRepoId = ref<string | null>(null);
  const loading = ref(false);
  const loaded = ref(false);
  const mappingsHydrated = ref(false);
  const mappingErrors = ref<Record<string, string>>({});

  const activeRepo = computed(() => repos.value.find((r) => r.id === activeRepoId.value) ?? null);

  const groupedRepos = computed(() => {
    const ungrouped = repos.value.filter((r) => !r.groupId);
    const grouped = groups.value.map((g) => ({
      group: g,
      repos: repos.value.filter((r) => r.groupId === g.id),
    }));
    return { ungrouped, grouped };
  });

  async function load() {
    loading.value = true;
    mappingsHydrated.value = false;
    try {
      const d = await getDb();
      const rows = await d.select<LocalRepository[]>(
        `SELECT id, path, name, linked_remote_id as linkedRemoteId,
         linked_account_id as linkedAccountId, workspace_id as workspaceId,
         provider, remote_url as remoteUrl, is_local_only as isLocalOnly,
         added_at as addedAt, last_opened_at as lastOpenedAt,
         is_favorite as isFavorite, group_id as groupId
         FROM local_repositories ORDER BY last_opened_at DESC, added_at DESC`,
      );
      repos.value = rows.map((repo) => ({
        ...repo,
        isFavorite: Boolean(repo.isFavorite),
        isLocalOnly: Boolean(repo.isLocalOnly),
      }));

      const groupRows = await d.select<RepositoryGroup[]>(
        "SELECT id, name, color, created_at as createdAt FROM repository_groups ORDER BY name",
      );
      groups.value = groupRows;
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function hydrateRepositoryMappings(accounts: GitAccount[], cloudRepositories: GitRepository[]) {
    const d = await getDb();
    mappingErrors.value = {};
    const cloudByAccountAndRemote = new Map<string, GitRepository>();
    for (const cloudRepo of cloudRepositories) {
      if (!cloudRepo.gitAccountId) continue;
      for (const url of [cloudRepo.remoteUrl, cloudRepo.sshRemoteUrl, cloudRepo.webUrl]) {
        if (url) cloudByAccountAndRemote.set(`${cloudRepo.gitAccountId}:${normalizeUrl(url)}`, cloudRepo);
      }
    }

    for (const repo of repos.value) {
      try {
        const remoteUrl = await readPrimaryRemoteUrl(repo.path);
        const parsed = remoteUrl ? parseRemoteWithProviders(remoteUrl, accounts) : null;
        let linkedAccountId = repo.linkedAccountId ?? null;
        let linkedRemoteId = repo.linkedRemoteId ?? null;

        if (!linkedAccountId && parsed) {
          const matchedAccount = accounts.find((account) => {
            if (account.provider !== parsed.provider) return false;
            if (!parsed.remoteBaseUrl || !account.remoteBaseUrl) return true;
            return normalizeUrl(account.remoteBaseUrl) === normalizeUrl(parsed.remoteBaseUrl);
          });
          linkedAccountId = matchedAccount?.id ?? null;
        }

        if (linkedAccountId && remoteUrl) {
          const cloudRepo = cloudByAccountAndRemote.get(`${linkedAccountId}:${normalizeUrl(remoteUrl)}`)
            ?? cloudRepositories.find((candidate) => {
              if (candidate.gitAccountId !== linkedAccountId) return false;
              if (parsed && candidate.provider !== parsed.provider) return false;
              return parsed ? candidate.repoFullName.toLowerCase() === parsed.repoFullName.toLowerCase() : false;
            });
          linkedRemoteId = cloudRepo?.id ?? linkedRemoteId;
        }

        const provider = parsed?.provider ?? repo.provider ?? null;
        const isLocalOnly = !remoteUrl;
        await d.execute(
          `UPDATE local_repositories
           SET linked_account_id = ?, linked_remote_id = ?, provider = ?, remote_url = ?, is_local_only = ?
           WHERE id = ?`,
          [linkedAccountId, linkedRemoteId, provider, remoteUrl, isLocalOnly ? 1 : 0, repo.id],
        );
        repo.linkedAccountId = linkedAccountId ?? undefined;
        repo.linkedRemoteId = linkedRemoteId ?? undefined;
        repo.provider = provider ?? undefined;
        repo.remoteUrl = remoteUrl ?? undefined;
        repo.isLocalOnly = isLocalOnly;
      } catch (error) {
        mappingErrors.value = {
          ...mappingErrors.value,
          [repo.id]: String(error),
        };
      }
    }
    mappingsHydrated.value = true;
  }

  async function addRepo(path: string): Promise<LocalRepository> {
    const validation = await invoke<{ name: string; isGitRepo: boolean; path: string }>(
      "repo_validate_path",
      { path },
    );
    if (!validation.isGitRepo) {
      throw new Error(`"${validation.name}" is not a Git repository. Initialize Git in this folder first.`);
    }
    const d = await getDb();
    const existing = await d.select<LocalRepository[]>(
      `SELECT id, path, name, linked_remote_id as linkedRemoteId,
       linked_account_id as linkedAccountId, workspace_id as workspaceId,
       provider, remote_url as remoteUrl, is_local_only as isLocalOnly,
       added_at as addedAt,
       last_opened_at as lastOpenedAt, is_favorite as isFavorite,
       group_id as groupId FROM local_repositories WHERE path = ?`,
      [path],
    );
    if (existing.length > 0) {
      await touchRepo(existing[0].id);
      const repo = {
        ...existing[0],
        isFavorite: Boolean(existing[0].isFavorite),
        isLocalOnly: Boolean(existing[0].isLocalOnly),
      };
      const current = repos.value.find((item) => item.id === repo.id);
      return current ?? repo;
    }
    const id = generateId();
    const now = new Date().toISOString();
    const repo: LocalRepository = {
      id,
      path: validation.path,
      name: validation.name,
      isLocalOnly: true,
      addedAt: now,
      lastOpenedAt: now,
    };
    await d.execute(
      "INSERT INTO local_repositories (id, path, name, is_local_only, added_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?)",
      [repo.id, repo.path, repo.name, 1, repo.addedAt, repo.lastOpenedAt],
    );
    repos.value.unshift(repo);
    return repo;
  }

  async function removeRepo(id: string) {
    const d = await getDb();
    await d.execute("DELETE FROM local_repositories WHERE id = ?", [id]);
    repos.value = repos.value.filter((r) => r.id !== id);
    if (activeRepoId.value === id) activeRepoId.value = null;
  }

  async function touchRepo(id: string) {
    const now = new Date().toISOString();
    const d = await getDb();
    await d.execute("UPDATE local_repositories SET last_opened_at = ? WHERE id = ?", [now, id]);
    const repo = repos.value.find((r) => r.id === id);
    if (repo) repo.lastOpenedAt = now;
  }

  async function toggleFavorite(id: string) {
    const repo = repos.value.find((r) => r.id === id);
    if (!repo) return;
    const next = repo.isFavorite ? 0 : 1;
    const d = await getDb();
    await d.execute("UPDATE local_repositories SET is_favorite = ? WHERE id = ?", [next, id]);
    repo.isFavorite = Boolean(next);
  }

  async function linkRepo(id: string, linkedAccountId: string | null, linkedRemoteId: string | null) {
    const d = await getDb();
    const repo = repos.value.find((r) => r.id === id);
    const isLocalOnly = !linkedAccountId && !repo?.remoteUrl;
    await d.execute(
      "UPDATE local_repositories SET linked_account_id = ?, linked_remote_id = ?, is_local_only = ? WHERE id = ?",
      [linkedAccountId, linkedRemoteId, isLocalOnly ? 1 : 0, id],
    );
    if (repo) {
      repo.linkedAccountId = linkedAccountId ?? undefined;
      repo.linkedRemoteId = linkedRemoteId ?? undefined;
      repo.isLocalOnly = isLocalOnly;
    }
  }

  async function openDialog(): Promise<LocalRepository | null> {
    const path = await invoke<string | null>("repo_open_dialog");
    if (!path) return null;
    return addRepo(path);
  }

  function setActiveRepo(id: string) {
    activeRepoId.value = id;
    touchRepo(id);
  }

  return {
    repos,
    groups,
    activeRepoId,
    activeRepo,
    groupedRepos,
    loading,
    loaded,
    mappingsHydrated,
    mappingErrors,
    load,
    hydrateRepositoryMappings,
    addRepo,
    removeRepo,
    touchRepo,
    toggleFavorite,
    linkRepo,
    openDialog,
    setActiveRepo,
  };
});

async function readPrimaryRemoteUrl(repoPath: string): Promise<string | null> {
  try {
    const remotes = await gitApi.remotes(repoPath);
    return remotes.find((remote) => remote.name === "origin" && remote.direction === "fetch")?.url
      ?? remotes.find((remote) => remote.direction === "fetch")?.url
      ?? remotes[0]?.url
      ?? null;
  } catch {
    return null;
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}
