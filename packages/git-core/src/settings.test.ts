import { describe, expect, it } from "vitest";
import { normalizeGlobalGitConfig, repositoriesForAccount, resolveRepositoryAccount } from "./settings.js";
import type { GitAccount, GitRepository } from "./types.js";

const accountA: GitAccount = {
  id: "account-a",
  name: "Work GitHub",
  provider: "github",
  authType: "pat",
  status: "connected",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const accountB: GitAccount = {
  ...accountA,
  id: "account-b",
  name: "Personal GitHub",
};

const repoA: GitRepository = {
  id: "repo-a",
  gitAccountId: "account-a",
  provider: "github",
  repoName: "alloy",
  repoFullName: "work/alloy",
  remoteUrl: "https://github.com/work/alloy.git",
  defaultBranch: "main",
  visibility: "private",
};

describe("Git settings helpers", () => {
  it("keeps default account and repository when both still exist", () => {
    const config = normalizeGlobalGitConfig(
      { defaultAccountId: "account-a", defaultRepositoryId: "repo-a" },
      [accountA, accountB],
      [repoA],
    );

    expect(config.defaultAccountId).toBe("account-a");
    expect(config.defaultRepositoryId).toBe("repo-a");
  });

  it("clears stale default repository when it belongs to another account", () => {
    const config = normalizeGlobalGitConfig(
      { defaultAccountId: "account-b", defaultRepositoryId: "repo-a" },
      [accountA, accountB],
      [repoA],
    );

    expect(config.defaultAccountId).toBe("account-b");
    expect(config.defaultRepositoryId).toBeNull();
  });

  it("clears stale default account and repository when account is deleted", () => {
    const config = normalizeGlobalGitConfig(
      { defaultAccountId: "missing", defaultRepositoryId: "repo-a" },
      [accountA],
      [repoA],
    );

    expect(config.defaultAccountId).toBeNull();
    expect(config.defaultRepositoryId).toBeNull();
  });

  it("filters repository indexes by account id", () => {
    expect(repositoriesForAccount([repoA], "account-a")).toEqual([repoA]);
    expect(repositoriesForAccount([repoA], "account-b")).toEqual([]);
  });

  it("resolves repository-linked account before global default", () => {
    expect(
      resolveRepositoryAccount({ linkedAccountId: "account-b" }, { defaultAccountId: "account-a" }, [accountA, accountB]),
    ).toEqual({ account: accountB, source: "repository" });
  });

  it("allows local repositories with no account", () => {
    expect(resolveRepositoryAccount({}, { defaultAccountId: null }, [accountA])).toEqual({
      account: null,
      source: "none",
    });
  });
});
