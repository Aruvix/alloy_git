<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useAccountStore } from "../stores/accountStore.js";
import { useUiStore } from "../stores/uiStore.js";

const route = useRoute();
const repoStore = useRepoStore();
const accountStore = useAccountStore();
const uiStore = useUiStore();
const repo = computed(() => repoStore.repos.find((item) => item.id === route.params.repoId) ?? null);
const linkedRepositories = computed(() => accountStore.repositoriesForAccount(repo.value?.linkedAccountId));

async function linkAccount(event: Event) {
  if (!repo.value) return;
  const linkedAccountId = (event.target as HTMLSelectElement).value || null;
  await repoStore.linkRepo(repo.value.id, linkedAccountId, null);
  uiStore.notify("success", linkedAccountId ? "Repository account linked" : "Repository set to local-only");
}

async function linkRemote(event: Event) {
  if (!repo.value) return;
  const linkedRemoteId = (event.target as HTMLSelectElement).value || null;
  await repoStore.linkRepo(repo.value.id, repo.value.linkedAccountId ?? null, linkedRemoteId);
  uiStore.notify("success", linkedRemoteId ? "Cloud repository linked" : "Cloud repository cleared");
}
</script>

<template>
  <div v-if="repo" class="settings-view">
    <section class="settings-panel">
      <h1>Repository Settings</h1>
      <p>Configure which connected account and cloud repository this local checkout maps to.</p>

      <label>
        <span>Connected account</span>
        <select :value="repo.linkedAccountId ?? ''" @change="linkAccount">
          <option value="">Local only</option>
          <option v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
            {{ account.name }}{{ account.username ? ` · ${account.username}` : '' }}
          </option>
        </select>
      </label>

      <label>
        <span>Mapped cloud repository</span>
        <select :value="repo.linkedRemoteId ?? ''" :disabled="!repo.linkedAccountId" @change="linkRemote">
          <option value="">No cloud repository</option>
          <option v-for="remote in linkedRepositories" :key="`${remote.gitAccountId}:${remote.id}`" :value="remote.id">
            {{ remote.repoFullName }}
          </option>
        </select>
      </label>
    </section>
  </div>
</template>

<style scoped>
.settings-view {
  flex: 1;
  overflow: auto;
  padding: 18px;
}
.settings-panel {
  max-width: 680px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-1);
  padding: 16px;
}
h1 {
  margin: 0;
  font-size: 18px;
}
p {
  margin: 4px 0 18px;
  color: var(--text-muted);
}
label {
  display: grid;
  grid-template-columns: 160px minmax(220px, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 12px;
}
label span {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
}
select {
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--text);
  padding: 0 9px;
}
</style>
