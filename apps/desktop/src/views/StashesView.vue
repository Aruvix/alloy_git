<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useGitStashStore } from "../stores/gitStashStore.js";
import { useUiStore } from "../stores/uiStore.js";
import DiffViewer from "../components/DiffViewer.vue";
import Button from "../components/ui/Button.vue";
import type { GitStashInfo } from "@alloy/git-core";

const route = useRoute();
const repoStore = useRepoStore();
const stashStore = useGitStashStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const stashMessage = ref("");
const pushing = ref(false);

onMounted(() => stashStore.load(repoPath.value));

async function pushStash() {
  pushing.value = true;
  try {
    await stashStore.push(repoPath.value, stashMessage.value.trim() || undefined);
    stashMessage.value = "";
    uiStore.notify("success", "Stashed changes");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    pushing.value = false;
  }
}

async function applyStash(stash: GitStashInfo, pop: boolean) {
  try {
    await stashStore.apply(repoPath.value, stash.index, pop);
    uiStore.notify("success", pop ? "Stash popped" : "Stash applied");
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function dropStash(stash: GitStashInfo) {
  try {
    await stashStore.drop(repoPath.value, stash.index);
    uiStore.notify("success", "Stash dropped");
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}
</script>

<template>
  <div class="stashes-view">
    <div class="stash-panel">
      <div class="stash-header">
        <input v-model="stashMessage" class="stash-input" placeholder="Stash description (optional)…" @keyup.enter="pushStash" />
        <Button variant="primary" size="sm" :loading="pushing" @click="pushStash">Stash</Button>
      </div>
      <div v-if="stashStore.loading" class="loading">Loading…</div>
      <div v-if="!stashStore.loading && stashStore.stashes.length === 0" class="empty">No stashes</div>
      <div
        v-for="stash in stashStore.stashes"
        :key="stash.index"
        class="stash-item"
        :class="{ selected: stashStore.selectedStash?.index === stash.index }"
        @click="stashStore.selectStash(repoPath, stash)"
      >
        <div class="stash-index">{{ stash.index }}</div>
        <div class="stash-info">
          <div class="stash-msg">{{ stash.message }}</div>
          <div class="stash-branch">{{ stash.branch }}</div>
        </div>
        <div class="stash-actions">
          <Button size="sm" variant="ghost" @click.stop="applyStash(stash, false)">Apply</Button>
          <Button size="sm" variant="ghost" @click.stop="applyStash(stash, true)">Pop</Button>
          <Button size="sm" variant="ghost" class="danger-btn" @click.stop="dropStash(stash)">Drop</Button>
        </div>
      </div>
    </div>
    <div class="diff-panel">
      <DiffViewer :diff="stashStore.stashDiff" />
    </div>
  </div>
</template>

<style scoped>
.stashes-view { display: flex; height: 100%; overflow: hidden; }
.stash-panel { width: 300px; min-width: 260px; display: flex; flex-direction: column; border-right: 1px solid var(--border); overflow: hidden; }
.stash-header { display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.stash-input {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
}
.stash-input:focus { border-color: var(--accent); }
.stash-item { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 80ms; }
.stash-item:hover { background: var(--surface-2); }
.stash-item.selected { background: var(--accent-subtle); }
.stash-index { font-size: 10px; font-family: monospace; color: var(--text-muted); flex-shrink: 0; }
.stash-info { flex: 1; min-width: 0; }
.stash-msg { font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stash-branch { font-size: 10px; color: var(--text-subtle); }
.stash-actions { display: flex; gap: 2px; }
.danger-btn { color: #f85149 !important; }
.loading, .empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-subtle); }
.diff-panel { flex: 1; overflow: hidden; }
</style>
