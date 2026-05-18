<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useGitBranchStore } from "../stores/gitBranchStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { useUiStore } from "../stores/uiStore.js";
import Button from "../components/ui/Button.vue";
import BranchRow from "../components/BranchRow.vue";
import type { GitBranchInfo } from "@alloy/git-core";

type Tab = "all" | "local" | "remote" | "merged";

const route = useRoute();
const repoStore = useRepoStore();
const branchStore = useGitBranchStore();
const statusStore = useGitStatusStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((repo) => repo.id === route.params.repoId)?.path ?? "");
const tab = ref<Tab>("all");
const search = ref("");
const typeFilter = ref("all");
const sortMode = ref("recent");
const newBranchName = ref("");
const creating = ref(false);
const busy = ref<string | null>(null);

onMounted(() => {
  if (repoPath.value) void branchStore.load(repoPath.value);
});

const currentBranch = computed(() => branchStore.currentBranch);
const localBranches = computed(() => branchStore.localBranches.filter((branch) => !branch.isCurrent));
const remoteBranches = computed(() => branchStore.remoteBranches);

const allCount = computed(() => branchStore.branches.length);
const localCount = computed(() => branchStore.localBranches.length);
const remoteCount = computed(() => branchStore.remoteBranches.length);
const mergedCount = computed(() => branchStore.branches.filter((b) => b.status === "up_to_date" && !b.isCurrent && !b.isRemote).length);

function applyFilters(branches: typeof branchStore.branches) {
  const query = search.value.trim().toLowerCase();
  if (typeFilter.value === "protected") branches = branches.filter((b) => b.isProtected || b.isDefault);
  if (typeFilter.value === "ahead") branches = branches.filter((b) => b.ahead > 0);
  if (typeFilter.value === "behind") branches = branches.filter((b) => b.behind > 0);
  if (query) branches = branches.filter((b) => [b.name, b.shortName, b.upstream ?? ""].some((v) => v.toLowerCase().includes(query)));
  return branches.sort(sortBranches);
}

const visibleLocal = computed(() => applyFilters(localBranches.value));
const visibleRemote = computed(() => applyFilters(remoteBranches.value));
const visibleBranches = computed(() => {
  let branches = branchStore.branches.filter((branch) => !branch.isCurrent);
  if (tab.value === "local") branches = localBranches.value;
  else if (tab.value === "remote") branches = remoteBranches.value;
  else if (tab.value === "merged") branches = branches.filter((branch) => branch.status === "up_to_date" && !branch.isCurrent && !branch.isRemote);
  return applyFilters(branches);
});

function sortBranches(a: GitBranchInfo, b: GitBranchInfo) {
  if (sortMode.value === "name") return a.name.localeCompare(b.name);
  if (sortMode.value === "status") return statusLabel(a).localeCompare(statusLabel(b));
  const aDate = Date.parse(a.lastUsedAt ?? a.lastCommitDate ?? "");
  const bDate = Date.parse(b.lastUsedAt ?? b.lastCommitDate ?? "");
  return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
}

function statusLabel(branch: GitBranchInfo) {
  if (branch.status === "no_upstream") return "No upstream";
  if (branch.ahead > 0 && branch.behind > 0) return `${branch.ahead} ahead · ${branch.behind} behind`;
  if (branch.ahead > 0) return `${branch.ahead} ahead`;
  if (branch.behind > 0) return `${branch.behind} behind`;
  return "Up to date";
}

async function checkout(branch: GitBranchInfo) {
  if (branch.isCurrent) return;
  if (statusStore.status?.changes.length && !window.confirm("You have uncommitted changes. Checkout may fail or require stash. Continue?")) return;
  busy.value = `checkout:${branch.name}`;
  try {
    await branchStore.checkout(repoPath.value, branch.name);
    await statusStore.refresh(repoPath.value);
    uiStore.notify("success", `Switched to ${branch.name}`);
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    busy.value = null;
  }
}

async function createBranch() {
  const name = newBranchName.value.trim();
  if (!name) return;
  if (branchStore.branches.some((branch) => branch.name === name)) {
    uiStore.notify("error", "Branch already exists.");
    return;
  }
  creating.value = true;
  try {
    await branchStore.createFromPayload(repoPath.value, {
      name,
      from: currentBranch.value?.name ?? "",
      checkout: true,
      pushToRemote: false,
    });
    await statusStore.refresh(repoPath.value);
    uiStore.notify("success", `Created ${name}`);
    newBranchName.value = "";
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    creating.value = false;
  }
}

async function deleteBranch(branch: GitBranchInfo) {
  if (branch.isCurrent) {
    uiStore.notify("error", "Cannot delete current branch.");
    return;
  }
  if (branch.isDefault || branch.isProtected) {
    uiStore.notify("error", "Cannot delete protected or default branch.");
    return;
  }
  if (!window.confirm(`Delete ${branch.name}? This action cannot be undone.`)) return;
  busy.value = `delete:${branch.name}`;
  try {
    await branchStore.remove(repoPath.value, branch.name);
    uiStore.notify("success", `Deleted ${branch.name}`);
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    busy.value = null;
  }
}

async function renameBranch(branch: GitBranchInfo) {
  const nextName = window.prompt("Rename branch", branch.name)?.trim();
  if (!nextName || nextName === branch.name) return;
  try {
    await branchStore.rename(repoPath.value, branch.name, nextName);
    uiStore.notify("success", `Renamed ${branch.name} to ${nextName}`);
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function mergeBranch(branch: GitBranchInfo) {
  if (!window.confirm(`Merge ${branch.name} into ${currentBranch.value?.name ?? "current branch"}?`)) return;
  busy.value = `merge:${branch.name}`;
  try {
    await branchStore.merge(repoPath.value, { sourceBranch: branch.name, strategy: "merge_commit", deleteAfterMerge: false });
    uiStore.notify("success", `Merged ${branch.name}`);
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    busy.value = null;
  }
}

async function rebaseOnto(branch: GitBranchInfo) {
  if (!window.confirm("Rebase rewrites commit history. Avoid rebasing shared branches. Continue?")) return;
  busy.value = `rebase:${branch.name}`;
  try {
    await branchStore.rebase(repoPath.value, { targetBranch: branch.name, interactive: false });
    uiStore.notify("success", `Rebased onto ${branch.name}`);
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="branches-view">
    <header class="branches-header">
      <div>
        <h1>Branches</h1>
        <p>Manage and organize your branches</p>
      </div>
      <div class="new-branch-form">
        <input v-model="newBranchName" class="branch-input" placeholder="New branch name..." @keyup.enter="createBranch" />
        <Button variant="primary" size="sm" :loading="creating" :disabled="!newBranchName.trim()" @click="createBranch">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px">
            <circle cx="4.5" cy="3" r="1.4"/><circle cx="4.5" cy="13" r="1.4"/><circle cx="11.5" cy="6.5" r="1.4"/>
            <path d="M4.5 4.4v7.2M4.5 5.5c0 1.8 2.5 2 5 1.5"/>
          </svg>
          New Branch
        </Button>
      </div>
    </header>

    <div class="tabs">
      <button :class="{ active: tab === 'all' }" @click="tab = 'all'">
        All <span class="tab-count">{{ allCount }}</span>
      </button>
      <button :class="{ active: tab === 'local' }" @click="tab = 'local'">
        Local <span class="tab-count">{{ localCount }}</span>
      </button>
      <button :class="{ active: tab === 'remote' }" @click="tab = 'remote'">
        Remote <span class="tab-count">{{ remoteCount }}</span>
      </button>
      <button :class="{ active: tab === 'merged' }" @click="tab = 'merged'">
        Merged <span class="tab-count">{{ mergedCount }}</span>
      </button>
    </div>

    <div class="filters">
      <div class="search-box">
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.2"/><path d="m10.2 10.2 3 3"/></svg>
        <input v-model="search" class="search-input" placeholder="Search branches..." />
      </div>
      <select v-model="typeFilter">
        <option value="all">All Types</option>
        <option value="protected">Protected</option>
        <option value="ahead">Ahead</option>
        <option value="behind">Behind</option>
      </select>
      <select v-model="sortMode">
        <option value="recent">Sort: Recent</option>
        <option value="name">Sort: Name</option>
        <option value="status">Sort: Status</option>
      </select>
    </div>

    <div v-if="branchStore.loading" class="loading-area">
      <div class="skeleton wide" /><div class="skeleton" /><div class="skeleton mid" /><div class="skeleton wide" />
    </div>
    <div v-else-if="branchStore.error" class="empty-state error-state">
      <strong>Failed to load branches</strong>
      <span>{{ branchStore.error }}</span>
      <Button size="sm" variant="secondary" @click="branchStore.load(repoPath)">Retry</Button>
    </div>

    <main v-else class="branches-content">
      <!-- Current Branch -->
      <section v-if="currentBranch" class="branch-section">
        <div class="group-label">Current Branch</div>
        <div class="branch-table">
          <div class="branch-item current-item">
            <div class="branch-leading">
              <span class="status-dot" :class="currentBranch.status" />
              <div class="branch-info">
                <span class="branch-name">{{ currentBranch.name }}</span>
                <span class="branch-meta">
                  <span v-if="currentBranch.isDefault" class="pill">Default</span>
                  <span v-if="currentBranch.isProtected" class="pill protected">Protected</span>
                  <span v-if="currentBranch.upstream" class="upstream">{{ currentBranch.upstream }}</span>
                </span>
              </div>
            </div>
            <span class="branch-sync" :class="currentBranch.status">{{ statusLabel(currentBranch) }}</span>
            <details class="action-menu">
              <summary aria-label="Branch actions"><svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg></summary>
              <div class="action-menu-list">
                <Button size="sm" variant="ghost" @click="mergeBranch(currentBranch)">Merge into current</Button>
                <Button size="sm" variant="ghost" @click="rebaseOnto(currentBranch)">Rebase current onto this</Button>
              </div>
            </details>
          </div>
        </div>
      </section>

      <!-- Single filtered list (local, remote, merged tabs) -->
      <template v-if="tab !== 'all'">
        <section class="branch-section">
          <div class="group-label">
            {{ tab === 'local' ? 'Local Branches' : tab === 'remote' ? 'Remote Branches' : 'Merged Branches' }}
            <span class="group-count">{{ visibleBranches.length }}</span>
          </div>
          <div v-if="!visibleBranches.length" class="empty-state">
            <strong>No branches found</strong>
            <span>Try adjusting your search or filters.</span>
          </div>
          <div v-else class="branch-table">
            <BranchRow v-for="branch in visibleBranches" :key="branch.id || branch.name" :branch="branch" :busy="busy" @checkout="checkout" @merge="mergeBranch" @rebase="rebaseOnto" @rename="renameBranch" @delete="deleteBranch" />
          </div>
        </section>
      </template>

      <!-- All tab: split Local + Remote -->
      <template v-else>
        <section v-if="visibleLocal.length" class="branch-section">
          <div class="group-label">Local Branches <span class="group-count">{{ visibleLocal.length }}</span></div>
          <div class="branch-table">
            <BranchRow v-for="branch in visibleLocal" :key="branch.id || branch.name" :branch="branch" :busy="busy" @checkout="checkout" @merge="mergeBranch" @rebase="rebaseOnto" @rename="renameBranch" @delete="deleteBranch" />
          </div>
        </section>
        <section v-if="visibleRemote.length" class="branch-section">
          <div class="group-label">Remote Branches <span class="group-count">{{ visibleRemote.length }}</span></div>
          <div class="branch-table">
            <BranchRow v-for="branch in visibleRemote" :key="branch.id || branch.name" :branch="branch" :busy="busy" @checkout="checkout" @merge="mergeBranch" @rebase="rebaseOnto" @rename="renameBranch" @delete="deleteBranch" />
          </div>
        </section>
        <div v-if="!visibleLocal.length && !visibleRemote.length" class="empty-state">
          <strong>No branches found</strong>
          <span>Try adjusting your search or filters.</span>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.branches-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: var(--surface-0); }

/* Header */
.branches-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 22px 12px; border-bottom: 1px solid var(--border); background: var(--surface-1); flex-shrink: 0; }
h1 { margin: 0; color: var(--text); font-size: 17px; font-weight: 650; line-height: 1.2; }
p { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }
.new-branch-form { display: flex; align-items: center; gap: 8px; min-width: min(360px, 45vw); }
.branch-input { flex: 1; min-width: 0; height: 32px; background: var(--surface-0); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font: inherit; font-size: 12px; padding: 0 9px; outline: none; }
.branch-input:focus { border-color: var(--accent); }

/* Tabs */
.tabs { display: flex; gap: 2px; padding: 0 16px; background: var(--surface-1); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.tabs button { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text-muted); font: inherit; font-size: 12px; font-weight: 500; cursor: pointer; transition: color 80ms; }
.tabs button:hover { color: var(--text); }
.tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-count { padding: 1px 6px; border-radius: 999px; background: var(--surface-2); color: var(--text-muted); font-size: 10px; font-weight: 700; }
.tabs button.active .tab-count { background: var(--accent-subtle); color: var(--accent); }

/* Filters */
.filters { display: grid; grid-template-columns: minmax(200px, 1fr) 140px 140px; gap: 8px; padding: 10px 22px; border-bottom: 1px solid var(--border); background: var(--surface-1); flex-shrink: 0; }
.search-box { display: flex; align-items: center; gap: 8px; height: 32px; padding: 0 10px; background: var(--surface-0); border: 1px solid var(--border); border-radius: 6px; color: var(--text-subtle); }
.search-box:focus-within { border-color: var(--accent); color: var(--accent); }
.search-input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 12px; }
select { height: 32px; background: var(--surface-0); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font: inherit; font-size: 12px; padding: 0 8px; outline: none; cursor: pointer; }
select:focus { border-color: var(--accent); }

/* Loading */
.loading-area { padding: 22px; display: grid; gap: 10px; }
.skeleton { height: 10px; border-radius: 999px; background: var(--surface-2); }
.skeleton.wide { width: 86%; }
.skeleton.mid { width: 64%; }

/* Content */
.branches-content { flex: 1; overflow-y: auto; padding: 14px 22px 28px; max-width: 980px; width: 100%; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px; }
.branch-section { display: flex; flex-direction: column; gap: 7px; }
.group-label { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.group-count { padding: 1px 6px; border-radius: 999px; background: var(--surface-2); color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: none; letter-spacing: 0; }
.branch-table { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface-1); }

/* Current branch card in BranchesView */
.branch-item { min-height: 40px; display: grid; grid-template-columns: minmax(0, 1fr) auto 34px; gap: 12px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--border); background: var(--surface-1); }
.branch-item:last-child { border-bottom: 0; }
.current-item { background: color-mix(in srgb, var(--accent) 4%, var(--surface-1)); }
.branch-leading { display: flex; align-items: center; gap: 8px; min-width: 0; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--text-muted); }
.status-dot.up_to_date { background: var(--added); }
.status-dot.ahead { background: var(--added); }
.status-dot.behind { background: var(--deleted); }
.status-dot.diverged { background: var(--modified); }
.status-dot.no_upstream { background: var(--text-subtle); }
.status-dot.conflict { background: var(--deleted); }
.branch-info { display: grid; gap: 2px; min-width: 0; }
.branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.branch-meta { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; color: var(--text-subtle); font-size: 10px; }
.pill { padding: 1px 6px; border-radius: 999px; background: var(--surface-3); color: var(--text-muted); font-size: 10px; font-weight: 700; }
.pill.protected { background: color-mix(in srgb, var(--modified) 14%, transparent); color: var(--modified); }
.upstream { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.branch-sync { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.branch-sync.ahead { color: var(--added); }
.branch-sync.behind { color: var(--deleted); }
.branch-sync.diverged { color: var(--modified); }
.branch-sync.conflict { color: var(--deleted); }
.branch-sync.no_upstream { color: var(--text-subtle); }
.action-menu { position: relative; justify-self: end; }
.action-menu summary { width: 30px; height: 28px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-1); color: var(--text-muted); cursor: pointer; list-style: none; transition: border-color 80ms, color 80ms; }
.action-menu summary::-webkit-details-marker { display: none; }
.action-menu[open] summary, .action-menu summary:hover { border-color: var(--accent); color: var(--accent); }
.action-menu-list { position: absolute; right: 0; top: 32px; z-index: 10; min-width: 200px; display: flex; flex-direction: column; gap: 2px; padding: 5px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-1); box-shadow: 0 12px 30px color-mix(in srgb, var(--surface-0) 40%, transparent); }
.action-menu-list :deep(.btn) { justify-content: flex-start; width: 100%; }

.empty-state { padding: 28px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-1); color: var(--text-subtle); font-size: 12px; text-align: center; display: grid; gap: 6px; }
.empty-state strong { color: var(--text); font-size: 13px; }
.error-state strong { color: var(--deleted); }

@media (max-width: 820px) {
  .branches-header { flex-direction: column; align-items: stretch; }
  .new-branch-form { min-width: 0; }
  .filters { grid-template-columns: 1fr; }
}
</style>
