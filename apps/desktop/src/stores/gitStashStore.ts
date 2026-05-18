import { defineStore } from "pinia";
import { ref } from "vue";
import { gitApi } from "@alloy/git-core";
import type { GitStashInfo } from "@alloy/git-core";

export const useGitStashStore = defineStore("gitStash", () => {
  const stashes = ref<GitStashInfo[]>([]);
  const selectedStash = ref<GitStashInfo | null>(null);
  const stashDiff = ref<string>("");
  const loading = ref(false);

  async function load(repoPath: string) {
    loading.value = true;
    try {
      stashes.value = await gitApi.stashes(repoPath);
    } finally {
      loading.value = false;
    }
  }

  async function push(repoPath: string, message?: string) {
    const result = await gitApi.stashPush(repoPath, message);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  async function apply(repoPath: string, index: string, pop = false) {
    const result = await gitApi.stashApply(repoPath, index, pop);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await load(repoPath);
  }

  async function drop(repoPath: string, index: string) {
    const result = await gitApi.stashDrop(repoPath, index);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    if (selectedStash.value?.index === index) selectedStash.value = null;
    await load(repoPath);
  }

  async function selectStash(repoPath: string, stash: GitStashInfo) {
    selectedStash.value = stash;
    stashDiff.value = await gitApi.stashDiff(repoPath, stash.index);
  }

  return {
    stashes,
    selectedStash,
    stashDiff,
    loading,
    load,
    push,
    apply,
    drop,
    selectStash,
  };
});
