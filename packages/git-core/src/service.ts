import { invoke } from "@tauri-apps/api/core";
import type {
  CreateBranchPayload,
  DeleteBranchPayload,
  GitBranchInfo,
  GitCommandOutput,
  GitCommitInfo,
  GitConflictFile,
  GitRemote,
  GitStashInfo,
  GitStatus,
  GitTag,
  GitWorktreeInfo,
  MergeBranchPayload,
  RebaseBranchPayload,
  SecretFinding,
} from "./types.js";

export const SECRET_PATTERNS = [
  /token\s*[:=]\s*["']?([A-Za-z0-9._\-]{12,})/gi,
  /password\s*[:=]\s*["']?([^"'\s]{8,})/gi,
  /secret\s*[:=]\s*["']?([^"'\s]{8,})/gi,
  /api[_-]?key\s*[:=]\s*["']?([A-Za-z0-9._\-]{12,})/gi,
  /authorization\s*[:=]\s*["']?([^"'\n]{12,})/gi,
  /bearer\s+([A-Za-z0-9._\-]{12,})/gi,
  /client_secret\s*[:=]\s*["']?([^"'\s]{8,})/gi,
  /private[_-]?key\s*[:=]\s*["']?([^"']{20,})/gi,
];

export function maskSecrets(value: string): string {
  let masked = value;
  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, (match, secret: string) =>
      match.replace(secret, "********"),
    );
  }
  return masked;
}

export async function scanGitSecrets(
  repoPath: string,
  files: string[],
): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];
  for (const file of files) {
    try {
      const content = await invoke<string>("git_read_worktree_file", {
        workspacePath: repoPath,
        filePath: file,
      });
      for (const pattern of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        const match = pattern.exec(content);
        if (match) {
          findings.push({
            file,
            keyword: match[0].split(/[:=\s]/)[0],
            preview: maskSecrets(match[0]).slice(0, 120),
          });
        }
      }
    } catch {
      // deleted/binary files are ignored
    }
  }
  return findings;
}

export const gitApi = {
  status(repoPath: string) {
    return invoke<GitStatus>("git_status", { workspacePath: repoPath });
  },
  init(repoPath: string, defaultBranch?: string) {
    return invoke<GitCommandOutput>("git_init", { workspacePath: repoPath, defaultBranch });
  },
  clone(parentPath: string, repositoryUrl: string, directoryName: string) {
    return invoke<GitCommandOutput>("git_clone", { parentPath, repositoryUrl, directoryName });
  },
  fetch(repoPath: string, remote?: string) {
    return invoke<GitCommandOutput>("git_fetch", { workspacePath: repoPath, remote });
  },
  pull(repoPath: string, mode?: "merge" | "rebase") {
    return invoke<GitCommandOutput>("git_pull", { workspacePath: repoPath, mode });
  },
  push(repoPath: string, remote?: string, branch?: string, force = false) {
    return invoke<GitCommandOutput>("git_push", { workspacePath: repoPath, remote, branch, force });
  },
  stage(repoPath: string, filePath?: string, all = false) {
    return invoke<GitCommandOutput>("git_stage", { workspacePath: repoPath, filePath, all });
  },
  unstage(repoPath: string, filePath?: string, all = false) {
    return invoke<GitCommandOutput>("git_unstage", { workspacePath: repoPath, filePath, all });
  },
  discard(repoPath: string, filePath: string) {
    return invoke<GitCommandOutput>("git_discard", { workspacePath: repoPath, filePath });
  },
  commit(
    repoPath: string,
    message: string,
    amend: boolean,
    authorName?: string,
    authorEmail?: string,
  ) {
    return invoke<GitCommandOutput>("git_commit", {
      workspacePath: repoPath,
      message,
      amend,
      authorName,
      authorEmail,
    });
  },
  diff(repoPath: string, filePath?: string, staged = false) {
    return invoke<string>("git_diff", { workspacePath: repoPath, filePath, staged });
  },
  showFile(repoPath: string, filePath: string, revision = "HEAD") {
    return invoke<string>("git_show_file", { workspacePath: repoPath, filePath, revision });
  },
  readFile(repoPath: string, filePath: string) {
    return invoke<string>("git_read_worktree_file", { workspacePath: repoPath, filePath });
  },
  writeFile(repoPath: string, filePath: string, content: string) {
    return invoke<void>("git_write_worktree_file", { workspacePath: repoPath, filePath, content });
  },
  log(repoPath: string, limit = 100) {
    return invoke<GitCommitInfo[]>("git_log", { workspacePath: repoPath, limit });
  },
  commitDiff(repoPath: string, commitHash: string) {
    return invoke<string>("git_commit_diff", { workspacePath: repoPath, commitHash });
  },
  revertCommit(repoPath: string, commitHash: string) {
    return invoke<GitCommandOutput>("git_revert_commit", { workspacePath: repoPath, commitHash });
  },
  branches(repoPath: string) {
    return invoke<GitBranchInfo[]>("git_list_branches", { workspacePath: repoPath });
  },
  getBranches(repoPath: string) {
    return invoke<GitBranchInfo[]>("git_list_branches", { workspacePath: repoPath });
  },
  async getCurrentBranch(repoPath: string) {
    const branches = await invoke<GitBranchInfo[]>("git_list_branches", { workspacePath: repoPath });
    const current = branches.find((branch) => branch.isCurrent);
    if (!current) throw new Error("No current branch found");
    return current;
  },
  checkout(repoPath: string, branch: string) {
    return invoke<GitCommandOutput>("git_checkout", { workspacePath: repoPath, branch });
  },
  checkoutBranch(repoPath: string, branchName: string) {
    return invoke<GitCommandOutput>("git_checkout", { workspacePath: repoPath, branch: branchName });
  },
  createBranch(repoPath: string, branch: string, checkout = true, startPoint?: string) {
    return invoke<GitCommandOutput>("git_create_branch", {
      workspacePath: repoPath,
      branch,
      checkout,
      startPoint,
    });
  },
  createBranchFromPayload(repoPath: string, payload: CreateBranchPayload) {
    return invoke<GitCommandOutput>("git_create_branch", {
      workspacePath: repoPath,
      branch: payload.name,
      checkout: payload.checkout,
      startPoint: payload.from || undefined,
    });
  },
  deleteBranch(repoPath: string, branch: string, force = false) {
    return invoke<GitCommandOutput>("git_delete_branch", { workspacePath: repoPath, branch, force });
  },
  deleteBranchFromPayload(repoPath: string, payload: DeleteBranchPayload) {
    return invoke<GitCommandOutput>("git_delete_branch", {
      workspacePath: repoPath,
      branch: payload.branchName,
      force: payload.force,
    });
  },
  renameBranch(repoPath: string, oldName: string, newName: string) {
    return invoke<GitCommandOutput>("git_rename_branch", {
      workspacePath: repoPath,
      oldName,
      newName,
    });
  },
  remotes(repoPath: string) {
    return invoke<GitRemote[]>("git_remote_list", { workspacePath: repoPath });
  },
  setRemote(repoPath: string, name: string, url: string) {
    return invoke<GitCommandOutput>("git_remote_set", { workspacePath: repoPath, name, url });
  },
  removeRemote(repoPath: string, name: string) {
    return invoke<GitCommandOutput>("git_remote_remove", { workspacePath: repoPath, name });
  },
  stashes(repoPath: string) {
    return invoke<GitStashInfo[]>("git_stash_list", { workspacePath: repoPath });
  },
  stashPush(repoPath: string, message?: string, includeUntracked = true) {
    return invoke<GitCommandOutput>("git_stash_push", {
      workspacePath: repoPath,
      message,
      includeUntracked,
    });
  },
  stashApply(repoPath: string, stash: string, pop = false) {
    return invoke<GitCommandOutput>("git_stash_apply", { workspacePath: repoPath, stash, pop });
  },
  stashDrop(repoPath: string, stash: string) {
    return invoke<GitCommandOutput>("git_stash_drop", { workspacePath: repoPath, stash });
  },
  stashDiff(repoPath: string, stash: string) {
    return invoke<string>("git_stash_diff", { workspacePath: repoPath, stash });
  },
  conflictFile(repoPath: string, filePath: string) {
    return invoke<GitConflictFile>("git_conflict_file", { workspacePath: repoPath, filePath });
  },
  conflictAccept(repoPath: string, filePath: string, side: "ours" | "theirs" | "both") {
    return invoke<GitCommandOutput>("git_conflict_accept", {
      workspacePath: repoPath,
      filePath,
      side,
    });
  },
  markResolved(repoPath: string, filePath: string) {
    return invoke<GitCommandOutput>("git_mark_resolved", { workspacePath: repoPath, filePath });
  },
  merge(repoPath: string, branch: string) {
    return invoke<GitCommandOutput>("git_merge", { workspacePath: repoPath, branch });
  },
  mergeBranch(repoPath: string, payload: MergeBranchPayload) {
    return invoke<GitCommandOutput>("git_merge", {
      workspacePath: repoPath,
      branch: payload.sourceBranch,
      strategy: payload.strategy,
    });
  },
  rebase(repoPath: string, branch: string) {
    return invoke<GitCommandOutput>("git_rebase", { workspacePath: repoPath, branch });
  },
  rebaseBranch(repoPath: string, payload: RebaseBranchPayload) {
    return invoke<GitCommandOutput>("git_rebase", {
      workspacePath: repoPath,
      branch: payload.targetBranch,
      interactive: payload.interactive,
    });
  },
  continue(repoPath: string, operation: "merge" | "rebase") {
    return invoke<GitCommandOutput>("git_continue", { workspacePath: repoPath, operation });
  },
  abort(repoPath: string, operation: "merge" | "rebase") {
    return invoke<GitCommandOutput>("git_abort", { workspacePath: repoPath, operation });
  },
  terminal(repoPath: string, command: string) {
    return invoke<GitCommandOutput>("git_terminal_run", {
      payload: { workspacePath: repoPath, command },
    });
  },
  tags(repoPath: string) {
    return invoke<GitTag[]>("git_tag_list", { workspacePath: repoPath });
  },
  createTag(repoPath: string, name: string, message?: string, target?: string) {
    return invoke<GitCommandOutput>("git_tag_create", {
      workspacePath: repoPath,
      name,
      message,
      target,
    });
  },
  deleteTag(repoPath: string, name: string) {
    return invoke<GitCommandOutput>("git_tag_delete", { workspacePath: repoPath, name });
  },
  worktrees(repoPath: string) {
    return invoke<GitWorktreeInfo[]>("git_worktree_list", { workspacePath: repoPath });
  },
  addWorktree(repoPath: string, path: string, branch: string) {
    return invoke<GitCommandOutput>("git_worktree_add", { workspacePath: repoPath, path, branch });
  },
  removeWorktree(repoPath: string, path: string) {
    return invoke<GitCommandOutput>("git_worktree_remove", { workspacePath: repoPath, path });
  },
  githubCliToken() {
    return invoke<string>("github_cli_token");
  },
};
