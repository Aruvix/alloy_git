<script setup lang="ts">
import { computed, ref } from "vue";
import type { LocalRepository, GitStatus } from "@alloy/git-core";
import { useAccountStore } from "../stores/accountStore.js";
import BranchPanel from "./BranchPanel.vue";

const props = defineProps<{
  repo: LocalRepository;
  status: GitStatus | null;
  branch: string;
  loadingAction?: "fetch" | "pull" | "push" | null;
}>();
const emit = defineEmits<{
  (e: "fetch"): void;
  (e: "pull"): void;
  (e: "push"): void;
  (e: "more-action", action: "terminal" | "settings" | "copy-path" | "view-remote"): void;
}>();

const accountStore = useAccountStore();
const linkedAccount = computed(() => accountStore.accounts.find((account) => account.id === props.repo.linkedAccountId) ?? null);
const linkedCloudRepo = computed(() => accountStore.repositories.find((repo) =>
  repo.gitAccountId === props.repo.linkedAccountId && repo.id === props.repo.linkedRemoteId,
) ?? null);
const visibility = computed(() => {
  if (!props.repo.linkedAccountId) return "Local";
  const value = linkedCloudRepo.value?.visibility;
  return value && value !== "unknown" ? value[0].toUpperCase() + value.slice(1) : "Private";
});
const remoteUrl = computed(() => linkedCloudRepo.value?.webUrl || linkedCloudRepo.value?.remoteUrl || props.repo.path);
const orgLabel = computed(() => linkedCloudRepo.value?.owner || linkedAccount.value?.name || "Local Only");
const syncText = computed(() => {
  if (!props.status) return "Checking status";
  const parts: string[] = [];
  if (props.status.ahead > 0) parts.push(`${props.status.ahead} ahead`);
  if (props.status.behind > 0) parts.push(`${props.status.behind} behind`);
  if (props.status.conflictedFiles.length > 0) parts.push(`${props.status.conflictedFiles.length} conflict`);
  return parts.join(" · ") || "Up to date";
});

const branchPanelOpen = ref(false);
const moreMenuOpen = ref(false);
const branchButtonEl = ref<HTMLElement | null>(null);
const branchPanelAnchor = ref<{ left: number; top: number } | null>(null);
const isBusy = computed(() => Boolean(props.loadingAction));

function toggleBranchPanel() {
  if (branchPanelOpen.value) {
    branchPanelOpen.value = false;
    return;
  }

  const rect = branchButtonEl.value?.getBoundingClientRect();
  branchPanelAnchor.value = rect ? { left: Math.round(rect.left), top: Math.round(rect.bottom + 8) } : null;
  branchPanelOpen.value = true;
}

function runMoreAction(action: "terminal" | "settings" | "copy-path" | "view-remote") {
  moreMenuOpen.value = false;
  emit("more-action", action);
}

</script>

<template>
  <header class="toolbar">
    <div class="toolbar-left">
      <div class="repo-title-row">
        <span class="repo-name">{{ repo.name }}</span>
        <span class="visibility-badge">{{ visibility }}</span>
        <span v-if="status?.state === 'conflict'" class="state-badge conflict">CONFLICT</span>
        <span v-else-if="status?.state === 'merge'" class="state-badge merge">MERGING</span>
        <span v-else-if="status?.state === 'rebase'" class="state-badge rebase">REBASING</span>
      </div>
      <div class="repo-meta-row">
        <span>{{ orgLabel }}</span>
        <span class="meta-separator">·</span>
        <span class="remote-url" :title="remoteUrl">{{ remoteUrl }}</span>
      </div>
    </div>
    <div class="toolbar-right">
      <button
        v-if="branch"
        ref="branchButtonEl"
        class="branch-badge"
        :class="{ open: branchPanelOpen }"
        @click="toggleBranchPanel"
        :title="branchPanelOpen ? 'Close branch panel' : 'Manage branches'"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <circle cx="3" cy="2" r="1.5" /><circle cx="3" cy="8" r="1.5" /><circle cx="7" cy="4" r="1.5" />
          <path d="M3 3.5v3M3 3.5Q3 5 7 4" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
        <span>{{ branch }}</span>
        <svg class="chevron" width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
          <path d="M2 3l2 2 2-2" />
        </svg>
      </button>
      <div class="sync-info" :class="{ danger: status?.conflictedFiles.length }">{{ syncText }}</div>
      <button
        class="toolbar-btn"
        :class="{ loading: loadingAction === 'fetch' }"
        :disabled="isBusy"
        @click="$emit('fetch')"
        title="Fetch"
      >
        <span v-if="loadingAction === 'fetch'" class="spinner" />
        {{ loadingAction === "fetch" ? "Fetching" : "Fetch" }}
      </button>
      <button
        class="toolbar-btn"
        :class="{ loading: loadingAction === 'pull' }"
        :disabled="isBusy"
        @click="$emit('pull')"
        title="Pull"
      >
        <span v-if="loadingAction === 'pull'" class="spinner" />
        {{ loadingAction === "pull" ? "Pulling" : "Pull" }}
      </button>
      <button
        class="toolbar-btn primary"
        :class="{ loading: loadingAction === 'push' }"
        :disabled="isBusy"
        @click="$emit('push')"
        title="Push"
      >
        <span v-if="loadingAction === 'push'" class="spinner" />
        {{ loadingAction === "push" ? "Pushing" : "Push" }}
      </button>
      <div class="more-wrap">
        <button
          class="toolbar-btn icon-only"
          :class="{ open: moreMenuOpen }"
          title="More actions"
          @click="moreMenuOpen = !moreMenuOpen"
        >
          ⋮
        </button>
        <div v-if="moreMenuOpen" class="more-menu">
          <button class="more-item" @click="runMoreAction('terminal')">Open Terminal</button>
          <button class="more-item" @click="runMoreAction('settings')">Repository Settings</button>
          <button class="more-item" @click="runMoreAction('copy-path')">Copy Repository Path</button>
          <button class="more-item" @click="runMoreAction('view-remote')">Copy Remote URL</button>
        </div>
      </div>
    </div>
  </header>

  <BranchPanel
    v-if="branchPanelOpen"
    :repo-path="repo.path"
    :anchor="branchPanelAnchor"
    @close="branchPanelOpen = false"
  />
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  min-height: 72px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}
.toolbar-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.toolbar-right { display: flex; align-items: center; gap: 6px; }
.repo-title-row,
.repo-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.repo-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 17px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.repo-meta-row {
  font-size: 12px;
  color: var(--text-muted);
}
.remote-url {
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-separator { color: var(--text-subtle); }

.branch-badge {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  font-size: 12px;
  font-weight: 650;
  color: var(--accent);
  background: var(--surface-1);
  border: 1px solid var(--accent);
  padding: 0 10px;
  border-radius: 6px;
  font-family: var(--font-mono);
  max-width: min(360px, 42vw);
  cursor: pointer;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 8%, transparent);
  transition: background 100ms, border-color 100ms, color 100ms, box-shadow 100ms;
}
.branch-badge > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.branch-badge:hover {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
}
.branch-badge.open {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent);
}
.chevron {
  margin-left: 1px;
  transition: transform 150ms ease;
}
.branch-badge.open .chevron {
  transform: rotate(180deg);
}

.state-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.04em;
}
.visibility-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.state-badge.conflict { background: color-mix(in srgb, var(--deleted) 14%, transparent); color: var(--deleted); }
.state-badge.merge { background: color-mix(in srgb, var(--modified) 14%, transparent); color: var(--modified); }
.state-badge.rebase { background: rgba(79, 142, 247, 0.15); color: var(--accent); }
.sync-info {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--added);
  white-space: nowrap;
}
.sync-info.danger { color: var(--deleted); }
.sync-indicator {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}
.sync-indicator.behind { color: var(--modified); }
.sync-indicator.ahead { color: var(--accent); }
.toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 5px;
  font-size: 12px;
  padding: 3px 10px;
  cursor: pointer;
  transition: background 100ms, color 100ms;
}
.toolbar-btn:hover { background: var(--surface-3); color: var(--text); }
.toolbar-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.toolbar-btn.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
.toolbar-btn.primary:hover { background: var(--accent-hover); }
.toolbar-btn.primary:disabled { background: var(--accent); color: #fff; }
.toolbar-btn.icon-only {
  width: 28px;
  padding: 3px 0;
}
.toolbar-btn.icon-only.open {
  background: var(--surface-3);
  color: var(--text);
}
.spinner {
  width: 11px;
  height: 11px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
.more-wrap {
  position: relative;
}
.more-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  min-width: 190px;
  padding: 5px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-1);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.26);
}
.more-item {
  display: block;
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.more-item:hover {
  background: var(--surface-2);
  color: var(--text);
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
