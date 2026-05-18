import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { gitApi } from "@alloy/git-core";
import type { GitStatus, GitFileChange } from "@alloy/git-core";

export const useGitStatusStore = defineStore("gitStatus", () => {
  const status = ref<GitStatus | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedFile = ref<GitFileChange | null>(null);
  const commitMessage = ref("");
  const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);

  const stagedFiles = computed(() => status.value?.changes.filter((c) => c.staged) ?? []);
  const unstagedFiles = computed(
    () => status.value?.changes.filter((c) => c.unstaged || c.untracked) ?? [],
  );
  const conflictedFiles = computed(() => status.value?.changes.filter((c) => c.conflicted) ?? []);
  const hasChanges = computed(() => (status.value?.changes.length ?? 0) > 0);
  const canCommit = computed(
    () => stagedFiles.value.length > 0 && commitMessage.value.trim().length > 0,
  );

  async function refresh(repoPath: string) {
    if (loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      status.value = await gitApi.status(repoPath);
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  function startPolling(repoPath: string, intervalMs = 3000) {
    stopPolling();
    pollingInterval.value = setInterval(() => refresh(repoPath), intervalMs);
  }

  function stopPolling() {
    if (pollingInterval.value) {
      clearInterval(pollingInterval.value);
      pollingInterval.value = null;
    }
  }

  function selectFile(file: GitFileChange | null) {
    selectedFile.value = file;
  }

  async function stageFile(repoPath: string, filePath: string) {
    await gitApi.stage(repoPath, filePath);
    await refresh(repoPath);
  }

  async function unstageFile(repoPath: string, filePath: string) {
    await gitApi.unstage(repoPath, filePath);
    await refresh(repoPath);
  }

  async function stageAll(repoPath: string) {
    await gitApi.stage(repoPath, undefined, true);
    await refresh(repoPath);
  }

  async function unstageAll(repoPath: string) {
    await gitApi.unstage(repoPath, undefined, true);
    await refresh(repoPath);
  }

  async function discardFile(repoPath: string, filePath: string) {
    await gitApi.discard(repoPath, filePath);
    await refresh(repoPath);
  }

  async function commit(repoPath: string, amend = false, authorName?: string, authorEmail?: string) {
    const msg = commitMessage.value.trim();
    if (!msg) throw new Error("Commit message is required");
    const result = await gitApi.commit(repoPath, msg, amend, authorName, authorEmail);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    commitMessage.value = "";
    await refresh(repoPath);
    return result;
  }

  return {
    status,
    loading,
    error,
    selectedFile,
    commitMessage,
    stagedFiles,
    unstagedFiles,
    conflictedFiles,
    hasChanges,
    canCommit,
    refresh,
    startPolling,
    stopPolling,
    selectFile,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardFile,
    commit,
  };
});
