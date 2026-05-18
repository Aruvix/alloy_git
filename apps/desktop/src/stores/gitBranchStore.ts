import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { gitApi } from "@alloy/git-core";
import type {
  CreateBranchPayload,
  DeleteBranchPayload,
  GitBranchInfo,
  MergeBranchPayload,
  RebaseBranchPayload,
} from "@alloy/git-core";

export const useGitBranchStore = defineStore("gitBranch", () => {
  const branches = ref<GitBranchInfo[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const localBranches = computed(() => branches.value.filter((b) => !b.isRemote));
  const remoteBranches = computed(() => branches.value.filter((b) => b.isRemote));
  const currentBranch = computed(() => branches.value.find((b) => b.isCurrent) ?? null);

  async function load(repoPath: string) {
    loading.value = true;
    error.value = null;
    try {
      branches.value = await gitApi.branches(repoPath);
    } catch (e) {
      error.value = String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function checkout(repoPath: string, branch: string) {
    const result = await gitApi.checkout(repoPath, branch);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  async function create(repoPath: string, name: string, checkout = true, startPoint?: string) {
    const result = await gitApi.createBranch(repoPath, name, checkout, startPoint);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  async function createFromPayload(repoPath: string, payload: CreateBranchPayload) {
    const result = await gitApi.createBranchFromPayload(repoPath, payload);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
    if (payload.pushToRemote) {
      await gitApi.push(repoPath, "origin", payload.name, true);
    }
  }

  async function merge(repoPath: string, payload: MergeBranchPayload) {
    const result = await gitApi.mergeBranch(repoPath, payload);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    if (payload.deleteAfterMerge) {
      await remove(repoPath, payload.sourceBranch, false);
    } else {
      await load(repoPath);
    }
  }

  async function rebase(repoPath: string, payload: RebaseBranchPayload) {
    const result = await gitApi.rebaseBranch(repoPath, payload);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  async function remove(repoPath: string, name: string, force = false) {
    const result = await gitApi.deleteBranch(repoPath, name, force);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  async function removeFromPayload(repoPath: string, payload: DeleteBranchPayload) {
    await remove(repoPath, payload.branchName, payload.force);
  }

  async function rename(repoPath: string, oldName: string, newName: string) {
    const result = await gitApi.renameBranch(repoPath, oldName, newName);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  return {
    branches,
    loading,
    error,
    localBranches,
    remoteBranches,
    currentBranch,
    load,
    checkout,
    create,
    createFromPayload,
    merge,
    rebase,
    remove,
    removeFromPayload,
    rename,
  };
});
