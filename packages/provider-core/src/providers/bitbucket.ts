import type { GitAuthParams, GitAuthValidationResult, GitProviderCapabilities, GitProviderClient, ParsedGitRemote } from "../types.js";
import type { GitProvider, GitRepository } from "@alloy/git-core";
import { getProviderCapabilities } from "../capabilities.js";
import { normalizeBaseUrl, parseHostedRemote } from "./remote.js";

interface BitbucketRepo {
  uuid?: string;
  name: string;
  slug: string;
  full_name: string;
  is_private: boolean;
  mainbranch?: { name?: string };
  updated_on?: string;
  links?: {
    clone?: Array<{ name?: string; href?: string }>;
    html?: { href?: string };
  };
}

export class BitbucketProviderClient implements GitProviderClient {
  constructor(
    private readonly fallbackBaseUrl = "https://bitbucket.org",
    private readonly provider: GitProvider = "bitbucket",
  ) {}

  getCapabilities(): GitProviderCapabilities {
    return getProviderCapabilities(this.provider);
  }

  async validateAuth(params: GitAuthParams): Promise<GitAuthValidationResult> {
    if ((params.authType !== "pat" && params.authType !== "oauth") || !params.token?.trim()) {
      return { status: "invalid", message: "Bitbucket validation requires an API/access token.", repositories: [] };
    }
    const userRes = await fetch(`${this.apiBase(params.remoteBaseUrl)}/user`, {
      headers: bearerHeaders(params.token),
    });
    if (userRes.status === 401 || userRes.status === 403) {
      return { status: "invalid", message: "Bitbucket rejected the token.", repositories: [] };
    }
    if (!userRes.ok) {
      return { status: "invalid", message: `Bitbucket auth check failed HTTP ${userRes.status}.`, repositories: [] };
    }
    const user = await userRes.json() as {
      username?: string;
      display_name?: string;
      account_id?: string;
      uuid?: string;
      links?: { avatar?: { href?: string } };
    };
    const repositories = await this.listRepositories(params);
    return {
      status: "connected",
      message: `Connected as ${user.display_name || user.username || "Bitbucket user"}. ${repositories.length} repositories accessible.`,
      profile: {
        username: user.username ?? user.account_id ?? user.uuid ?? "bitbucket-user",
        accountName: user.display_name,
        avatarUrl: user.links?.avatar?.href,
        scopes: ["repository", "workspace"],
      },
      repositories,
    };
  }

  async listRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]> {
    if (!params.token?.trim()) return [];
    if (this.provider === "bitbucket-server") return this.listServerRepositories(params);
    const apiBase = this.apiBase(params.remoteBaseUrl);
    const workspaces = await fetchPaginated<{ slug: string }>(
      `${apiBase}/user/workspaces?pagelen=100`,
      params.token,
    );
    const pages = await Promise.all(
      workspaces.map((ws) =>
        fetchPaginated<BitbucketRepo>(
          `${apiBase}/repositories/${encodeURIComponent(ws.slug)}?pagelen=100&sort=-updated_on`,
          params.token!,
        ),
      ),
    );
    return pages.flat().map((r) => ({
      id: r.uuid || r.full_name,
      provider: this.provider,
      repoName: r.slug || r.name,
      repoFullName: r.full_name,
      owner: r.full_name.split("/")[0],
      remoteUrl: r.links?.clone?.find((c) => c.name === "https")?.href ?? r.links?.html?.href ?? "",
      sshRemoteUrl: r.links?.clone?.find((c) => c.name === "ssh")?.href,
      webUrl: r.links?.html?.href,
      defaultBranch: r.mainbranch?.name ?? "main",
      visibility: r.is_private ? "private" : "public",
      updatedAt: r.updated_on,
    }));
  }

  parseRemoteUrl(remoteUrl: string, remoteBaseUrl?: string): ParsedGitRemote | null {
    return parseHostedRemote(remoteUrl, this.provider, this.fallbackBaseUrl, remoteBaseUrl);
  }

  private apiBase(remoteBaseUrl?: string): string {
    if (this.provider === "bitbucket") return "https://api.bitbucket.org/2.0";
    const baseUrl = normalizeBaseUrl(remoteBaseUrl, this.fallbackBaseUrl);
    return `${baseUrl}/rest/api/1.0`;
  }

  private async listServerRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]> {
    if (!params.token?.trim()) return [];
    const baseUrl = normalizeBaseUrl(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!baseUrl) return [];
    const repos = await fetchServerPages<BitbucketServerRepo>(`${baseUrl}/rest/api/1.0/repos?limit=100`, params.token);
    return repos.map((r) => ({
      id: String(r.id ?? `${r.project?.key}/${r.slug}`),
      provider: this.provider,
      repoName: r.slug || r.name,
      repoFullName: `${r.project?.key ?? "project"}/${r.slug || r.name}`,
      owner: r.project?.key,
      remoteUrl: r.links?.clone?.find((c) => c.name === "http")?.href ?? r.links?.self?.[0]?.href ?? "",
      sshRemoteUrl: r.links?.clone?.find((c) => c.name === "ssh")?.href,
      webUrl: r.links?.self?.[0]?.href,
      defaultBranch: r.defaultBranch ?? "main",
      visibility: "unknown",
    }));
  }
}

interface BitbucketServerRepo {
  id?: number;
  slug: string;
  name: string;
  defaultBranch?: string;
  project?: { key?: string; name?: string };
  links?: {
    clone?: Array<{ name?: string; href?: string }>;
    self?: Array<{ href?: string }>;
  };
}

async function fetchPaginated<T>(initialUrl: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl = initialUrl;
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: bearerHeaders(token) });
    if (!res.ok) return items;
    const page = await res.json() as { values?: T[]; next?: string };
    items.push(...(page.values ?? []));
    nextUrl = page.next ?? "";
  }
  return items;
}

function bearerHeaders(token: string): HeadersInit {
  return { Accept: "application/json", Authorization: `Bearer ${token}` };
}

async function fetchServerPages<T>(initialUrl: string, token: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl = initialUrl;
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: bearerHeaders(token) });
    if (!res.ok) return items;
    const page = await res.json() as { values?: T[]; isLastPage?: boolean; nextPageStart?: number };
    items.push(...(page.values ?? []));
    nextUrl = page.isLastPage || page.nextPageStart == null
      ? ""
      : `${initialUrl}${initialUrl.includes("?") ? "&" : "?"}start=${encodeURIComponent(String(page.nextPageStart))}`;
  }
  return items;
}
