import type { GitCredentialType, GitProvider, GitRepository } from "@alloy/git-core";

export interface GitProviderUserProfile {
  username: string;
  accountName?: string;
  email?: string;
  avatarUrl?: string;
  scopes: string[];
}

export interface GitAuthValidationResult {
  status: "connected" | "invalid" | "expired";
  message: string;
  profile?: GitProviderUserProfile;
  repositories: Omit<GitRepository, "gitAccountId">[];
}

export interface GitAuthParams {
  authType: GitCredentialType;
  token?: string;
  remoteBaseUrl?: string;
}

export interface GitProviderCapabilities {
  provider: GitProvider;
  label: string;
  defaultRemoteBaseUrl: string;
  supportsSelfHosted: boolean;
  supportsRepositoryDiscovery: boolean;
  authTypes: GitCredentialType[];
  requiredScopes: string[];
  cloneUrlPreference: "https" | "ssh";
  serverUrlRequired: boolean;
}

export interface ParsedGitRemote {
  provider: GitProvider;
  remoteBaseUrl?: string;
  owner: string;
  repoName: string;
  repoFullName: string;
}

export interface GitProviderClient {
  getCapabilities(): GitProviderCapabilities;
  validateAuth(params: GitAuthParams): Promise<GitAuthValidationResult>;
  listRepositories(params: GitAuthParams): Promise<Omit<GitRepository, "gitAccountId">[]>;
  parseRemoteUrl(remoteUrl: string, remoteBaseUrl?: string): ParsedGitRemote | null;
}

export interface GitHubDeviceFlowInit {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export type { GitProvider, GitCredentialType, GitRepository };
