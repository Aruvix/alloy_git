import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { gitApi } from "@alloy/git-core";
import type { GitCommitInfo } from "@alloy/git-core";
import { buildCommitFiles } from "../utils/historyDiff.js";
import type { CommitFile } from "../utils/historyDiff.js";

export const useGitHistoryStore = defineStore("gitHistory", () => {
  const commits = ref<GitCommitInfo[]>([]);
  const selectedCommit = ref<GitCommitInfo | null>(null);
  const commitDiff = ref<string>("");
  const commitFiles = ref<CommitFile[]>([]);
  const selectedFile = ref<string | null>(null);
  const diffError = ref<string | null>(null);
  const loading = ref(false);
  const loadingDiff = ref(false);
  const limit = ref(100);

  /** The diff shown in the viewer — scoped to selectedFile when one is chosen */
  const fileDiff = computed(() => {
    if (!selectedFile.value) return commitDiff.value;
    return commitFiles.value.find((f) => f.path === selectedFile.value)?.diff ?? "";
  });

  async function load(repoPath: string) {
    if (!repoPath) return;
    // Reset file/diff state when switching repos
    selectedCommit.value = null;
    commitDiff.value = "";
    commitFiles.value = [];
    selectedFile.value = null;
    diffError.value = null;
    loading.value = true;
    try {
      commits.value = await gitApi.log(repoPath, limit.value);
    } catch (e) {
      commits.value = [];
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(repoPath: string) {
    limit.value += 100;
    await load(repoPath);
  }

  async function selectCommit(repoPath: string, commit: GitCommitInfo) {
    selectedCommit.value = commit;
    loadingDiff.value = true;
    commitDiff.value = "";
    commitFiles.value = buildCommitFiles(commit.changedFiles ?? [], "");
    selectedFile.value = commitFiles.value[0]?.path ?? null;
    diffError.value = null;
    try {
      commitDiff.value = await gitApi.commitDiff(repoPath, commit.hash);
      commitFiles.value = buildCommitFiles(commit.changedFiles ?? [], commitDiff.value);
      selectedFile.value = commitFiles.value[0]?.path ?? null;
    } catch (e) {
      diffError.value = String(e);
      throw e;
    } finally {
      loadingDiff.value = false;
    }
  }

  function selectFile(path: string) {
    selectedFile.value = path;
  }

  async function revertCommit(repoPath: string, hash: string) {
    const result = await gitApi.revertCommit(repoPath, hash);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  return {
    commits,
    selectedCommit,
    commitDiff,
    commitFiles,
    selectedFile,
    fileDiff,
    diffError,
    loading,
    loadingDiff,
    limit,
    load,
    loadMore,
    selectCommit,
    selectFile,
    revertCommit,
  };
});
