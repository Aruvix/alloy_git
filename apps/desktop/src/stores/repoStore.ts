import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { generateId } from "@alloy/shared";
import type { LocalRepository, RepositoryGroup } from "@alloy/git-core";

let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function getDb() {
  if (!db) db = await Database.load("sqlite:alloy.db");
  return db;
}

export const useRepoStore = defineStore("repo", () => {
  const repos = ref<LocalRepository[]>([]);
  const groups = ref<RepositoryGroup[]>([]);
  const activeRepoId = ref<string | null>(null);
  const loading = ref(false);

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
    const d = await getDb();
    const rows = await d.select<LocalRepository[]>(
      "SELECT id, path, name, linked_remote_id as linkedRemoteId, linked_account_id as linkedAccountId, added_at as addedAt, last_opened_at as lastOpenedAt, is_favorite as isFavorite, group_id as groupId FROM local_repositories ORDER BY last_opened_at DESC, added_at DESC",
    );
    repos.value = rows;
    repos.value = rows.map((repo) => ({
      ...repo,
      isFavorite: Boolean(repo.isFavorite),
    }));

    const groupRows = await d.select<RepositoryGroup[]>(
      "SELECT id, name, color, created_at as createdAt FROM repository_groups ORDER BY name",
    );
    groups.value = groupRows;
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
       linked_account_id as linkedAccountId, added_at as addedAt,
       last_opened_at as lastOpenedAt, is_favorite as isFavorite,
       group_id as groupId FROM local_repositories WHERE path = ?`,
      [path],
    );
    if (existing.length > 0) {
      await touchRepo(existing[0].id);
      const repo = {
        ...existing[0],
        isFavorite: Boolean(existing[0].isFavorite),
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
      addedAt: now,
      lastOpenedAt: now,
    };
    await d.execute(
      "INSERT INTO local_repositories (id, path, name, added_at, last_opened_at) VALUES (?, ?, ?, ?, ?)",
      [repo.id, repo.path, repo.name, repo.addedAt, repo.lastOpenedAt],
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
    await d.execute(
      "UPDATE local_repositories SET linked_account_id = ?, linked_remote_id = ? WHERE id = ?",
      [linkedAccountId, linkedRemoteId, id],
    );
    const repo = repos.value.find((r) => r.id === id);
    if (repo) {
      repo.linkedAccountId = linkedAccountId ?? undefined;
      repo.linkedRemoteId = linkedRemoteId ?? undefined;
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
    load,
    addRepo,
    removeRepo,
    touchRepo,
    toggleFavorite,
    linkRepo,
    openDialog,
    setActiveRepo,
  };
});
