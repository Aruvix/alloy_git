<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useAccountStore } from "../stores/accountStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { useGitBranchStore } from "../stores/gitBranchStore.js";
import { useGitHistoryStore } from "../stores/gitHistoryStore.js";
import { buildRepositoryViewModels } from "../utils/repoGrouping.js";
import { timeAgo } from "@alloy/shared";

const route = useRoute();
const router = useRouter();
const repoStore = useRepoStore();
const accountStore = useAccountStore();
const statusStore = useGitStatusStore();
const branchStore = useGitBranchStore();
const historyStore = useGitHistoryStore();

const repoId = computed(() => route.params.repoId as string);
const repo = computed(() => repoStore.repos.find((r) => r.id === repoId.value) ?? null);
const view = computed(() => {
  if (!repo.value) return null;
  return buildRepositoryViewModels([repo.value], accountStore.accounts, accountStore.repositories)[0] ?? null;
});
const status = computed(() => statusStore.status);
const branch = computed(() => branchStore.currentBranch?.name ?? status.value?.branch ?? "");
const latestCommit = computed(() => historyStore.commits[0] ?? null);

const remoteStatus = computed(() => {
  if (!status.value) return "Loading…";
  const { ahead, behind } = status.value;
  if (ahead === 0 && behind === 0) return "Up to date";
  const parts: string[] = [];
  if (ahead > 0) parts.push(`${ahead} ahead`);
  if (behind > 0) parts.push(`${behind} behind`);
  return parts.join(", ");
});

const pendingChanges = computed(() => status.value?.changes.length ?? 0);
const conflicts = computed(() => status.value?.conflictedFiles?.length ?? 0);

watch(
  () => repo.value?.path,
  async (path) => {
    if (!path || historyStore.commits.length > 0) return;
    await historyStore.load(path).catch(() => undefined);
  },
  { immediate: true },
);

const topContributors = computed(() => {
  const map = new Map<string, { name: string; commits: number; additions: number; deletions: number }>();
  for (const commit of historyStore.commits) {
    const key = commit.email ?? commit.author;
    const existing = map.get(key) ?? { name: commit.author, commits: 0, additions: 0, deletions: 0 };
    existing.commits += 1;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.commits - a.commits).slice(0, 4);
});

function nav(tab: string) {
  router.push(`/repositories/${repoId.value}/${tab}`);
}
</script>

<template>
  <div v-if="repo && view" class="overview">

    <!-- Top row: Repository Health + Latest Commit + Quick Actions -->
    <div class="overview-row top-row">

      <!-- Repository Health -->
      <div class="card">
        <div class="card-title">Repository Health</div>
        <dl class="info-list">
          <div class="info-row">
            <dt>Current Branch</dt>
            <dd class="mono">{{ branch || "—" }}</dd>
          </div>
          <div class="info-row">
            <dt>Remote Status</dt>
            <dd :class="(status?.ahead || status?.behind) ? 'warn' : 'ok'">{{ remoteStatus }}</dd>
          </div>
          <div class="info-row">
            <dt>Last Commit</dt>
            <dd class="mono">{{ latestCommit?.shortHash ?? "—" }}</dd>
          </div>
          <div class="info-row">
            <dt>Pending Changes</dt>
            <dd :class="pendingChanges > 0 ? 'warn' : 'ok'">
              {{ pendingChanges > 0 ? `${pendingChanges} files` : "None" }}
            </dd>
          </div>
          <div class="info-row">
            <dt>Open Conflicts</dt>
            <dd :class="conflicts > 0 ? 'danger' : 'ok'">
              {{ conflicts > 0 ? `${conflicts} conflict` : "None" }}
            </dd>
          </div>
          <div class="info-row">
            <dt>Active Remote</dt>
            <dd>{{ view.cloudRepository ? "origin (GitHub)" : view.account ? "origin" : "No remote" }}</dd>
          </div>
          <div class="info-row">
            <dt>Local Path</dt>
            <dd class="path" :title="repo.path">{{ repo.path }}</dd>
          </div>
        </dl>
      </div>

      <!-- Latest Commit + Recent Activity -->
      <div class="card">
        <div class="card-title">Latest Commit</div>
        <template v-if="latestCommit">
          <div class="commit-msg">{{ latestCommit.message }}</div>
          <div class="commit-meta">
            <span class="avatar-chip">{{ latestCommit.author.slice(0, 2).toUpperCase() }}</span>
            <span class="commit-author">{{ latestCommit.author }}</span>
            <span class="commit-hash mono">{{ latestCommit.shortHash }}</span>
            <span class="commit-time">{{ timeAgo(latestCommit.date) }}</span>
          </div>
        </template>
        <div v-else class="empty-card-hint">Loading commit history…</div>

        <div class="activity-divider">Recent Activity</div>
        <div v-if="historyStore.commits.length > 1" class="activity-list">
          <div v-for="commit in historyStore.commits.slice(1, 6)" :key="commit.hash" class="activity-row">
            <span class="activity-msg">{{ commit.message }}</span>
            <span class="activity-time">{{ timeAgo(commit.date) }}</span>
          </div>
        </div>
        <div v-else class="empty-card-hint">No recent activity</div>
      </div>

      <!-- Quick Actions -->
      <div class="card">
        <div class="card-title">Quick Actions</div>
        <div class="action-grid">
          <button class="action-btn" @click="nav('changes')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M2 4h10M2 7h7M2 10h5"/></svg>
            Commit Changes
          </button>
          <button class="action-btn" @click="nav('changes')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2v6M3 6l4 4 4-4"/></svg>
            Pull Latest
          </button>
          <button class="action-btn" @click="nav('changes')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10V4M3 6l4-4 4 4M3 12h8"/></svg>
            Push Changes
          </button>
          <button class="action-btn" @click="nav('branches')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="11" r="1.5"/><circle cx="10" cy="5" r="1.5"/><path d="M4 4.5v5M4 4.5Q4 7 10 5" fill="none"/></svg>
            Create Branch
          </button>
          <button class="action-btn" @click="nav('terminal')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="1.5" y="2.5" width="11" height="9" rx="1.5"/><path d="M4 6l2.5 1.5L4 9M7.5 9h3"/></svg>
            Open Terminal
          </button>
          <button class="action-btn" @click="nav('remotes')">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="7" cy="7" r="5.5"/><path d="M2 7h10M7 1.5C5.5 4 5.5 10 7 12.5M7 1.5C8.5 4 8.5 10 7 12.5"/></svg>
            View Remotes
          </button>
        </div>
      </div>
    </div>

    <!-- Bottom row: Changes Summary + Contributors -->
    <div class="overview-row bottom-row">

      <!-- Changes Summary -->
      <div class="card">
        <div class="card-header-row">
          <div class="card-title">Changes Summary</div>
          <button v-if="pendingChanges > 0" class="card-link" @click="nav('changes')">View Changes →</button>
        </div>
        <template v-if="pendingChanges > 0 && status">
          <div class="changes-bar">
            <div class="bar-segment added" :style="{ flex: Math.max(1, status.changes.filter(c => c.kind === 'added' || c.untracked).length) }" />
            <div class="bar-segment modified" :style="{ flex: Math.max(0.1, status.changes.filter(c => c.kind === 'modified').length) }" />
            <div class="bar-segment deleted" :style="{ flex: Math.max(0.1, status.changes.filter(c => c.kind === 'deleted').length) }" />
          </div>
          <div class="change-list">
            <div v-for="file in status.changes.slice(0, 8)" :key="file.path" class="change-row">
              <span class="change-status" :class="file.kind">{{ (file.kind ?? 'M').slice(0, 1).toUpperCase() }}</span>
              <span class="change-path">{{ file.path }}</span>
            </div>
            <div v-if="status.changes.length > 8" class="change-more">+{{ status.changes.length - 8 }} more files</div>
          </div>
        </template>
        <div v-else class="empty-card-state">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="12" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
            <path d="M11 16l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
          </svg>
          <span>Working tree is clean</span>
        </div>
      </div>

      <!-- Top Contributors -->
      <div class="card">
        <div class="card-title">Top Contributors</div>
        <template v-if="topContributors.length > 0">
          <div class="contributors-list">
            <div v-for="(contributor, i) in topContributors" :key="contributor.name" class="contributor-row">
              <span class="contributor-rank">{{ i + 1 }}</span>
              <div class="contributor-avatar">{{ contributor.name.slice(0, 2).toUpperCase() }}</div>
              <div class="contributor-body">
                <span class="contributor-name">{{ contributor.name }}</span>
                <span class="contributor-commits">{{ contributor.commits }} commit{{ contributor.commits !== 1 ? 's' : '' }}</span>
              </div>
            </div>
          </div>
        </template>
        <div v-else class="empty-card-hint">No contributor data yet — open History tab first.</div>
      </div>

    </div>
  </div>
  <div v-else class="loading">
    <div class="loading-spinner" />
    Loading repository…
  </div>
</template>

<style scoped>
.overview {
  flex: 1;
  overflow: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--surface-0);
}
.overview-row { display: grid; gap: 14px; }
.top-row { grid-template-columns: minmax(210px, 1.1fr) minmax(210px, 1.4fr) minmax(170px, 0.9fr); }
.bottom-row { grid-template-columns: 1fr 1fr; }
@media (max-width: 900px) {
  .top-row { grid-template-columns: 1fr 1fr; }
  .bottom-row { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .top-row { grid-template-columns: 1fr; }
}

/* Card */
.card {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--text-muted);
}
.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-link {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.card-link:hover { text-decoration: underline; }

/* Info list */
.info-list { margin: 0; display: flex; flex-direction: column; gap: 7px; }
.info-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
dt { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
dd {
  margin: 0;
  font-size: 12px;
  color: var(--text);
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 58%;
}
dd.mono { font-family: var(--font-mono, monospace); font-size: 11px; }
dd.ok { color: var(--added); }
dd.warn { color: var(--modified); }
dd.danger { color: var(--deleted); }
dd.path { font-size: 10px; color: var(--text-subtle); }

/* Commit */
.commit-msg {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.commit-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.avatar-chip {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 9px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.commit-author { font-size: 12px; color: var(--text-muted); flex: 1; }
.commit-hash { font-size: 11px; font-family: var(--font-mono, monospace); color: var(--text-subtle); }
.commit-time { font-size: 11px; color: var(--text-subtle); }

.activity-divider {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.activity-list { display: flex; flex-direction: column; gap: 6px; }
.activity-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.activity-msg {
  font-size: 12px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.activity-time { font-size: 10px; color: var(--text-subtle); flex-shrink: 0; }

/* Quick actions */
.action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.action-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-0);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: background 100ms, color 100ms, border-color 100ms;
  white-space: nowrap;
}
.action-btn:hover { background: var(--surface-2); color: var(--text); border-color: var(--accent); }

/* Changes */
.changes-bar { height: 4px; display: flex; border-radius: 999px; overflow: hidden; gap: 1px; }
.bar-segment { height: 100%; border-radius: 1px; }
.bar-segment.added { background: var(--added); }
.bar-segment.modified { background: var(--modified); }
.bar-segment.deleted { background: var(--deleted); }

.change-list { display: flex; flex-direction: column; gap: 4px; }
.change-row { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.change-status {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: grid;
  place-items: center;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
}
.change-status.added,
.change-status.new { background: rgba(34, 197, 94, 0.15); color: var(--added); }
.change-status.modified { background: rgba(245, 158, 11, 0.15); color: var(--modified); }
.change-status.deleted { background: rgba(239, 68, 68, 0.15); color: var(--deleted); }
.change-path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.change-more { font-size: 11px; color: var(--text-muted); padding: 2px 0; }

.empty-card-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 16px 0;
}
.empty-card-hint { font-size: 12px; color: var(--text-muted); }

/* Contributors */
.contributors-list { display: flex; flex-direction: column; gap: 8px; }
.contributor-row { display: flex; align-items: center; gap: 10px; }
.contributor-rank { width: 16px; font-size: 10px; color: var(--text-subtle); text-align: center; flex-shrink: 0; }
.contributor-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--surface-3);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.contributor-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.contributor-name { font-size: 12px; font-weight: 500; color: var(--text); }
.contributor-commits { font-size: 11px; color: var(--text-muted); }

/* Loading */
.loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
