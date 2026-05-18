<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useUiStore } from "../stores/uiStore.js";
import Button from "../components/ui/Button.vue";
import { gitApi } from "@alloy/git-core";
import type { GitTag } from "@alloy/git-core";

const route = useRoute();
const repoStore = useRepoStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const tags = ref<GitTag[]>([]);
const loading = ref(false);
const tagName = ref("");
const tagMessage = ref("");
const creating = ref(false);

onMounted(load);

async function load() {
  loading.value = true;
  try { tags.value = await gitApi.tags(repoPath.value); }
  finally { loading.value = false; }
}

async function createTag() {
  if (!tagName.value.trim()) return;
  creating.value = true;
  try {
    const result = await gitApi.createTag(repoPath.value, tagName.value.trim(), tagMessage.value.trim() || undefined);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    uiStore.notify("success", `Created tag ${tagName.value}`);
    tagName.value = "";
    tagMessage.value = "";
    await load();
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    creating.value = false;
  }
}

async function deleteTag(name: string) {
  try {
    const result = await gitApi.deleteTag(repoPath.value, name);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    uiStore.notify("success", `Deleted tag ${name}`);
    await load();
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}
</script>

<template>
  <div class="tags-view">
    <div class="tags-header">
      <input v-model="tagName" class="tag-input" placeholder="Tag name…" @keyup.enter="createTag" />
      <input v-model="tagMessage" class="tag-input" placeholder="Annotated message (optional)…" />
      <Button variant="primary" size="sm" :loading="creating" :disabled="!tagName.trim()" @click="createTag">Create Tag</Button>
    </div>
    <div class="tags-list">
      <div v-if="loading" class="loading">Loading…</div>
      <div v-if="!loading && tags.length === 0" class="empty">No tags</div>
      <div v-for="tag in tags" :key="tag.name" class="tag-item">
        <div class="tag-info">
          <span class="tag-name">{{ tag.name }}</span>
          <span class="tag-hash">{{ tag.hash }}</span>
          <span v-if="tag.message" class="tag-message">{{ tag.message }}</span>
          <span v-if="tag.isAnnotated" class="tag-annotated">annotated</span>
        </div>
        <Button size="sm" variant="ghost" class="danger-btn" @click="deleteTag(tag.name)">Delete</Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tags-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.tags-header { display: flex; gap: 6px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--surface-1); flex-shrink: 0; flex-wrap: wrap; }
.tag-input {
  flex: 1;
  min-width: 140px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  padding: 4px 8px;
  outline: none;
}
.tag-input:focus { border-color: var(--accent); }
.tags-list { flex: 1; overflow-y: auto; }
.tag-item { display: flex; align-items: center; justify-content: space-between; padding: 7px 14px; border-bottom: 1px solid var(--border); }
.tag-item:hover { background: var(--surface-2); }
.tag-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tag-name { font-size: 13px; font-weight: 500; color: var(--text); font-family: monospace; }
.tag-hash { font-size: 11px; color: var(--accent); font-family: monospace; }
.tag-message { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag-annotated { font-size: 10px; color: var(--text-subtle); background: var(--surface-3); padding: 1px 5px; border-radius: 3px; }
.danger-btn { color: #f85149 !important; }
.loading, .empty { padding: 16px; text-align: center; font-size: 12px; color: var(--text-subtle); }
</style>
