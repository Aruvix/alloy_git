<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useGitHistoryStore } from "../stores/gitHistoryStore.js";
import { useAccountStore } from "../stores/accountStore.js";
import { useUiStore } from "../stores/uiStore.js";
import DiffViewer from "../components/DiffViewer.vue";
import Button from "../components/ui/Button.vue";
import ResizableSplitter from "../components/ui/ResizableSplitter.vue";
import { timeAgo, basename, dirname } from "@alloy/shared";
import type { GitCommitInfo } from "@alloy/git-core";

const route = useRoute();
const repoStore = useRepoStore();
const historyStore = useGitHistoryStore();
const accountStore = useAccountStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const searchQuery = ref("");
const authorFilter = ref("all");
const branchFilter = ref("all");
const authors = computed(() => [...new Set(historyStore.commits.map((commit) => commit.author))].sort());
const filteredCommits = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return historyStore.commits.filter((commit) => {
    const matchesQuery = !query || commit.message.toLowerCase().includes(query) || commit.hash.toLowerCase().includes(query);
    const matchesAuthor = authorFilter.value === "all" || commit.author === authorFilter.value;
    const matchesBranch = branchFilter.value === "all";
    return matchesQuery && matchesAuthor && matchesBranch;
  });
});

// Watch repoPath so we load even if repoStore.repos isn't populated yet at mount time.
// immediate: true means it also fires on first render.
watch(
  repoPath,
  async (path) => {
    if (!path) return;
    try {
      await historyStore.load(path);
    } catch (e) {
      uiStore.notify("error", `Could not load history: ${e}`);
    }
  },
  { immediate: true },
);

async function select(commit: GitCommitInfo) {
  try {
    await historyStore.selectCommit(repoPath.value, commit);
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function revert(hash: string) {
  try {
    await historyStore.revertCommit(repoPath.value, hash);
    uiStore.notify("success", "Commit reverted");
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function copyHash(hash: string) {
  await navigator.clipboard.writeText(hash);
  uiStore.notify("success", "Commit hash copied");
}

function authorAvatar(commit: GitCommitInfo) {
  const normalizedEmail = commit.email.toLowerCase();
  return accountStore.accounts.find((account) =>
    account.avatarUrl &&
    (
      account.email?.toLowerCase() === normalizedEmail ||
      account.username?.toLowerCase() === commit.author.toLowerCase() ||
      account.name.toLowerCase() === commit.author.toLowerCase()
    ),
  )?.avatarUrl ?? "";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";
}

function statusLabel(status: string) {
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  if (status === "renamed") return "R";
  if (status === "binary") return "B";
  return "M";
}

function displayDir(path: string) {
  const dir = dirname(path);
  return dir === "." ? "" : dir;
}
</script>

<template>
  <div class="history-view">

    <!-- ── Column 1: Commit list ── -->
    <div class="commit-list" :style="{ width: uiStore.commitListWidth + 'px' }">
      <div class="history-filters">
        <input v-model="searchQuery" class="history-search" placeholder="Search commits..." />
        <select v-model="branchFilter" class="history-select" title="Filter by branch">
          <option value="all">All branches</option>
        </select>
        <select v-model="authorFilter" class="history-select" title="Filter by author">
          <option value="all">All authors</option>
          <option v-for="author in authors" :key="author" :value="author">{{ author }}</option>
        </select>
      </div>
      <div v-if="historyStore.loading" class="loading">Loading history…</div>
      <div
        v-for="commit in filteredCommits"
        :key="commit.hash"
        class="commit-item"
        :class="{ selected: historyStore.selectedCommit?.hash === commit.hash }"
        @click="select(commit)"
      >
        <div class="commit-message">{{ commit.message }}</div>
        <div class="commit-meta">
          <span class="commit-author">
            <img v-if="authorAvatar(commit)" :src="authorAvatar(commit)" alt="" class="commit-avatar" />
            <span v-else class="commit-avatar fallback">{{ initials(commit.author) }}</span>
            <span class="commit-author-name">{{ commit.author }}</span>
          </span>
          <span class="commit-date">{{ timeAgo(commit.date) }}</span>
        </div>
      </div>
      <div v-if="!historyStore.loading && historyStore.commits.length >= historyStore.limit" class="load-more">
        <Button size="sm" variant="ghost" @click="historyStore.loadMore(repoPath)">Load more</Button>
      </div>
    </div>

    <ResizableSplitter :min="200" :max="560" @resize-end="uiStore.commitListWidth = $event" />

    <!-- ── Column 2: File list for selected commit ── -->
    <div class="file-list" :style="{ width: uiStore.historyFileListWidth + 'px' }">
      <div v-if="!historyStore.selectedCommit" class="file-list-empty">
        Select a commit to see changed files
      </div>
      <div v-else-if="historyStore.loadingDiff" class="loading">Loading…</div>
      <template v-else>
        <div class="file-list-header">
          {{ historyStore.commitFiles.length }} file{{ historyStore.commitFiles.length !== 1 ? 's' : '' }} changed
        </div>
        <div
          v-for="file in historyStore.commitFiles"
          :key="file.path"
          class="file-item"
          :class="{ selected: historyStore.selectedFile === file.path }"
          @click="historyStore.selectFile(file.path)"
          :title="file.path"
        >
          <span class="file-status" :class="file.status">
            {{ statusLabel(file.status) }}
          </span>
          <span class="file-name-wrap">
            <span v-if="file.oldPath" class="file-dir">{{ file.oldPath }} → </span>
            <span v-if="displayDir(file.path)" class="file-dir">{{ displayDir(file.path) }}/</span>
            <span class="file-name">{{ basename(file.path) }}</span>
          </span>
          <span class="file-counts">
            <span v-if="file.added" class="count-added">+{{ file.added }}</span>
            <span v-if="file.deleted" class="count-deleted">-{{ file.deleted }}</span>
          </span>
        </div>
      </template>
    </div>

    <ResizableSplitter :min="160" :max="480" @resize-end="uiStore.historyFileListWidth = $event" />

    <!-- ── Column 3: Diff viewer ── -->
    <div class="diff-panel">
      <div v-if="historyStore.selectedCommit" class="commit-detail-header">
        <div class="detail-row">
          <div>
            <div class="detail-msg">{{ historyStore.selectedCommit.message }}</div>
            <div class="detail-meta">
              <img v-if="authorAvatar(historyStore.selectedCommit)" :src="authorAvatar(historyStore.selectedCommit)" alt="" class="detail-avatar" />
              <span v-else class="detail-avatar fallback">{{ initials(historyStore.selectedCommit.author) }}</span>
              {{ historyStore.selectedCommit.author }} · {{ timeAgo(historyStore.selectedCommit.date) }}
              · <span class="detail-hash">{{ historyStore.selectedCommit.hash.slice(0, 7) }}</span>
            </div>
          </div>
          <Button size="sm" variant="ghost" class="revert-btn" @click="revert(historyStore.selectedCommit.hash)">
            Revert
          </Button>
          <Button size="sm" variant="ghost" @click="copyHash(historyStore.selectedCommit.hash)">
            Copy Hash
          </Button>
          <Button size="sm" variant="ghost">
            Checkout
          </Button>
          <Button size="sm" variant="ghost">
            Branch
          </Button>
        </div>
      </div>
      <div v-if="historyStore.loadingDiff" class="loading">Loading diff…</div>
      <div v-else-if="historyStore.diffError" class="diff-error">{{ historyStore.diffError }}</div>
      <DiffViewer v-else :diff="historyStore.fileDiff" />
    </div>

  </div>
</template>

<style scoped>
.history-view { display: flex; height: 100%; overflow: hidden; }

/* ── Column 1: Commits ── */
.commit-list { min-width: 0; flex-shrink: 0; overflow-y: auto; border-right: none; }
.history-filters {
  position: sticky;
  top: 0;
  z-index: 2;
  display: grid;
  gap: 6px;
  padding: 8px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
}
.history-search,
.history-select {
  width: 100%;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--text);
  font-size: 12px;
  padding: 0 8px;
}
.commit-item {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 80ms;
}
.commit-item:hover { background: var(--surface-2); }
.commit-item.selected { background: var(--accent-subtle); }
.commit-message {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 3px;
}
.commit-meta { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.commit-author {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11px;
  color: var(--text-muted);
  overflow: hidden;
}
.commit-author-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.commit-avatar,
.detail-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}
.commit-avatar.fallback,
.detail-avatar.fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-3);
  color: var(--text-muted);
  font-size: 8px;
  font-weight: 700;
}
.commit-date { font-size: 10px; color: var(--text-subtle); flex-shrink: 0; }
.load-more { padding: 8px; display: flex; justify-content: center; }
.loading { padding: 16px; text-align: center; color: var(--text-subtle); font-size: 12px; }

/* ── Column 2: File list ── */
.file-list { min-width: 0; flex-shrink: 0; overflow-y: auto; background: var(--surface-0); }

.file-list-empty {
  padding: 20px 12px;
  font-size: 11px;
  color: var(--text-subtle);
  text-align: center;
}

.file-list-header {
  padding: 6px 12px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-subtle);
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 1;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 80ms;
  min-width: 0;
}
.file-item:hover { background: var(--surface-2); }
.file-item.selected { background: var(--accent-subtle); }

.file-status {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.file-status.added    { background: rgba(63,185,80,0.15); color: var(--added); }
.file-status.deleted  { background: rgba(248,81,73,0.15); color: var(--deleted); }
.file-status.modified { background: rgba(79,142,247,0.12); color: var(--accent); }
.file-status.renamed  { background: rgba(255,176,46,0.15); color: var(--modified); }
.file-status.binary   { background: var(--surface-3); color: var(--text-muted); }

.file-name-wrap {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-dir { color: var(--text-subtle); }
.file-name { color: var(--text); font-weight: 500; }

.file-counts {
  display: flex;
  gap: 3px;
  flex-shrink: 0;
  font-size: 10px;
  font-family: var(--font-mono);
}
.count-added  { color: var(--added); }
.count-deleted { color: var(--deleted); }

/* ── Column 3: Diff ── */
.diff-panel { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-width: 0; }

.commit-detail-header {
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
  flex-shrink: 0;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.detail-hash { font-family: monospace; font-size: 11px; color: var(--accent); }
.detail-msg { font-size: 13px; font-weight: 500; color: var(--text); margin-bottom: 2px; }
.detail-meta { display: flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-muted); }
.revert-btn { flex-shrink: 0; }
.diff-error { padding: 16px; color: var(--error, #f85149); font-size: 12px; font-family: var(--font-mono); white-space: pre-wrap; }
</style>
