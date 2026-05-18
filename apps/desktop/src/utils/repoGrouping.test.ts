import { describe, expect, it } from "vitest";
import type { GitAccount, GitRepository, LocalRepository } from "@alloy/git-core";
import { filterRepositoriesForScope, groupRepositoriesByOwner, visibleRepositoriesForAccount } from "./repoGrouping.js";

const accountA: GitAccount = {
  id: "account-a",
  name: "Work GitHub",
  provider: "github",
  username: "alice",
  authType: "pat",
  status: "connected",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const accountB: GitAccount = {
  ...accountA,
  id: "account-b",
  name: "Client GitHub",
  username: "bob",
};

const repos: LocalRepository[] = [
  localRepo("local-a", "api", "account-a", "remote-a"),
  localRepo("local-b", "web", "account-b", "remote-b"),
  localRepo("local-c", "scratch"),
];

const cloudRepos: GitRepository[] = [
  cloudRepo("remote-a", "account-a", "acme/api", "acme"),
  cloudRepo("remote-b", "account-b", "acme/web", "acme"),
];

describe("repo grouping", () => {
  it("filters visible repositories by selected account", () => {
    expect(visibleRepositoriesForAccount(repos, "account-a").map((repo) => repo.id)).toEqual(["local-a"]);
    expect(visibleRepositoriesForAccount(repos, null).map((repo) => repo.id)).toEqual(["local-a", "local-b", "local-c"]);
  });

  it("groups repositories by owner without merging unrelated account filtering", () => {
    const groups = groupRepositoriesByOwner(repos, [accountA, accountB], cloudRepos);
    expect(groups.map((group) => [group.label, group.repos.map((repo) => repo.id)])).toEqual([
      ["acme", ["local-a"]],
      ["acme", ["local-b"]],
      ["Local Only", ["local-c"]],
    ]);
  });

  it("falls back to account identity when no cloud repository is linked", () => {
    const groups = groupRepositoriesByOwner([localRepo("local-d", "tool", "account-a")], [accountA], []);
    expect(groups[0]).toMatchObject({ label: "Personal" });
  });

  it("keeps local-only repositories in an explicit scope", () => {
    const scopedRepos = [
      localRepo("linked", "api", "account-a", "remote-a"),
      localRepo("local-only", "scratch"),
      localRepo("unknown-remote", "legacy", undefined, "remote-unknown"),
    ];

    expect(filterRepositoriesForScope(scopedRepos, { type: "account", id: "account-a" }).map((repo) => repo.id)).toEqual(["linked"]);
    expect(filterRepositoriesForScope(scopedRepos, { type: "local" }).map((repo) => repo.id)).toEqual(["local-only"]);
  });
});

function localRepo(id: string, name: string, linkedAccountId?: string, linkedRemoteId?: string): LocalRepository {
  return {
    id,
    name,
    path: `/tmp/${name}`,
    linkedAccountId,
    linkedRemoteId,
    remoteUrl: linkedRemoteId ? `https://github.com/acme/${name}.git` : undefined,
    isLocalOnly: !linkedAccountId && !linkedRemoteId,
    addedAt: "2026-01-01T00:00:00.000Z",
  };
}

function cloudRepo(id: string, gitAccountId: string, repoFullName: string, owner: string): GitRepository {
  return {
    id,
    gitAccountId,
    provider: "github",
    repoName: repoFullName.split("/")[1],
    repoFullName,
    owner,
    remoteUrl: `https://github.com/${repoFullName}.git`,
    defaultBranch: "main",
    visibility: "private",
  };
}
