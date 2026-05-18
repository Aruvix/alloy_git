import type { GitAuthParams, GitAuthValidationResult, GitProviderCapabilities, GitProviderClient, ParsedGitRemote } from "../types.js";
import type { GitProvider, GitRepository } from "@alloy/git-core";
import { getProviderCapabilities } from "../capabilities.js";
import { normalizeBaseUrl, parseHostedRemote } from "./remote.js";

interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  clone_url?: string;
  ssh_url?: string;
  html_url?: string;
  private: boolean;
  default_branch?: string;
  updated_at?: string;
  owner?: { login?: string; username?: string };
}

export class GiteaProviderClient implements GitProviderClient {
  constructor(
    private readonly fallbackBaseUrl = "",
    private readonly provider: GitProvider = "gitea",
  ) {}

  getCapabilities(): GitProviderCapabilities {
    return getProviderCapabilities(this.provider);
  }

  async validateAuth(params: GitAuthParams): Promise<GitAuthValidationResult> {
    if (!params.token?.trim()) {
      return { status: "invalid", message: "Gitea/Forgejo validation requires a personal access token.", repositories: [] };
    }
    const baseUrl = normalizeBaseUrl(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!baseUrl) {
      return { status: "invalid", message: "Enter your Gitea/Forgejo server URL.", repositories: [] };
    }
    const userRes = await fetch(`${baseUrl}/api/v1/user`, { headers: giteaHeaders(params.token) });
    if (userRes.status === 401 || userRes.status === 403) {
      return { status: "invalid", message: "Server rejected the token.", repositories: [] };
    }
    if (!userRes.ok) {
      return { status: "invalid", message: `Server auth check failed HTTP ${userRes.status}.`, repositories: [] };
    }
    const user = await userRes.json() as {
      login: string;
      full_name?: string;
      email?: string;
      avatar_url?: string;
    };
    const repositories = await this.listRepositories(params);
    return {
      status: "connected",
      message: `Connected as ${user.login}. ${repositories.length} repositories accessible.`,
      profile: {
        username: user.login,
        accountName: user.full_name,
        email: user.email,
        avatarUrl: user.avatar_url,
        scopes: ["repository"],
      },
      repositories,
    };
  }

  async listRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]> {
    if (!params.token?.trim()) return [];
    const baseUrl = normalizeBaseUrl(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!baseUrl) return [];
    const repos: GiteaRepo[] = [];
    let page = 1;
    while (true) {
      const res = await fetch(
        `${baseUrl}/api/v1/repos/search?limit=50&page=${page}&sort=updated`,
        { headers: giteaHeaders(params.token) },
      );
      if (!res.ok) break;
      const data = await res.json() as { data?: GiteaRepo[] };
      const batch = data.data ?? [];
      if (batch.length === 0) break;
      repos.push(...batch);
      page++;
    }
    return repos.map((r) => ({
      id: String(r.id),
      provider: this.provider,
      repoName: r.name,
      repoFullName: r.full_name,
      owner: r.owner?.login ?? r.owner?.username ?? r.full_name.split("/")[0],
      remoteUrl: r.clone_url || r.ssh_url || r.html_url || "",
      sshRemoteUrl: r.ssh_url,
      webUrl: r.html_url,
      defaultBranch: r.default_branch || "main",
      visibility: r.private ? "private" : "public",
      updatedAt: r.updated_at,
    }));
  }

  parseRemoteUrl(remoteUrl: string, remoteBaseUrl?: string): ParsedGitRemote | null {
    return parseHostedRemote(remoteUrl, this.provider, this.fallbackBaseUrl, remoteBaseUrl);
  }
}

function giteaHeaders(token: string): HeadersInit {
  return { Accept: "application/json", Authorization: `token ${token}` };
}
