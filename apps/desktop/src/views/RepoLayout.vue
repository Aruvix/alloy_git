<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useRepoStore } from "../stores/repoStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { useGitBranchStore } from "../stores/gitBranchStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { gitApi } from "@alloy/git-core";
import RepoNav from "../components/RepoNav.vue";
import RepoToolbar from "../components/RepoToolbar.vue";

const route = useRoute();
const router = useRouter();
const repoStore = useRepoStore();
const statusStore = useGitStatusStore();
const branchStore = useGitBranchStore();
const uiStore = useUiStore();
const activeOperation = ref<"fetch" | "pull" | "push" | null>(null);

const repoId = computed(() => route.params.repoId as string);
const repo = computed(() => repoStore.repos.find((r) => r.id === repoId.value) ?? null);

async function bootstrap(repoPath: string) {
  await Promise.all([statusStore.refresh(repoPath), branchStore.load(repoPath)]);
  statusStore.startPolling(repoPath);
}

onMounted(async () => {
  if (!repo.value) {
    await repoStore.load();
    if (!repoStore.repos.find((r) => r.id === repoId.value)) {
      router.push("/");
      return;
    }
  }
  if (repo.value) {
    repoStore.setActiveRepo(repo.value.id);
    await bootstrap(repo.value.path);
  }
});

watch(repoId, async (newId) => {
  statusStore.stopPolling();
  const r = repoStore.repos.find((r) => r.id === newId);
  if (r) {
    repoStore.setActiveRepo(r.id);
    await bootstrap(r.path);
  }
});

onUnmounted(() => statusStore.stopPolling());

async function handleFetch() {
  if (!repo.value) return;
  if (activeOperation.value) return;
  activeOperation.value = "fetch";
  try {
    const result = await gitApi.fetch(repo.value.path);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await statusStore.refresh(repo.value.path);
    uiStore.notify("success", "Fetched from remote");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    activeOperation.value = null;
  }
}

async function handlePull() {
  if (!repo.value) return;
  if (activeOperation.value) return;
  activeOperation.value = "pull";
  try {
    const result = await gitApi.pull(repo.value.path);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await Promise.all([statusStore.refresh(repo.value.path), branchStore.load(repo.value.path)]);
    uiStore.notify("success", "Pulled successfully");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    activeOperation.value = null;
  }
}

async function handlePush() {
  if (!repo.value) return;
  if (activeOperation.value) return;
  activeOperation.value = "push";
  try {
    const result = await gitApi.push(repo.value.path);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await statusStore.refresh(repo.value.path);
    uiStore.notify("success", "Pushed successfully");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    activeOperation.value = null;
  }
}

async function handleMoreAction(action: "terminal" | "settings" | "copy-path" | "view-remote") {
  if (!repo.value) return;
  if (action === "terminal") {
    router.push(`/repositories/${repo.value.id}/terminal`);
    return;
  }
  if (action === "settings") {
    router.push(`/repositories/${repo.value.id}/settings`);
    return;
  }
  if (action === "copy-path") {
    await navigator.clipboard.writeText(repo.value.path);
    uiStore.notify("success", "Repository path copied");
    return;
  }
  if (action === "view-remote") {
    const remote = statusStore.status?.remotes.find((item) => item.name === "origin") ?? statusStore.status?.remotes[0];
    if (!remote?.url) {
      uiStore.notify("warning", "No remote URL configured");
      return;
    }
    await navigator.clipboard.writeText(remote.url);
    uiStore.notify("success", "Remote URL copied");
  }
}
</script>

<template>
  <div v-if="repo" class="repo-layout">
    <RepoToolbar
      :repo="repo"
      :status="statusStore.status"
      :branch="branchStore.currentBranch?.name ?? statusStore.status?.branch ?? ''"
      :loading-action="activeOperation"
      @fetch="handleFetch"
      @pull="handlePull"
      @push="handlePush"
      @more-action="handleMoreAction"
    />
    <RepoNav :repo-id="repoId" />
    <div class="repo-body">
      <div class="repo-content">
        <RouterView />
      </div>
    </div>
  </div>
  <div v-else class="loading-state">Loading repository…</div>
</template>

<style scoped>
.repo-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.repo-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.repo-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.loading-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
