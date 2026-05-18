<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useUiStore } from "../stores/uiStore.js";
import Button from "../components/ui/Button.vue";
import { gitApi } from "@alloy/git-core";
import type { GitWorktreeInfo } from "@alloy/git-core";

const route = useRoute();
const repoStore = useRepoStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const worktrees = ref<GitWorktreeInfo[]>([]);
const loading = ref(false);
const newPath = ref("");
const newBranch = ref("");
const adding = ref(false);

onMounted(load);

async function load() {
  loading.value = true;
  try { worktrees.value = await gitApi.worktrees(repoPath.value); }
  finally { loading.value = false; }
}

async function addWorktree() {
  if (!newPath.value.trim() || !newBranch.value.trim()) return;
  adding.value = true;
  try {
    const result = await gitApi.addWorktree(repoPath.value, newPath.value.trim(), newBranch.value.trim());
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    newPath.value = "";
    newBranch.value = "";
    uiStore.notify("success", "Worktree added");
    await load();
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    adding.value = false;
  }
}

async function removeWorktree(wt: GitWorktreeInfo) {
  if (wt.isMain) return;
  try {
    const result = await gitApi.removeWorktree(repoPath.value, wt.path);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    uiStore.notify("success", "Worktree removed");
    await load();
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}
</script>

<template>
  <div class="worktrees-view">
    <div class="wt-header">
      <input v-model="newPath" class="wt-input" placeholder="Path for new worktree…" />
      <input v-model="newBranch" class="wt-input" placeholder="Branch…" @keyup.enter="addWorktree" />
      <Button variant="primary" size="sm" :loading="adding" :disabled="!newPath.trim() || !newBranch.trim()" @click="addWorktree">Add</Button>
    </div>
    <div class="wt-list">
      <div v-if="loading" class="loading">Loading…</div>
      <div v-for="wt in worktrees" :key="wt.path" class="wt-item">
        <div class="wt-info">
          <div class="wt-path">{{ wt.path }}</div>
          <div class="wt-meta">
            <span v-if="wt.isMain" class="wt-main">main</span>
            <span v-if="wt.branch" class="wt-branch">{{ wt.branch }}</span>
            <span class="wt-head">{{ wt.head.slice(0, 7) }}</span>
            <span v-if="wt.isLocked" class="wt-locked">locked</span>
          </div>
        </div>
        <Button v-if="!wt.isMain" size="sm" variant="ghost" class="danger-btn" @click="removeWorktree(wt)">Remove</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.worktrees-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.wt-header { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface-1); flex-shrink: 0; }
.wt-input { flex: 1; background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; color: var(--text); font-size: 12px; padding: 4px 8px; outline: none; }
.wt-input:focus { border-color: var(--accent); }
.wt-list { flex: 1; overflow-y: auto; }
.wt-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.wt-item:hover { background: var(--surface-2); }
.wt-info { flex: 1; min-width: 0; }
.wt-path { font-size: 12px; color: var(--text); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wt-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.wt-main { font-size: 10px; background: var(--accent-subtle); color: var(--accent); padding: 1px 5px; border-radius: 3px; }
.wt-branch { font-size: 11px; color: var(--text-muted); font-family: monospace; }
.wt-head { font-size: 10px; color: var(--text-subtle); font-family: monospace; }
.wt-locked { font-size: 10px; color: var(--modified); }
.danger-btn { color: #f85149 !important; }
.loading { padding: 16px; text-align: center; font-size: 12px; color: var(--text-subtle); }
</style>
