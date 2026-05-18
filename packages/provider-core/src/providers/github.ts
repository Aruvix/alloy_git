import type {
  GitAuthParams,
  GitAuthValidationResult,
  GitHubDeviceFlowInit,
  GitProviderCapabilities,
  GitProviderClient,
  ParsedGitRemote,
} from "../types.js";
import type { GitProvider, GitRepository } from "@alloy/git-core";
import { getProviderCapabilities } from "../capabilities.js";
import { apiBaseUrl, normalizeBaseUrl, parseHostedRemote } from "./remote.js";

const REQUIRED_SCOPES = ["repo"];

export class GitHubProviderClient implements GitProviderClient {
  constructor(
    private readonly fallbackBaseUrl = "https://github.com",
    private readonly provider: GitProvider = "github",
  ) {}

  getCapabilities(): GitProviderCapabilities {
    return getProviderCapabilities(this.provider);
  }

  async validateAuth(params: GitAuthParams): Promise<GitAuthValidationResult> {
    if ((params.authType !== "pat" && params.authType !== "oauth") || !params.token?.trim()) {
      return { status: "invalid", message: "GitHub validation requires a token (PAT or OAuth).", repositories: [] };
    }
    const apiBase = githubApiBase(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!apiBase) {
      return { status: "invalid", message: "Enter your GitHub Enterprise server URL.", repositories: [] };
    }
    const headers = githubHeaders(params.token);
    const userRes = await fetch(`${apiBase}/user`, { headers });
    if (userRes.status === 401 || userRes.status === 403) {
      return { status: "invalid", message: "GitHub rejected the token.", repositories: [] };
    }
    if (!userRes.ok) {
      return { status: "invalid", message: `GitHub auth check failed HTTP ${userRes.status}.`, repositories: [] };
    }
    const user = await userRes.json() as {
      login: string;
      name?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    };
    const scopes = parseScopes(userRes.headers.get("x-oauth-scopes"));
    const repositories = await this.listRepositories(params);
    const hasRepo = scopes.length === 0 || scopes.some((s) => REQUIRED_SCOPES.includes(s) || s.startsWith("repo:"));
    return {
      status: hasRepo ? "connected" : "invalid",
      message: hasRepo
        ? `Connected as ${user.login}. ${repositories.length} repositories accessible.`
        : "Token is valid but repo scope was not detected.",
      profile: {
        username: user.login,
        accountName: user.name ?? undefined,
        email: user.email ?? undefined,
        avatarUrl: user.avatar_url ?? undefined,
        scopes,
      },
      repositories,
    };
  }

  async listRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]> {
    if (!params.token?.trim()) return [];
    const apiBase = githubApiBase(params.remoteBaseUrl, this.fallbackBaseUrl);
    if (!apiBase) return [];
    const res = await fetch(
      `${apiBase}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers: githubHeaders(params.token) },
    );
    if (!res.ok) return [];
    const repos = await res.json() as Array<{
      id: number;
      name: string;
      full_name: string;
      clone_url: string;
      ssh_url?: string;
      html_url?: string;
      private: boolean;
      visibility?: "public" | "private" | "internal";
      default_branch: string;
      updated_at?: string;
      owner?: { login?: string };
    }>;
    return repos.map((r) => ({
      id: String(r.id),
      provider: this.provider,
      repoName: r.name,
      repoFullName: r.full_name,
      owner: r.owner?.login ?? r.full_name.split("/")[0],
      remoteUrl: r.clone_url,
      sshRemoteUrl: r.ssh_url,
      webUrl: r.html_url,
      defaultBranch: r.default_branch,
      visibility: r.visibility ?? (r.private ? "private" : "public"),
      updatedAt: r.updated_at,
    }));
  }

  parseRemoteUrl(remoteUrl: string, remoteBaseUrl?: string): ParsedGitRemote | null {
    return parseHostedRemote(remoteUrl, this.provider, this.fallbackBaseUrl, remoteBaseUrl);
  }
}

export async function startGitHubDeviceFlow(clientId: string): Promise<GitHubDeviceFlowInit> {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "repo,user:email,read:org" }),
  });
  if (!res.ok) throw new Error(`Device flow init failed: HTTP ${res.status}`);
  const data = await res.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
    error?: string;
    error_description?: string;
  };
  if (data.error) throw new Error(data.error_description ?? data.error);
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
}

export async function pollGitHubDeviceFlow(
  clientId: string,
  deviceCode: string,
): Promise<string | "pending" | "expired"> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  if (!res.ok) throw new Error(`Device flow poll failed: HTTP ${res.status}`);
  const data = await res.json() as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (data.access_token) return data.access_token;
  if (data.error === "authorization_pending" || data.error === "slow_down") return "pending";
  if (data.error === "expired_token") return "expired";
  throw new Error(data.error_description ?? data.error ?? "Unknown device flow error");
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function githubApiBase(remoteBaseUrl: string | undefined, fallbackBaseUrl: string): string {
  const baseUrl = normalizeBaseUrl(remoteBaseUrl, fallbackBaseUrl);
  if (!baseUrl) return "";
  if (baseUrl === "https://github.com") return "https://api.github.com";
  return apiBaseUrl(baseUrl, "/api/v3");
}

function parseScopes(header: string | null): string[] {
  return header?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
}
