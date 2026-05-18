import type { GitAccount, GitRepository, GlobalGitConfig, LocalRepository } from "./types.js";

export const DEFAULT_GLOBAL_GIT_CONFIG: GlobalGitConfig = {
  defaultAccountId: null,
  defaultRepositoryId: null,
  authorName: "",
  authorEmail: "",
  defaultBranch: "main",
  defaultCloneDirectory: "",
  autoPullBeforePush: false,
  autoCommitMessageTemplate: "",
  secretScanMode: "warn",
};

export function repositoriesForAccount(
  repositories: GitRepository[],
  accountId: string | null | undefined,
): GitRepository[] {
  if (!accountId) return [];
  return repositories.filter((repository) => repository.gitAccountId === accountId);
}

export function normalizeGlobalGitConfig(
  input: Partial<GlobalGitConfig> | null | undefined,
  accounts: GitAccount[],
  repositories: GitRepository[],
): GlobalGitConfig {
  const merged: GlobalGitConfig = { ...DEFAULT_GLOBAL_GIT_CONFIG, ...(input ?? {}) };
  const defaultAccountId = merged.defaultAccountId && accounts.some((account) => account.id === merged.defaultAccountId)
    ? merged.defaultAccountId
    : null;
  const defaultRepositoryId = defaultAccountId && merged.defaultRepositoryId && repositories.some(
    (repository) => repository.id === merged.defaultRepositoryId && repository.gitAccountId === defaultAccountId,
  )
    ? merged.defaultRepositoryId
    : null;

  return {
    ...merged,
    defaultAccountId,
    defaultRepositoryId,
    defaultBranch: merged.defaultBranch.trim() || DEFAULT_GLOBAL_GIT_CONFIG.defaultBranch,
    secretScanMode: merged.secretScanMode ?? DEFAULT_GLOBAL_GIT_CONFIG.secretScanMode,
  };
}

export function resolveRepositoryAccount(
  repo: Pick<LocalRepository, "linkedAccountId"> | null | undefined,
  globalConfig: Pick<GlobalGitConfig, "defaultAccountId">,
  accounts: GitAccount[],
): { account: GitAccount | null; source: "repository" | "global" | "none" } {
  if (repo?.linkedAccountId) {
    const account = accounts.find((item) => item.id === repo.linkedAccountId) ?? null;
    if (account) return { account, source: "repository" };
  }
  if (globalConfig.defaultAccountId) {
    const account = accounts.find((item) => item.id === globalConfig.defaultAccountId) ?? null;
    if (account) return { account, source: "global" };
  }
  return { account: null, source: "none" };
}
