import type { GitAccount, GitRepository, LocalRepository } from "@alloy/git-core";
import type { RepositoryScope } from "../stores/uiStore.js";

export interface RepoOwnerGroup {
  key: string;
  label: string;
  subtitle?: string;
  accountId?: string | null;
  kind: "organization" | "personal" | "local";
  repos: LocalRepository[];
}

export interface RepoViewModel {
  repo: LocalRepository;
  account: GitAccount | null;
  cloudRepository: GitRepository | null;
  mapping: "linked" | "local" | "needs-setup";
  providerLabel: string;
  accountLabel: string;
  branchLabel: string;
  syncLabel: string;
}

export function visibleRepositoriesForAccount(repos: LocalRepository[], accountId: string | null | undefined) {
  return accountId
    ? filterRepositoriesForScope(repos, { type: "account", id: accountId })
    : filterRepositoriesForScope(repos, { type: "all" });
}

export function filterRepositoriesForScope(repos: LocalRepository[], scope: RepositoryScope) {
  switch (scope.type) {
    case "account":
      return repos.filter((repo) => repo.linkedAccountId === scope.id);
    case "local":
      return repos.filter((repo) => !repo.linkedAccountId);
    case "all":
    default:
      return repos;
  }
}

export function groupRepositoriesByOwner(
  repos: LocalRepository[],
  accounts: GitAccount[],
  _cloudRepositories: GitRepository[],
): RepoOwnerGroup[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const cloudByAccountAndId = new Map<string, GitRepository>();
  for (const cloudRepo of _cloudRepositories) {
    if (cloudRepo.gitAccountId) cloudByAccountAndId.set(`${cloudRepo.gitAccountId}:${cloudRepo.id}`, cloudRepo);
  }
  const groups = new Map<string, RepoOwnerGroup>();

  for (const repo of repos) {
    const account = repo.linkedAccountId ? accountById.get(repo.linkedAccountId) : null;
    const cloudRepo = repo.linkedAccountId && repo.linkedRemoteId
      ? cloudByAccountAndId.get(`${repo.linkedAccountId}:${repo.linkedRemoteId}`)
      : null;
    const organization = cloudRepo?.owner && cloudRepo.owner !== account?.username ? cloudRepo.owner : "";
    const kind: RepoOwnerGroup["kind"] = account ? (organization ? "organization" : "personal") : "local";
    const label = account ? (organization || "Personal") : "Local Only";
    const key = account ? `${kind}:${account.id}:${organization || "personal"}` : "local";
    const group = groups.get(key) ?? {
      key,
      label,
      subtitle: account ? `${account.name} · ${providerTitle(account.provider)}` : undefined,
      accountId: account?.id ?? null,
      kind,
      repos: [],
    };
    group.repos.push(repo);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.kind === "organization" && b.kind !== "organization") return -1;
    if (b.kind === "organization" && a.kind !== "organization") return 1;
    if (a.kind === "personal" && b.kind === "local") return -1;
    if (b.kind === "personal" && a.kind === "local") return 1;
    if (a.kind === "local") return 1;
    if (b.kind === "local") return -1;
    return a.label.localeCompare(b.label);
  });
}

export function buildRepositoryViewModels(
  repos: LocalRepository[],
  accounts: GitAccount[],
  cloudRepositories: GitRepository[],
): RepoViewModel[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const cloudByAccountAndId = new Map<string, GitRepository>();
  for (const repo of cloudRepositories) {
    if (repo.gitAccountId) cloudByAccountAndId.set(`${repo.gitAccountId}:${repo.id}`, repo);
  }

  return repos.map((repo) => {
    const account = repo.linkedAccountId ? accountById.get(repo.linkedAccountId) ?? null : null;
    const cloudRepository = repo.linkedAccountId && repo.linkedRemoteId
      ? cloudByAccountAndId.get(`${repo.linkedAccountId}:${repo.linkedRemoteId}`) ?? null
      : null;
    const mapping = repo.linkedAccountId ? "linked" : repo.linkedRemoteId ? "needs-setup" : "local";
    return {
      repo,
      account,
      cloudRepository,
      mapping,
      providerLabel: account ? providerTitle(account.provider) : cloudRepository ? providerTitle(cloudRepository.provider) : "Local",
      accountLabel: account?.username || account?.email || account?.name || (mapping === "needs-setup" ? "Choose account" : "Local only"),
      branchLabel: cloudRepository?.defaultBranch || "Detect on open",
      syncLabel: cloudRepository ? "Remote linked" : mapping === "needs-setup" ? "Mapping required" : "Local only",
    };
  });
}

export function repositoryScopeLabel(scope: RepositoryScope, accounts: GitAccount[]) {
  if (scope.type === "all") return "All Accounts";
  if (scope.type === "local") return "Local Only";
  return accounts.find((account) => account.id === scope.id)?.name ?? "Account";
}

export function providerTitle(provider: string) {
  return provider
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
