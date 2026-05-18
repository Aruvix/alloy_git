export type GitProvider =
  | "github"
  | "github-enterprise"
  | "gitlab"
  | "bitbucket"
  | "bitbucket-server"
  | "azure-devops"
  | "azure-devops-server"
  | "gitea"
  | "forgejo"
  | "custom";

export type GitCredentialType = "oauth" | "pat" | "ssh" | "system";
export type GitAccountStatus = "connected" | "expired" | "invalid" | "untested";
export type GitRepositoryVisibility = "public" | "private" | "internal" | "unknown";

export interface SecureSecretRef {
  encryptedValue: string;
  iv: string;
  salt: string;
}

export interface GitAccount {
  id: string;
  name: string;
  provider: GitProvider;
  username?: string;
  email?: string;
  remoteBaseUrl?: string;
  authType: GitCredentialType;
  credentialRef?: SecureSecretRef;
  sshKeyPath?: string;
  useSystemCredentials?: boolean;
  avatarUrl?: string;
  status: GitAccountStatus;
  validationMessage?: string;
  scopes?: string[];
  repositoryCount?: number;
  lastAuthenticatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitRepository {
  id: string;
  gitAccountId?: string;
  provider: GitProvider;
  repoName: string;
  repoFullName: string;
  owner?: string;
  remoteUrl: string;
  sshRemoteUrl?: string;
  webUrl?: string;
  defaultBranch: string;
  visibility: GitRepositoryVisibility;
  localPath?: string;
  lastSyncedAt?: string;
  updatedAt?: string;
}

export interface LocalRepository {
  id: string;
  path: string;
  name: string;
  linkedRemoteId?: string;
  linkedAccountId?: string;
  workspaceId?: string;
  provider?: GitProvider;
  remoteUrl?: string;
  isLocalOnly?: boolean;
  addedAt: string;
  lastOpenedAt?: string;
  isFavorite?: boolean;
  groupId?: string;
}

export interface RepositoryGroup {
  id: string;
  name: string;
  color?: string;
  createdAt: string;
}

export interface GlobalGitConfig {
  defaultAccountId: string | null;
  defaultRepositoryId: string | null;
  authorName: string;
  authorEmail: string;
  defaultBranch: string;
  defaultCloneDirectory: string;
  autoPullBeforePush: boolean;
  autoCommitMessageTemplate: string;
  secretScanMode: "warn" | "block" | "off";
}

export interface GitFileChange {
  path: string;
  kind: string;
  oldPath?: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface GitRemote {
  name: string;
  url: string;
  direction: string;
}

export interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  detached: boolean;
  state: string;
  changes: GitFileChange[];
  ahead: number;
  behind: number;
  upstream?: string | null;
  remotes: GitRemote[];
  conflictedFiles: string[];
}

export type BranchStatus =
  | "up_to_date"
  | "ahead"
  | "behind"
  | "diverged"
  | "no_upstream"
  | "conflict";

export interface GitBranchInfo {
  id: string;
  name: string;
  shortName: string;
  type: "local" | "remote";
  isCurrent: boolean;
  isRemote: boolean;
  isDefault?: boolean;
  isProtected?: boolean;
  upstream?: string | null;
  ahead: number;
  behind: number;
  lastCommitHash?: string;
  lastCommitMessage?: string;
  lastCommitAuthor?: string;
  lastCommitDate?: string;
  status: BranchStatus;
  lastUsedAt?: string;
}

export type CreateBranchPayload = {
  name: string;
  from: string;
  checkout: boolean;
  pushToRemote: boolean;
};

export type MergeBranchPayload = {
  sourceBranch: string;
  strategy: "merge_commit" | "squash" | "fast_forward_only";
  deleteAfterMerge: boolean;
};

export type RebaseBranchPayload = {
  targetBranch: string;
  interactive: boolean;
};

export type DeleteBranchPayload = {
  branchName: string;
  force: boolean;
};

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  changedFiles: string[];
}

export interface GitStashInfo {
  index: string;
  message: string;
  branch: string;
  hash: string;
}

export interface GitCommandOutput {
  stdout: string;
  stderr: string;
  code: number;
}

export interface GitConflictFile {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  worktree: string;
}

export interface GitTag {
  name: string;
  hash: string;
  message?: string;
  isAnnotated: boolean;
}

export interface GitWorktreeInfo {
  path: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  isLocked: boolean;
}

export interface SecretFinding {
  file: string;
  keyword: string;
  preview: string;
}
