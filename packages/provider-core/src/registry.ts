import type { GitProvider } from "@alloy/git-core";
import type { GitProviderClient, ParsedGitRemote } from "./types.js";
import { PROVIDER_CAPABILITIES, getProviderCapabilities } from "./capabilities.js";
import { GitHubProviderClient } from "./providers/github.js";
import { GitLabProviderClient } from "./providers/gitlab.js";
import { BitbucketProviderClient } from "./providers/bitbucket.js";
import { AzureDevOpsProviderClient } from "./providers/azure.js";
import { GiteaProviderClient } from "./providers/gitea.js";

export function getProviderClient(provider: GitProvider, remoteBaseUrl?: string): GitProviderClient {
  switch (provider) {
    case "github": return new GitHubProviderClient();
    case "github-enterprise": return new GitHubProviderClient(remoteBaseUrl ?? "", "github-enterprise");
    case "gitlab": return new GitLabProviderClient("https://gitlab.com", "gitlab");
    case "bitbucket": return new BitbucketProviderClient();
    case "bitbucket-server": return new BitbucketProviderClient(remoteBaseUrl ?? "", "bitbucket-server");
    case "azure-devops": return new AzureDevOpsProviderClient();
    case "azure-devops-server": return new AzureDevOpsProviderClient(remoteBaseUrl ?? "", "azure-devops-server");
    case "gitea": return new GiteaProviderClient(remoteBaseUrl, "gitea");
    case "forgejo": return new GiteaProviderClient(remoteBaseUrl, "forgejo");
    case "custom": return new GitLabProviderClient(remoteBaseUrl ?? "", "custom");
  }
}

export { PROVIDER_CAPABILITIES, getProviderCapabilities };

export function providerLabel(provider: GitProvider): string {
  return getProviderCapabilities(provider).label;
}

export function defaultRemoteBaseUrl(provider: GitProvider): string {
  return getProviderCapabilities(provider).defaultRemoteBaseUrl;
}

export function providerAuthHelp(provider: GitProvider): string {
  const help: Record<GitProvider, string> = {
    github: "Use a token with repo access, or sign in with GitHub CLI (gh auth login).",
    "github-enterprise": "Enter your GitHub Enterprise URL and use a token with repo access.",
    gitlab: "Use a GitLab personal access token with api or read_repository scope.",
    bitbucket: "Use a Bitbucket Cloud API/access token with repository read permissions.",
    "bitbucket-server": "Enter your Bitbucket Data Center URL and use a token with repository read permissions.",
    "azure-devops": "Enter https://dev.azure.com/{organization} and use a PAT with Code read scope.",
    "azure-devops-server": "Enter your Azure DevOps Server collection URL and use a PAT with Code read scope.",
    gitea: "Enter your Gitea server URL and use a personal access token.",
    forgejo: "Enter your Forgejo server URL and use a personal access token.",
    custom: "Use a GitLab-compatible server URL. Generic Git servers can be added by repository URL.",
  };
  return help[provider];
}

export function isProviderValidationSupported(provider: GitProvider, remoteBaseUrl?: string): boolean {
  const capabilities = getProviderCapabilities(provider);
  if (!capabilities.supportsRepositoryDiscovery) return false;
  if (capabilities.serverUrlRequired) {
    return Boolean(remoteBaseUrl?.trim()) && !remoteBaseUrl!.includes("{organization}");
  }
  return true;
}

export function normalizeRemoteBaseUrl(provider: GitProvider, remoteBaseUrl?: string): string {
  const fallback = defaultRemoteBaseUrl(provider);
  return (remoteBaseUrl?.trim() || fallback).replace(/\/+$/, "");
}

export function parseRemoteWithProviders(remoteUrl: string, accounts: Array<{ provider: GitProvider; remoteBaseUrl?: string }>): ParsedGitRemote | null {
  for (const account of accounts) {
    const parsed = getProviderClient(account.provider, account.remoteBaseUrl).parseRemoteUrl(remoteUrl, account.remoteBaseUrl);
    if (parsed) return parsed;
  }
  for (const provider of Object.keys(PROVIDER_CAPABILITIES) as GitProvider[]) {
    const parsed = getProviderClient(provider).parseRemoteUrl(remoteUrl);
    if (parsed) return parsed;
  }
  return null;
}
