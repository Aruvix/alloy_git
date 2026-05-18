<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useUiStore } from "../stores/uiStore.js";
import Button from "../components/ui/Button.vue";
import { gitApi } from "@alloy/git-core";
import type { GitRemote } from "@alloy/git-core";

const route = useRoute();
const repoStore = useRepoStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const remotes = ref<GitRemote[]>([]);
const loading = ref(false);
const remoteName = ref("origin");
const remoteUrl = ref("");
const saving = ref(false);

onMounted(load);

async function load() {
  loading.value = true;
  try { remotes.value = await gitApi.remotes(repoPath.value); }
  finally { loading.value = false; }
}

async function setRemote() {
  if (!remoteName.value.trim() || !remoteUrl.value.trim()) return;
  saving.value = true;
  try {
    const result = await gitApi.setRemote(repoPath.value, remoteName.value.trim(), remoteUrl.value.trim());
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    uiStore.notify("success", `Remote ${remoteName.value} saved`);
    remoteUrl.value = "";
    await load();
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    saving.value = false;
  }
}

async function removeRemote(name: string) {
  try {
    const result = await gitApi.removeRemote(repoPath.value, name);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    uiStore.notify("success", `Remote ${name} removed`);
    await load();
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}
</script>

<template>
  <div class="remotes-view">
    <div class="remotes-header">
      <input v-model="remoteName" class="remote-input sm" placeholder="Name (e.g. origin)" />
      <input v-model="remoteUrl" class="remote-input" placeholder="URL (https:// or git@…)" @keyup.enter="setRemote" />
      <Button variant="primary" size="sm" :loading="saving" :disabled="!remoteName.trim() || !remoteUrl.trim()" @click="setRemote">Add / Update</Button>
    </div>
    <div class="remotes-list">
      <div v-if="loading" class="loading">Loading…</div>
      <div v-if="!loading && remotes.length === 0" class="empty">No remotes configured</div>
      <div v-for="remote in remotes" :key="remote.name + remote.direction" class="remote-item">
        <div class="remote-info">
          <span class="remote-name">{{ remote.name }}</span>
          <span class="remote-dir">{{ remote.direction }}</span>
          <span class="remote-url">{{ remote.url }}</span>
        </div>
        <Button size="sm" variant="ghost" class="danger-btn" @click="removeRemote(remote.name)">Remove</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.remotes-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.remotes-header { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface-1); flex-shrink: 0; }
.remote-input { flex: 1; background: var(--surface-2); border: 1px solid var(--border); border-radius: 5px; color: var(--text); font-size: 12px; padding: 4px 8px; outline: none; }
.remote-input.sm { max-width: 100px; flex: 0 0 100px; }
.remote-input:focus { border-color: var(--accent); }
.remotes-list { flex: 1; overflow-y: auto; }
.remote-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid var(--border); }
.remote-item:hover { background: var(--surface-2); }
.remote-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.remote-name { font-size: 12px; font-weight: 500; color: var(--text); font-family: monospace; }
.remote-dir { font-size: 10px; color: var(--text-subtle); background: var(--surface-3); padding: 1px 5px; border-radius: 3px; }
.remote-url { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; }
.danger-btn { color: #f85149 !important; }
.loading, .empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-subtle); }
</style>
