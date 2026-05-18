<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useAccountStore } from "../stores/accountStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { groupRepositoriesByOwner, buildRepositoryViewModels } from "../utils/repoGrouping.js";

const router = useRouter();
const route = useRoute();
const repoStore = useRepoStore();
const accountStore = useAccountStore();
const uiStore = useUiStore();
const statusStore = useGitStatusStore();

const sidebarFilter = ref("");
const collapsedGroups = ref<Set<string>>(new Set());

function toggleGroup(key: string) {
  if (collapsedGroups.value.has(key)) {
    collapsedGroups.value.delete(key);
  } else {
    collapsedGroups.value.add(key);
  }
}

const filteredRepos = computed(() => {
  const q = sidebarFilter.value.trim().toLowerCase();
  const scope = uiStore.repositoryScope;
  let repos = repoStore.repos;

  if (scope.type === "account") {
    repos = repos.filter((r) => r.linkedAccountId === scope.id);
  } else if (scope.type === "local") {
    repos = repos.filter((r) => !r.linkedAccountId);
  }
  if (!q) return repos;
  return repos.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
});

const favoriteRepos = computed(() => filteredRepos.value.filter((r) => r.isFavorite));
const repoViews = computed(() => buildRepositoryViewModels(filteredRepos.value, accountStore.accounts, accountStore.repositories));
const viewByRepoId = computed(() => new Map(repoViews.value.map((view) => [view.repo.id, view])));
const repoGroups = computed(() => groupRepositoriesByOwner(filteredRepos.value, accountStore.accounts, accountStore.repositories));

function selectRepo(id: string) {
  repoStore.setActiveRepo(id);
  const tab = route.path.includes("/repositories/") ? route.path.split("/").pop() ?? "overview" : "overview";
  router.push(`/repositories/${id}/${tab}`);
}

function isActiveRepo(id: string) {
  return repoStore.activeRepoId === id;
}

function repoDot(repo: typeof repoStore.repos[0]): "blue" | "green" | "orange" | "red" | "gray" {
  if (isActiveRepo(repo.id)) return "blue";
  const status = repo.id === repoStore.activeRepoId ? statusStore.status : null;
  if (status?.conflictedFiles?.length) return "red";
  if (!repo.linkedAccountId) return "gray";
  if (status && (status.behind > 0 || status.changes.length > 0)) return "orange";
  return "green";
}

function repoStatusText(repo: typeof repoStore.repos[0]): string {
  if (isActiveRepo(repo.id) && statusStore.status) {
    const s = statusStore.status;
    const parts: string[] = [];
    if (s.branch) parts.push(s.branch);
    if (s.ahead > 0) parts.push(`${s.ahead} ahead`);
    if (s.behind > 0) parts.push(`${s.behind} behind`);
    if (s.conflictedFiles?.length) parts.push("conflict");
    if (s.changes.length > 0) parts.push(`${s.changes.length} changed`);
    return parts.join(" · ") || `${s.branch ?? "main"} · up to date`;
  }
  if (!repo.linkedAccountId) return "no remote";
  return `${viewByRepoId.value.get(repo.id)?.branchLabel ?? "main"} · up to date`;
}

function groupEyebrow(kind: string) {
  if (kind === "organization") return "ORGANIZATION";
  if (kind === "personal") return "PERSONAL";
  return "LOCAL ONLY";
}
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed: uiStore.sidebarCollapsed }"
    :style="uiStore.sidebarCollapsed ? {} : { width: uiStore.sidebarWidth + 'px' }"
  >
    <!-- Sidebar header -->
    <div class="sidebar-top">
      <span class="sidebar-title">Repositories</span>
      <div class="sidebar-top-actions">
        <button class="icon-btn" title="Add repository" @click="uiStore.openAddRepoModal()">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button class="icon-btn" title="Toggle sidebar" @click="uiStore.toggleSidebar">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
            <path d="M1 2h12v1.5H1zm0 4h12v1.5H1zm0 4h12V11.5H1z"/>
          </svg>
        </button>
      </div>
    </div>

    <template v-if="!uiStore.sidebarCollapsed">
      <!-- Search -->
      <div class="sidebar-search-wrap">
        <input
          v-model="sidebarFilter"
          class="sidebar-search"
          placeholder="Filter repositories…"
        />
      </div>

      <!-- Quick links -->
      <div class="quick-links">
        <button
          class="quick-link"
          :class="{ active: uiStore.repositoryScope.type === 'all' }"
          @click="uiStore.setRepositoryScope({ type: 'all' })"
        >
          <span class="quick-link-label">All Repositories</span>
          <span class="quick-link-count">{{ repoStore.repos.length }}</span>
        </button>
        <button
          class="quick-link"
          :class="{ active: false }"
        >
          <span class="quick-link-label">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" style="opacity:0.7">
              <path d="M6 1l1.5 3.1 3.4.5-2.5 2.4.6 3.4L6 8.9l-3 1.5.6-3.4L1.1 4.6l3.4-.5z"/>
            </svg>
            Favorites
          </span>
          <span class="quick-link-count">{{ favoriteRepos.length }}</span>
        </button>
        <button
          class="quick-link"
          :class="{ active: uiStore.repositoryScope.type === 'local' }"
          @click="uiStore.setRepositoryScope({ type: 'local' })"
        >
          <span class="quick-link-label">Local Only</span>
          <span class="quick-link-count">{{ repoStore.repos.filter((repo) => !repo.linkedAccountId).length }}</span>
        </button>
      </div>

      <!-- Repo groups -->
      <div class="repo-list">
        <!-- Account/Local groups -->
        <template v-for="group in repoGroups" :key="group.key">
          <div class="group-eyebrow">{{ groupEyebrow(group.kind) }}</div>
          <div class="group-header" @click="toggleGroup(group.key)">
            <svg class="group-chevron" :class="{ collapsed: collapsedGroups.has(group.key) }"
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
              <path d="M2.5 4L5 6.5 7.5 4"/>
            </svg>
            <span class="group-label" :class="{ local: group.kind === 'local' }">{{ group.label }}</span>
            <span class="group-count">{{ group.repos.length }}</span>
          </div>
          <div v-if="!collapsedGroups.has(group.key)" class="group-repos">
            <div
              v-for="repo in group.repos"
              :key="repo.id"
              class="repo-item"
              :class="{ active: isActiveRepo(repo.id) }"
              role="button"
              tabindex="0"
              @click="selectRepo(repo.id)"
              @keydown.enter.prevent="selectRepo(repo.id)"
              @keydown.space.prevent="selectRepo(repo.id)"
            >
              <span class="repo-dot" :class="repoDot(repo)" />
              <span class="repo-item-body">
                <span class="repo-name">{{ repo.name }}</span>
                <span v-if="repoStatusText(repo)" class="repo-status">{{ repoStatusText(repo) }}</span>
              </span>
              <button
                class="fav-btn"
                type="button"
                :class="{ active: repo.isFavorite }"
                :title="repo.isFavorite ? 'Remove from favorites' : 'Add to favorites'"
                @click.stop="repoStore.toggleFavorite(repo.id)"
              >{{ repo.isFavorite ? '★' : '☆' }}</button>
            </div>
          </div>
        </template>

        <!-- Empty state -->
        <div v-if="repoGroups.length === 0" class="sidebar-empty">
          <p>No repositories yet.</p>
          <button class="sidebar-empty-btn" @click="uiStore.openAddRepoModal()">Add Repository</button>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.sidebar {
  flex-shrink: 0;
  background: var(--surface-1);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.sidebar.collapsed {
  width: 44px !important;
}

/* ── Top ── */
.sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sidebar.collapsed .sidebar-top {
  justify-content: center;
  padding: 10px;
}
.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.sidebar.collapsed .sidebar-title { display: none; }

.sidebar-top-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.sidebar.collapsed .sidebar-top-actions { flex-direction: column; }

.icon-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { color: var(--text); background: var(--surface-2); }

/* ── Search ── */
.sidebar-search-wrap {
  padding: 8px 8px 4px;
  flex-shrink: 0;
}
.sidebar-search {
  width: 100%;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--text);
  font-size: 12px;
  padding: 0 9px;
}
.sidebar-search::placeholder { color: var(--text-subtle); }

/* ── Quick links ── */
.quick-links {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.quick-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 27px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 80ms, color 80ms;
}
.quick-link:hover { background: var(--surface-2); color: var(--text); }
.quick-link.active { background: var(--accent-subtle); color: var(--accent); }
.quick-link-label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 500;
}
.quick-link-count {
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-3);
  color: var(--text-muted);
  border-radius: 999px;
  padding: 0 5px;
  line-height: 16px;
}

/* ── Repo list ── */
.repo-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 6px 12px;
}
.group-eyebrow {
  padding: 12px 8px 0;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-subtle);
  letter-spacing: 0.08em;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 8px 4px;
  cursor: pointer;
  user-select: none;
}
.group-chevron {
  flex-shrink: 0;
  color: var(--text-subtle);
  transition: transform 150ms;
}
.group-chevron.collapsed { transform: rotate(-90deg); }
.group-label {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-label.local { color: var(--text-subtle); }
.group-count {
  font-size: 10px;
  color: var(--text-subtle);
  font-weight: 500;
}

.group-repos {
  margin-bottom: 4px;
}

.repo-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 34px;
  padding: 5px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 80ms;
  position: relative;
}
.repo-item:hover { background: var(--surface-2); }
.repo-item.active { background: var(--accent-subtle); }
.repo-item:hover .fav-btn { opacity: 1; }

/* Status dot */
.repo-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--text-subtle);
}
.repo-dot.blue { background: var(--accent); }
.repo-dot.green { background: var(--added); }
.repo-dot.orange { background: var(--modified); }
.repo-dot.red { background: var(--deleted); }
.repo-dot.gray { background: var(--text-subtle); }

.repo-item-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.repo-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-item.active .repo-name { color: var(--accent); }
.repo-status {
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fav-btn {
  opacity: 0;
  background: none;
  border: none;
  color: var(--modified);
  font-size: 11px;
  cursor: pointer;
  padding: 2px;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1;
  transition: opacity 100ms;
}
.fav-btn.active { opacity: 1; }
.fav-btn:hover { background: var(--surface-3); }

.sidebar-empty {
  text-align: center;
  padding: 24px 12px;
  color: var(--text-muted);
  font-size: 12px;
}
.sidebar-empty p { margin: 0 0 10px; }
.sidebar-empty-btn {
  border: 1px dashed var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 14px;
}
</style>
