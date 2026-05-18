import type { GitAuthParams, GitAuthValidationResult, GitProviderCapabilities, GitProviderClient, ParsedGitRemote } from "../types.js";
import type { GitProvider, GitRepository } from "@alloy/git-core";
import { getProviderCapabilities } from "../capabilities.js";
import { normalizeBaseUrl, parseAzureRemote } from "./remote.js";

interface AzureRepo {
  id: string;
  name: string;
  remoteUrl?: string;
  sshUrl?: string;
  webUrl?: string;
  defaultBranch?: string;
  project?: { name?: string };
}

export class AzureDevOpsProviderClient implements GitProviderClient {
  constructor(
    private readonly fallbackBaseUrl = "https://dev.azure.com/{organization}",
    private readonly provider: GitProvider = "azure-devops",
  ) {}

  getCapabilities(): GitProviderCapabilities {
    return getProviderCapabilities(this.provider);
  }

  async validateAuth(params: GitAuthParams): Promise<GitAuthValidationResult> {
    if ((params.authType !== "pat" && params.authType !== "oauth") || !params.token?.trim()) {
      return { status: "invalid", message: "Azure DevOps validation requires a personal access token.", repositories: [] };
    }
    const apiBase = this.apiBase(params.remoteBaseUrl);
    if (!apiBase) {
      return { status: "invalid", message: "Enter an Azure DevOps organization or server collection URL.", repositories: [] };
    }
    const res = await fetch(
      `${apiBase}/_apis/projects?api-version=7.1`,
      { headers: azureHeaders(params.token) },
    );
    if (res.status === 401 || res.status === 403) {
      return { status: "invalid", message: "Azure DevOps rejected the PAT.", repositories: [] };
    }
    if (!res.ok) {
      return { status: "invalid", message: `Azure DevOps auth check failed HTTP ${res.status}.`, repositories: [] };
    }
    const repositories = await this.listRepositories(params);
    const label = this.provider === "azure-devops" ? parseOrganization(params.remoteBaseUrl) : apiBase;
    return {
      status: "connected",
      message: `Connected to Azure DevOps ${label}. ${repositories.length} repositories accessible.`,
      profile: { username: label, accountName: label, scopes: ["vso.code"] },
      repositories,
    };
  }

  async listRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]> {
    if (!params.token?.trim()) return [];
    const apiBase = this.apiBase(params.remoteBaseUrl);
    if (!apiBase) return [];
    const headers = azureHeaders(params.token);
    const projectRes = await fetch(
      `${apiBase}/_apis/projects?api-version=7.1`,
      { headers },
    );
    if (!projectRes.ok) return [];
    const projects = await projectRes.json() as { value?: Array<{ id: string; name: string }> };
    const repoPages = await Promise.all(
      (projects.value ?? []).map(async (project) => {
        const url = `${apiBase}/${encodeURIComponent(project.name)}/_apis/git/repositories?api-version=7.1`;
        const r = await fetch(url, { headers });
        if (!r.ok) return [] as AzureRepo[];
        const data = await r.json() as { value?: AzureRepo[] };
        return data.value ?? [];
      }),
    );
    return repoPages.flat().map((r) => ({
      id: r.id,
      provider: this.provider,
      repoName: r.name,
      repoFullName: `${r.project?.name ?? parseOrganization(params.remoteBaseUrl)}/${r.name}`,
      owner: r.project?.name ?? parseOrganization(params.remoteBaseUrl),
      remoteUrl: r.remoteUrl || r.sshUrl || r.webUrl || "",
      sshRemoteUrl: r.sshUrl,
      webUrl: r.webUrl,
      defaultBranch: r.defaultBranch?.replace(/^refs\/heads\//, "") || "main",
      visibility: "unknown" as const,
    }));
  }

  parseRemoteUrl(remoteUrl: string, remoteBaseUrl?: string): ParsedGitRemote | null {
    return parseAzureRemote(remoteUrl, this.provider, remoteBaseUrl);
  }

  private apiBase(remoteBaseUrl: string | undefined): string {
    if (this.provider === "azure-devops-server") return normalizeBaseUrl(remoteBaseUrl, this.fallbackBaseUrl);
    const org = parseOrganization(remoteBaseUrl);
    return org ? `https://dev.azure.com/${encodeURIComponent(org)}` : "";
  }
}

function parseOrganization(remoteBaseUrl: string | undefined): string {
  const value = remoteBaseUrl?.trim();
  if (!value || value.includes("{organization}")) return "";
  try {
    const url = new URL(value);
    if (url.hostname === "dev.azure.com") return url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (url.hostname.endsWith(".visualstudio.com")) return url.hostname.replace(/\.visualstudio\.com$/, "");
  } catch {
    return "";
  }
  return "";
}

function azureHeaders(token: string): HeadersInit {
  const encoded = btoa(`:${token}`);
  return { Accept: "application/json", Authorization: `Basic ${encoded}` };
}
