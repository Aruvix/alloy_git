import type { GitAuthParams, GitAuthValidationResult, GitProviderCapabilities, GitProviderClient, ParsedGitRemote } from "../types.js";
import type { GitProvider, GitRepository } from "@alloy/git-core";
import { getProviderCapabilities } from "../capabilities.js";
import { normalizeBaseUrl, parseHostedRemote } from "./remote.js";

interface GitLabProject {
  id: number;
  name: string;
  path: string;
  name_with_namespace?: string;
  path_with_namespace?: string;
  http_url_to_repo?: string;
  ssh_url_to_repo?: string;
  web_url?: string;
  default_branch?: string;
  visibility?: string;
  last_activity_at?: string;
  namespace?: { full_path?: string; path?: string };
}

export class GitLabProviderClient implements GitProviderClient {
  constructor(
    private readonly fallbackBaseUrl = "https://gitlab.com",
    private readonly provider: GitProvider = "gitlab",
  ) {}

  getCapabilities(): GitProviderCapabilities {
    return getProviderCapabilities(this.provider);
  }

  async validateAuth(params: GitAuthParams): Promise<GitAuthValidationResult> {
    if ((params.authType !== "pat" && params.authType !== "oauth") || !params.token?.trim()) {
      return { status: "invalid", message: "GitLab validation requires a personal access token.", repositories: [] };
    }
    const baseUrl = normalizeBaseUrl(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!baseUrl) {
      return { status: "invalid", message: "Enter a GitLab-compatible server URL.", repositories: [] };
    }
    const userRes = await fetch(`${baseUrl}/api/v4/user`, { headers: gitlabHeaders(params.token) });
    if (userRes.status === 401 || userRes.status === 403) {
      return { status: "invalid", message: "GitLab rejected the token.", repositories: [] };
    }
    if (!userRes.ok) {
      return { status: "invalid", message: `GitLab auth check failed HTTP ${userRes.status}.`, repositories: [] };
    }
    const user = await userRes.json() as {
      username: string;
      name?: string | null;
      public_email?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };
    const repositories = await this.listRepositories(params);
    return {
      status: "connected",
      message: `Connected as ${user.username}. ${repositories.length} repositories accessible.`,
      profile: {
        username: user.username,
        accountName: user.name ?? undefined,
        email: user.public_email ?? user.email ?? undefined,
        avatarUrl: user.avatar_url ?? undefined,
        scopes: ["api/read_repository"],
      },
      repositories,
    };
  }

  async listRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]> {
    if (!params.token?.trim()) return [];
    const baseUrl = normalizeBaseUrl(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!baseUrl) return [];
    const projects = await fetchAllProjects(baseUrl, params.token);
    return projects.map((p) => ({
      id: String(p.id),
      provider: this.provider,
      repoName: p.path || p.name,
      repoFullName: p.path_with_namespace || p.name_with_namespace || p.name,
      owner: p.namespace?.full_path ?? p.namespace?.path ?? ownerFromFullName(p.path_with_namespace || p.name_with_namespace || p.name),
      remoteUrl: p.http_url_to_repo || p.ssh_url_to_repo || p.web_url || "",
      sshRemoteUrl: p.ssh_url_to_repo,
      webUrl: p.web_url,
      defaultBranch: p.default_branch || "main",
      visibility: normalizeVisibility(p.visibility),
      updatedAt: p.last_activity_at,
    }));
  }

  parseRemoteUrl(remoteUrl: string, remoteBaseUrl?: string): ParsedGitRemote | null {
    return parseHostedRemote(remoteUrl, this.provider, this.fallbackBaseUrl, remoteBaseUrl);
  }
}

async function fetchAllProjects(baseUrl: string, token: string): Promise<GitLabProject[]> {
  const projects: GitLabProject[] = [];
  let nextUrl = `${baseUrl}/api/v4/projects?membership=true&per_page=100&simple=true&order_by=last_activity_at&sort=desc`;
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: gitlabHeaders(token) });
    if (!res.ok) return projects;
    projects.push(...(await res.json() as GitLabProject[]));
    const nextPage = res.headers.get("x-next-page");
    nextUrl = nextPage
      ? `${baseUrl}/api/v4/projects?membership=true&per_page=100&simple=true&order_by=last_activity_at&sort=desc&page=${encodeURIComponent(nextPage)}`
      : parseNextLink(res.headers.get("link"));
  }
  return projects;
}

function gitlabHeaders(token: string): HeadersInit {
  return { Accept: "application/json", "PRIVATE-TOKEN": token };
}

function normalizeVisibility(v: unknown): GitRepository["visibility"] {
  return v === "public" || v === "private" || v === "internal" ? v : "unknown";
}

function ownerFromFullName(fullName: string): string {
  const parts = fullName.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.slice(0, -1).join("/");
}

function parseNextLink(link: string | null): string {
  if (!link) return "";
  const next = link.split(",").find((p) => p.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1] ?? "";
}
