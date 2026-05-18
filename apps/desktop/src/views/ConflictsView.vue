<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { gitApi } from "@alloy/git-core";
import type { GitConflictFile, GitFileChange } from "@alloy/git-core";
import { useRepoStore } from "../stores/repoStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { useUiStore } from "../stores/uiStore.js";
import Button from "../components/ui/Button.vue";

const route = useRoute();
const repoStore = useRepoStore();
const statusStore = useGitStatusStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const selected = ref<GitFileChange | null>(statusStore.conflictedFiles[0] ?? null);
const conflict = ref<GitConflictFile | null>(null);
const loading = ref(false);

async function loadConflict(file: GitFileChange | null) {
  selected.value = file;
  conflict.value = null;
  if (!file || !repoPath.value) return;
  loading.value = true;
  try {
    conflict.value = await gitApi.conflictFile(repoPath.value, file.path);
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    loading.value = false;
  }
}

async function accept(side: "ours" | "theirs" | "both") {
  if (!selected.value || !repoPath.value) return;
  try {
    await gitApi.conflictAccept(repoPath.value, selected.value.path, side);
    await statusStore.refresh(repoPath.value);
    await loadConflict(statusStore.conflictedFiles[0] ?? null);
    uiStore.notify("success", `Accepted ${side}`);
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function markResolved() {
  if (!selected.value || !repoPath.value) return;
  try {
    await gitApi.markResolved(repoPath.value, selected.value.path);
    await statusStore.refresh(repoPath.value);
    await loadConflict(statusStore.conflictedFiles[0] ?? null);
    uiStore.notify("success", "Marked resolved");
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function finish(operation: "merge" | "rebase", action: "continue" | "abort") {
  if (!repoPath.value) return;
  try {
    const result = action === "continue"
      ? await gitApi.continue(repoPath.value, operation)
      : await gitApi.abort(repoPath.value, operation);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await statusStore.refresh(repoPath.value);
    uiStore.notify("success", `${operation} ${action} completed`);
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

watch(
  () => statusStore.conflictedFiles.map((file) => file.path).join("\0"),
  () => {
    if (!selected.value || !statusStore.conflictedFiles.some((file) => file.path === selected.value?.path)) {
      void loadConflict(statusStore.conflictedFiles[0] ?? null);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="conflicts-view">
    <aside class="conflict-list">
      <div class="panel-title">
        <span>Conflicts</span>
        <span class="count">{{ statusStore.conflictedFiles.length }}</span>
      </div>
      <button
        v-for="file in statusStore.conflictedFiles"
        :key="file.path"
        class="conflict-file"
        :class="{ active: selected?.path === file.path }"
        @click="loadConflict(file)"
      >
        {{ file.path }}
      </button>
      <div v-if="statusStore.conflictedFiles.length === 0" class="empty">No conflicted files</div>
    </aside>

    <section class="conflict-detail">
      <div class="conflict-toolbar">
        <div>
          <strong>{{ selected?.path ?? "No conflict selected" }}</strong>
          <span v-if="statusStore.status?.state" class="state">{{ statusStore.status.state }}</span>
        </div>
        <div class="toolbar-actions">
          <Button size="sm" variant="secondary" :disabled="!selected" @click="accept('ours')">Ours</Button>
          <Button size="sm" variant="secondary" :disabled="!selected" @click="accept('theirs')">Theirs</Button>
          <Button size="sm" variant="secondary" :disabled="!selected" @click="accept('both')">Both</Button>
          <Button size="sm" variant="primary" :disabled="!selected" @click="markResolved">Mark Resolved</Button>
        </div>
      </div>

      <div v-if="loading" class="empty detail-empty">Loading conflict…</div>
      <div v-else-if="conflict" class="versions">
        <div class="version">
          <div class="version-title">Base</div>
          <pre>{{ conflict.base }}</pre>
        </div>
        <div class="version">
          <div class="version-title">Ours</div>
          <pre>{{ conflict.ours }}</pre>
        </div>
        <div class="version">
          <div class="version-title">Theirs</div>
          <pre>{{ conflict.theirs }}</pre>
        </div>
        <div class="version">
          <div class="version-title">Worktree</div>
          <pre>{{ conflict.worktree }}</pre>
        </div>
      </div>
      <div v-else class="empty detail-empty">Select a conflict to inspect versions</div>

      <div class="operation-bar">
        <Button size="sm" variant="secondary" @click="finish('merge', 'continue')">Continue Merge</Button>
        <Button size="sm" variant="ghost" @click="finish('merge', 'abort')">Abort Merge</Button>
        <Button size="sm" variant="secondary" @click="finish('rebase', 'continue')">Continue Rebase</Button>
        <Button size="sm" variant="ghost" @click="finish('rebase', 'abort')">Abort Rebase</Button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.conflicts-view { display: flex; height: 100%; min-height: 0; overflow: hidden; }
.conflict-list { width: 260px; min-width: 260px; border-right: 1px solid var(--border); background: var(--surface-1); display: flex; flex-direction: column; padding: 8px; gap: 3px; }
.panel-title { display: flex; align-items: center; justify-content: space-between; padding: 3px 4px 8px; font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.count { border-radius: 999px; background: rgba(248, 81, 73, 0.14); color: var(--conflict); padding: 1px 6px; }
.conflict-file { border: 0; background: transparent; color: var(--text-muted); text-align: left; border-radius: 5px; padding: 6px 8px; font-size: 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conflict-file:hover, .conflict-file.active { background: var(--surface-3); color: var(--text); }
.conflict-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.conflict-toolbar, .operation-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); padding: 8px 10px; }
.operation-bar { justify-content: flex-end; border-top: 1px solid var(--border); border-bottom: 0; }
.toolbar-actions { display: flex; gap: 6px; }
.state { margin-left: 8px; color: var(--text-muted); font-size: 11px; text-transform: uppercase; }
.versions { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: auto; }
.version { min-width: 0; min-height: 220px; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); display: flex; flex-direction: column; }
.version-title { padding: 6px 8px; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border); background: var(--surface-1); }
pre { flex: 1; margin: 0; padding: 10px; overflow: auto; font: 12px/1.5 var(--font-mono); color: var(--text); white-space: pre-wrap; }
.empty { color: var(--text-muted); font-size: 12px; padding: 10px; }
.detail-empty { display: flex; flex: 1; align-items: center; justify-content: center; }
@media (max-width: 900px) {
  .versions { grid-template-columns: 1fr; }
  .conflict-list { width: 200px; min-width: 200px; }
}
</style>
