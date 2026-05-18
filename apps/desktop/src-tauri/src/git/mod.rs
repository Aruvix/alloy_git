use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
};

// ── Data types ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub is_repo: bool,
    pub branch: Option<String>,
    pub detached: bool,
    pub state: String,
    pub changes: Vec<GitChange>,
    pub ahead: i32,
    pub behind: i32,
    pub upstream: Option<String>,
    pub remotes: Vec<GitRemote>,
    pub conflicted_files: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub kind: String,
    pub old_path: Option<String>,
    pub staged: bool,
    pub unstaged: bool,
    pub untracked: bool,
    pub conflicted: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub code: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub date: String,
    pub changed_files: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitBranch {
    pub id: String,
    pub name: String,
    pub short_name: String,
    #[serde(rename = "type")]
    pub branch_type: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub is_default: bool,
    pub is_protected: bool,
    pub upstream: Option<String>,
    pub ahead: i32,
    pub behind: i32,
    pub last_commit_hash: Option<String>,
    pub last_commit_message: Option<String>,
    pub last_commit_author: Option<String>,
    pub last_commit_date: Option<String>,
    pub status: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub url: String,
    pub direction: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStash {
    pub index: String,
    pub message: String,
    pub branch: String,
    pub hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflictFile {
    pub path: String,
    pub base: String,
    pub ours: String,
    pub theirs: String,
    pub worktree: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTag {
    pub name: String,
    pub hash: String,
    pub message: Option<String>,
    pub is_annotated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitWorktree {
    pub path: String,
    pub head: String,
    pub branch: Option<String>,
    pub is_main: bool,
    pub is_locked: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitTerminalPayload {
    pub workspace_path: String,
    pub command: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn ensure_path(path: &str) -> Result<PathBuf, String> {
    let root = Path::new(path);
    if !root.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    root.canonicalize()
        .map_err(|e| format!("Invalid path: {e}"))
}

fn safe_repo_path(workspace_path: &str, file_path: &str) -> Result<PathBuf, String> {
    let root = ensure_path(workspace_path)?;
    let full = root.join(file_path);
    let canonical = if full.exists() {
        full.canonicalize()
            .map_err(|e| format!("Invalid file path: {e}"))?
    } else {
        let parent = full
            .parent()
            .ok_or_else(|| "Invalid file path".to_string())?;
        let parent = parent
            .canonicalize()
            .map_err(|e| format!("Invalid parent path: {e}"))?;
        if !parent.starts_with(&root) {
            return Err("Refusing to access outside repository root".to_string());
        }
        return Ok(full);
    };
    if !canonical.starts_with(&root) {
        return Err("Refusing to access outside repository root".to_string());
    }
    Ok(canonical)
}

fn run_git(workspace_path: &str, args: &[&str]) -> Result<GitCommandOutput, String> {
    let cwd = ensure_path(workspace_path)?;
    let output = Command::new("git")
        .current_dir(&cwd)
        .args(args)
        .output()
        .map_err(|e| format!("git {} failed: {e}", args.join(" ")))?;
    Ok(GitCommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

fn run_git_checked(workspace_path: &str, args: &[&str]) -> Result<GitCommandOutput, String> {
    let output = run_git(workspace_path, args)?;
    if output.code == 0 {
        Ok(output)
    } else {
        Err(if output.stderr.trim().is_empty() {
            output.stdout.trim().to_string()
        } else {
            output.stderr.trim().to_string()
        })
    }
}

fn is_repo(workspace_path: &str) -> bool {
    run_git(workspace_path, &["rev-parse", "--git-dir"])
        .map(|o| o.code == 0)
        .unwrap_or(false)
}

const NO_UPSTREAM_PULL_MESSAGE: &str =
    "Current branch has no upstream and no matching remote branch was found. Pick a remote branch or set upstream first.";

#[derive(Debug, PartialEq, Eq)]
enum PullUpstream {
    Existing,
    SetUpstream { remote: String, branch: String },
}

fn select_pull_upstream(
    current_branch: &str,
    existing_upstream: Option<&str>,
    remote_names: &[String],
    remote_branches: &[String],
) -> Option<PullUpstream> {
    if existing_upstream.is_some_and(|upstream| !upstream.trim().is_empty()) {
        return Some(PullUpstream::Existing);
    }

    if current_branch.trim().is_empty() {
        return None;
    }

    let mut matching_remotes: Vec<String> = remote_branches
        .iter()
        .filter_map(|remote_branch| {
            remote_names
                .iter()
                .find(|remote| remote_branch == &format!("{remote}/{current_branch}"))
                .cloned()
        })
        .collect();

    matching_remotes.sort_by(|a, b| match (a == "origin", b == "origin") {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.cmp(b),
    });

    matching_remotes
        .into_iter()
        .next()
        .map(|remote| PullUpstream::SetUpstream {
            remote,
            branch: current_branch.to_string(),
        })
}

fn current_branch_name(workspace_path: &str) -> Result<String, String> {
    let output = run_git_checked(workspace_path, &["branch", "--show-current"])?;
    let branch = output.stdout.trim().to_string();
    if branch.is_empty() {
        Err("Cannot pull while HEAD is detached. Check out a branch first.".to_string())
    } else {
        Ok(branch)
    }
}

fn current_upstream_name(workspace_path: &str) -> Option<String> {
    run_git(
        workspace_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .ok()
    .filter(|o| o.code == 0)
    .map(|o| o.stdout.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn remote_branch_names(workspace_path: &str) -> Result<Vec<String>, String> {
    let output = run_git_checked(
        workspace_path,
        &["for-each-ref", "--format=%(refname:short)", "refs/remotes"],
    )?;
    Ok(output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.ends_with("/HEAD"))
        .map(ToString::to_string)
        .collect())
}

fn configured_remote_names(workspace_path: &str) -> Result<Vec<String>, String> {
    let output = run_git_checked(workspace_path, &["remote"])?;
    Ok(output
        .stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToString::to_string)
        .collect())
}

fn git_state(workspace_path: &str, detached: bool, conflicted: bool) -> String {
    if conflicted {
        return "conflict".to_string();
    }
    let git_dir = run_git(workspace_path, &["rev-parse", "--git-dir"])
        .ok()
        .map(|o| o.stdout.trim().to_string())
        .unwrap_or_default();
    let git_dir_path = Path::new(&git_dir);
    let base = if git_dir_path.is_absolute() {
        PathBuf::from(&git_dir)
    } else {
        Path::new(workspace_path).join(&git_dir)
    };
    if base.join("MERGE_HEAD").exists() {
        return "merge".to_string();
    }
    if base.join("rebase-merge").exists() || base.join("rebase-apply").exists() {
        return "rebase".to_string();
    }
    if base.join("CHERRY_PICK_HEAD").exists() {
        return "cherry-pick".to_string();
    }
    if base.join("BISECT_LOG").exists() {
        return "bisect".to_string();
    }
    if detached {
        return "detached".to_string();
    }
    "clean".to_string()
}

fn get_ahead_behind(workspace_path: &str) -> Result<(i32, i32), String> {
    let output = run_git(
        workspace_path,
        &["rev-list", "--count", "--left-right", "@{upstream}...HEAD"],
    )?;
    if output.code != 0 {
        return Ok((0, 0));
    }
    let parts: Vec<&str> = output.stdout.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return Ok((0, 0));
    }
    let behind = parts[0].parse::<i32>().unwrap_or(0);
    let ahead = parts[1].parse::<i32>().unwrap_or(0);
    Ok((ahead, behind))
}

fn parse_porcelain_status(raw: &str) -> Vec<GitChange> {
    let mut changes: Vec<GitChange> = Vec::new();
    let entries: Vec<&str> = raw.split('\0').filter(|s| s.len() >= 3).collect();
    let mut i = 0;
    while i < entries.len() {
        let entry = entries[i];
        let xy: Vec<char> = entry.chars().take(2).collect();
        if xy.len() < 2 {
            i += 1;
            continue;
        }
        let x = xy[0];
        let y = xy[1];
        let path = entry[3..].to_string();
        let is_rename = x == 'R' || y == 'R' || x == 'C' || y == 'C';
        let old_path = if is_rename && i + 1 < entries.len() {
            i += 1;
            Some(entries[i].to_string())
        } else {
            None
        };
        let untracked = x == '?' && y == '?';
        let conflicted = matches!(
            (x, y),
            ('D', 'D')
                | ('A', 'A')
                | ('U', 'U')
                | ('A', 'U')
                | ('U', 'A')
                | ('D', 'U')
                | ('U', 'D')
        );
        let staged = !untracked && !conflicted && x != ' ' && x != '?';
        let unstaged = !untracked && !conflicted && y != ' ' && y != '?';
        let kind = match (x, y) {
            ('?', '?') => "untracked",
            ('A', _) | (_, 'A') => "added",
            ('D', _) | (_, 'D') => "deleted",
            ('R', _) | (_, 'R') => "renamed",
            ('C', _) | (_, 'C') => "copied",
            ('M', _) | (_, 'M') => "modified",
            _ => "modified",
        }
        .to_string();
        changes.push(GitChange {
            path,
            kind,
            old_path,
            staged,
            unstaged,
            untracked,
            conflicted,
        });
        i += 1;
    }
    changes
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_status(workspace_path: String) -> Result<GitStatus, String> {
    ensure_path(&workspace_path)?;
    if !is_repo(&workspace_path) {
        return Ok(GitStatus {
            is_repo: false,
            branch: None,
            detached: false,
            state: "not_connected".to_string(),
            changes: vec![],
            ahead: 0,
            behind: 0,
            upstream: None,
            remotes: vec![],
            conflicted_files: vec![],
        });
    }
    let branch_out = run_git(&workspace_path, &["branch", "--show-current"])?;
    let branch = branch_out.stdout.trim().to_string();
    let detached = branch.is_empty();
    let branch = if detached { None } else { Some(branch) };

    let status_out = run_git_checked(&workspace_path, &["status", "--porcelain=v1", "-z"])?;
    let changes = parse_porcelain_status(&status_out.stdout);
    let conflicted_files: Vec<String> = changes
        .iter()
        .filter(|c| c.conflicted)
        .map(|c| c.path.clone())
        .collect();
    let state = git_state(
        &workspace_path,
        detached,
        !conflicted_files.is_empty() as bool,
    );
    let upstream = run_git(
        &workspace_path,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .ok()
    .filter(|o| o.code == 0)
    .map(|o| o.stdout.trim().to_string())
    .filter(|s| !s.is_empty());
    let (ahead, behind) = get_ahead_behind(&workspace_path).unwrap_or((0, 0));
    let remotes = git_remote_list(workspace_path.clone())
        .await
        .unwrap_or_default();

    Ok(GitStatus {
        is_repo: true,
        branch,
        detached,
        state,
        changes,
        ahead,
        behind,
        upstream,
        remotes,
        conflicted_files,
    })
}

#[tauri::command]
pub async fn git_init(
    workspace_path: String,
    default_branch: Option<String>,
) -> Result<GitCommandOutput, String> {
    let branch = default_branch.unwrap_or_else(|| "main".to_string());
    run_git_checked(&workspace_path, &["init", "-b", &branch])
}

#[tauri::command]
pub async fn git_clone(
    parent_path: String,
    repository_url: String,
    directory_name: String,
) -> Result<GitCommandOutput, String> {
    let cwd = ensure_path(&parent_path)?;
    let output = Command::new("git")
        .current_dir(&cwd)
        .args(["clone", &repository_url, &directory_name])
        .output()
        .map_err(|e| format!("git clone failed: {e}"))?;
    Ok(GitCommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
pub async fn git_fetch(
    workspace_path: String,
    remote: Option<String>,
) -> Result<GitCommandOutput, String> {
    match remote {
        Some(r) => run_git_checked(&workspace_path, &["fetch", &r, "--prune"]),
        None => run_git_checked(&workspace_path, &["fetch", "--all", "--prune"]),
    }
}

#[tauri::command]
pub async fn git_pull(
    workspace_path: String,
    mode: Option<String>,
) -> Result<GitCommandOutput, String> {
    let rebase = mode.as_deref() == Some("rebase");
    let current_branch = current_branch_name(&workspace_path)?;
    let existing_upstream = current_upstream_name(&workspace_path);
    let (remote_names, remote_branches) = if existing_upstream.is_some() {
        (vec![], vec![])
    } else {
        (
            configured_remote_names(&workspace_path)?,
            remote_branch_names(&workspace_path)?,
        )
    };

    match select_pull_upstream(
        &current_branch,
        existing_upstream.as_deref(),
        &remote_names,
        &remote_branches,
    ) {
        Some(PullUpstream::Existing) if rebase => {
            run_git_checked(&workspace_path, &["pull", "--rebase"])
        }
        Some(PullUpstream::Existing) => run_git_checked(&workspace_path, &["pull"]),
        Some(PullUpstream::SetUpstream { remote, branch }) if rebase => run_git_checked(
            &workspace_path,
            &["pull", "--rebase", "--set-upstream", &remote, &branch],
        ),
        Some(PullUpstream::SetUpstream { remote, branch }) => run_git_checked(
            &workspace_path,
            &["pull", "--set-upstream", &remote, &branch],
        ),
        None => Err(NO_UPSTREAM_PULL_MESSAGE.to_string()),
    }
}

#[tauri::command]
pub async fn git_push(
    workspace_path: String,
    remote: Option<String>,
    branch: Option<String>,
    force: bool,
) -> Result<GitCommandOutput, String> {
    let remote_str = remote.as_deref().unwrap_or("origin");

    // Resolve the branch to push to an explicit name rather than the symbolic HEAD.
    // Using HEAD directly fails with push.default=simple when no upstream tracking
    // branch is configured, even if the remote branch already exists.
    let resolved_branch = match branch {
        Some(ref b) => b.clone(),
        None => current_branch_name(&workspace_path)?,
    };

    // Mirror git_pull's smart upstream logic: add --set-upstream when the current
    // branch has no remote tracking ref, so that ahead/behind counts work afterward.
    let needs_upstream = current_upstream_name(&workspace_path).is_none();

    let mut args: Vec<&str> = vec!["push"];
    if needs_upstream {
        args.push("--set-upstream");
    }
    args.push(remote_str);
    args.push(&resolved_branch);
    if force {
        args.push("--force-with-lease");
    }

    run_git_checked(&workspace_path, &args)
}

#[tauri::command]
pub async fn git_stage(
    workspace_path: String,
    file_path: Option<String>,
    all: bool,
) -> Result<GitCommandOutput, String> {
    if all || file_path.is_none() {
        run_git_checked(&workspace_path, &["add", "-A"])
    } else {
        run_git_checked(
            &workspace_path,
            &["add", "--", file_path.as_deref().unwrap()],
        )
    }
}

#[tauri::command]
pub async fn git_unstage(
    workspace_path: String,
    file_path: Option<String>,
    all: bool,
) -> Result<GitCommandOutput, String> {
    if all || file_path.is_none() {
        run_git_checked(&workspace_path, &["reset", "HEAD"])
    } else {
        run_git_checked(
            &workspace_path,
            &["reset", "HEAD", "--", file_path.as_deref().unwrap()],
        )
    }
}

#[tauri::command]
pub async fn git_discard(
    workspace_path: String,
    file_path: String,
) -> Result<GitCommandOutput, String> {
    let is_untracked = run_git(
        &workspace_path,
        &[
            "ls-files",
            "--others",
            "--exclude-standard",
            "--",
            &file_path,
        ],
    )?
    .stdout
    .contains(&file_path);
    if is_untracked {
        run_git_checked(&workspace_path, &["clean", "-fd", "--", &file_path])
    } else {
        run_git_checked(&workspace_path, &["checkout", "HEAD", "--", &file_path])
    }
}

#[tauri::command]
pub async fn git_commit(
    workspace_path: String,
    message: String,
    amend: bool,
    author_name: Option<String>,
    author_email: Option<String>,
) -> Result<GitCommandOutput, String> {
    let mut args = vec!["commit", "-m", &message];
    if amend {
        args.push("--amend");
    }
    let author_override = match (author_name.as_deref(), author_email.as_deref()) {
        (Some(name), Some(email)) if !name.is_empty() && !email.is_empty() => {
            Some(format!("{name} <{email}>"))
        }
        _ => None,
    };
    if let Some(ref author) = author_override {
        args.push("--author");
        args.push(author.as_str());
    }
    run_git_checked(&workspace_path, &args)
}

#[tauri::command]
pub async fn git_diff(
    workspace_path: String,
    file_path: Option<String>,
    staged: bool,
) -> Result<String, String> {
    let mut args = vec!["diff", "--patch", "-U3"];
    if staged {
        args.push("--staged");
    }
    if let Some(ref path) = file_path {
        args.push("--");
        args.push(path.as_str());
    }
    Ok(run_git(&workspace_path, &args)?.stdout)
}

#[tauri::command]
pub async fn git_show_file(
    workspace_path: String,
    file_path: String,
    revision: String,
) -> Result<String, String> {
    let spec = format!("{revision}:{file_path}");
    Ok(run_git(&workspace_path, &["show", &spec])?.stdout)
}

#[tauri::command]
pub async fn git_read_worktree_file(
    workspace_path: String,
    file_path: String,
) -> Result<String, String> {
    let full = safe_repo_path(&workspace_path, &file_path)?;
    std::fs::read_to_string(&full).map_err(|e| format!("Failed to read {file_path}: {e}"))
}

#[tauri::command]
pub async fn git_write_worktree_file(
    workspace_path: String,
    file_path: String,
    content: String,
) -> Result<(), String> {
    let full = safe_repo_path(&workspace_path, &file_path)?;
    std::fs::write(&full, content).map_err(|e| format!("Failed to write {file_path}: {e}"))
}

#[tauri::command]
pub async fn git_log(workspace_path: String, limit: u32) -> Result<Vec<GitCommit>, String> {
    let limit_str = limit.to_string();
    let fmt = "%H\x1f%h\x1f%s\x1f%an\x1f%ae\x1f%aI";
    let output = run_git(
        &workspace_path,
        &[
            "log",
            &format!("-{limit_str}"),
            &format!("--format={fmt}"),
            "--name-only",
        ],
    )?;
    if output.code != 0 {
        return Ok(vec![]);
    }
    let mut commits = Vec::new();
    let mut current: Option<GitCommit> = None;
    for line in output.stdout.lines() {
        if line.contains('\x1f') {
            if let Some(commit) = current.take() {
                commits.push(commit);
            }
            let parts: Vec<&str> = line.splitn(6, '\x1f').collect();
            if parts.len() == 6 {
                current = Some(GitCommit {
                    hash: parts[0].to_string(),
                    short_hash: parts[1].to_string(),
                    message: parts[2].to_string(),
                    author: parts[3].to_string(),
                    email: parts[4].to_string(),
                    date: parts[5].to_string(),
                    changed_files: vec![],
                });
            }
        } else if !line.trim().is_empty() {
            if let Some(ref mut c) = current {
                c.changed_files.push(line.trim().to_string());
            }
        }
    }
    if let Some(commit) = current {
        commits.push(commit);
    }
    Ok(commits)
}

#[tauri::command]
pub async fn git_commit_diff(
    workspace_path: String,
    commit_hash: String,
) -> Result<String, String> {
    // Use "--pretty=format:" (explicit empty tformat) for broad git compatibility.
    // Fall back to "diff-tree" for the initial commit which has no parent.
    let result = run_git(
        &workspace_path,
        &["show", "--pretty=format:", "--patch", &commit_hash],
    )?;
    if result.code == 0 {
        return Ok(result.stdout);
    }
    // Initial commit — diff against empty tree
    let empty_tree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
    Ok(run_git_checked(
        &workspace_path,
        &[
            "diff-tree",
            "--no-commit-id",
            "-p",
            "-r",
            &commit_hash,
            "--root",
        ],
    )
    .or_else(|_| run_git_checked(&workspace_path, &["diff", empty_tree, &commit_hash]))?
    .stdout)
}

#[tauri::command]
pub async fn git_revert_commit(
    workspace_path: String,
    commit_hash: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["revert", "--no-edit", &commit_hash])
}

// ── Branches ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_list_branches(workspace_path: String) -> Result<Vec<GitBranch>, String> {
    let current = run_git(&workspace_path, &["branch", "--show-current"])
        .map(|o| o.stdout.trim().to_string())
        .unwrap_or_default();
    let default_branch = run_git(
        &workspace_path,
        &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    )
    .ok()
    .and_then(|o| {
        o.stdout
            .trim()
            .strip_prefix("origin/")
            .map(|s| s.to_string())
    })
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "main".to_string());
    let local = run_git(
        &workspace_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)|%(upstream:short)|%(objectname:short)|%(subject)|%(authorname)|%(committerdate:iso-strict)",
            "refs/heads",
        ],
    )?;
    if local.code != 0 {
        return Ok(vec![]);
    }

    let branch_counts = |name: &str, upstream: &Option<String>| -> (i32, i32, String) {
        let Some(upstream_name) = upstream else {
            return (0, 0, "no_upstream".to_string());
        };
        let range = format!("{}...{}", name, upstream_name);
        let output = run_git(
            &workspace_path,
            &["rev-list", "--left-right", "--count", &range],
        )
        .ok();
        let Some(output) = output else {
            return (0, 0, "no_upstream".to_string());
        };
        let mut parts = output.stdout.split_whitespace();
        let ahead = parts
            .next()
            .and_then(|p| p.parse::<i32>().ok())
            .unwrap_or(0);
        let behind = parts
            .next()
            .and_then(|p| p.parse::<i32>().ok())
            .unwrap_or(0);
        let status = match (ahead, behind) {
            (0, 0) => "up_to_date",
            (_, 0) => "ahead",
            (0, _) => "behind",
            _ => "diverged",
        };
        (ahead, behind, status.to_string())
    };

    let branch_leaf =
        |name: &str| -> String { name.rsplit('/').next().unwrap_or(name).to_string() };

    let mut branches: Vec<GitBranch> = local
        .stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.splitn(6, '|').collect();
            let name = parts.first().copied().unwrap_or_default().to_string();
            let upstream = parts
                .get(1)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let (ahead, behind, status) = branch_counts(&name, &upstream);
            GitBranch {
                id: format!("local:{name}"),
                is_current: name == current,
                short_name: branch_leaf(&name),
                branch_type: "local".to_string(),
                is_remote: false,
                is_default: name == default_branch,
                is_protected: name == default_branch || name == "main" || name == "master",
                name: name.clone(),
                upstream,
                ahead,
                behind,
                last_commit_hash: parts
                    .get(2)
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                last_commit_message: parts
                    .get(3)
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                last_commit_author: parts
                    .get(4)
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                last_commit_date: parts
                    .get(5)
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
                status,
                last_used_at: parts
                    .get(5)
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string()),
            }
        })
        .collect();
    let remote = run_git(
        &workspace_path,
        &[
            "for-each-ref",
            "--format=%(refname:short)|%(objectname:short)|%(subject)|%(authorname)|%(committerdate:iso-strict)",
            "refs/remotes",
        ],
    )?;
    for line in remote.stdout.lines() {
        let parts: Vec<&str> = line.splitn(5, '|').collect();
        let name = parts.first().copied().unwrap_or_default().trim();
        if name.is_empty() || name.ends_with("/HEAD") {
            continue;
        }
        branches.push(GitBranch {
            id: format!("remote:{name}"),
            name: name.to_string(),
            short_name: branch_leaf(name),
            branch_type: "remote".to_string(),
            is_current: false,
            is_remote: true,
            is_default: name == format!("origin/{default_branch}"),
            is_protected: name == format!("origin/{default_branch}")
                || name.ends_with("/main")
                || name.ends_with("/master"),
            upstream: None,
            ahead: 0,
            behind: 0,
            last_commit_hash: parts
                .get(1)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            last_commit_message: parts
                .get(2)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            last_commit_author: parts
                .get(3)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            last_commit_date: parts
                .get(4)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
            status: "up_to_date".to_string(),
            last_used_at: parts
                .get(4)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string()),
        });
    }
    Ok(branches)
}

#[tauri::command]
pub async fn git_checkout(
    workspace_path: String,
    branch: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["checkout", &branch])
}

#[tauri::command]
pub async fn git_create_branch(
    workspace_path: String,
    branch: String,
    checkout: bool,
    start_point: Option<String>,
) -> Result<GitCommandOutput, String> {
    let mut args = if checkout {
        vec!["checkout".to_string(), "-b".to_string(), branch]
    } else {
        vec!["branch".to_string(), branch]
    };
    if let Some(sp) = start_point {
        if !sp.trim().is_empty() {
            args.push(sp);
        }
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git_checked(&workspace_path, &args_ref)
}

#[tauri::command]
pub async fn git_delete_branch(
    workspace_path: String,
    branch: String,
    force: bool,
) -> Result<GitCommandOutput, String> {
    run_git_checked(
        &workspace_path,
        &["branch", if force { "-D" } else { "-d" }, &branch],
    )
}

#[tauri::command]
pub async fn git_rename_branch(
    workspace_path: String,
    old_name: String,
    new_name: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["branch", "-m", &old_name, &new_name])
}

// ── Remotes ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_remote_list(workspace_path: String) -> Result<Vec<GitRemote>, String> {
    let output = run_git(&workspace_path, &["remote", "-v"])?;
    if output.code != 0 {
        return Ok(vec![]);
    }
    let remotes = output
        .stdout
        .lines()
        .filter_map(|line| {
            let parts = line.split_whitespace().collect::<Vec<_>>();
            if parts.len() < 3 {
                return None;
            }
            Some(GitRemote {
                name: parts[0].to_string(),
                url: parts[1].to_string(),
                direction: parts[2].trim_matches(['(', ')']).to_string(),
            })
        })
        .collect();
    Ok(remotes)
}

#[tauri::command]
pub async fn git_remote_set(
    workspace_path: String,
    name: String,
    url: String,
) -> Result<GitCommandOutput, String> {
    let existing = git_remote_list(workspace_path.clone()).await?;
    if existing.iter().any(|r| r.name == name) {
        run_git_checked(&workspace_path, &["remote", "set-url", &name, &url])
    } else {
        run_git_checked(&workspace_path, &["remote", "add", &name, &url])
    }
}

#[tauri::command]
pub async fn git_remote_remove(
    workspace_path: String,
    name: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["remote", "remove", &name])
}

// ── Stashes ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_stash_list(workspace_path: String) -> Result<Vec<GitStash>, String> {
    let output = run_git(
        &workspace_path,
        &["stash", "list", "--format=%gd\x1f%gs\x1f%H"],
    )?;
    if output.code != 0 {
        return Ok(vec![]);
    }
    let stashes = output
        .stdout
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('\x1f').collect();
            if parts.len() < 3 {
                return None;
            }
            let message = parts[1].to_string();
            let branch = message
                .split_once("On ")
                .and_then(|(_, rest)| rest.split_once(':').map(|(b, _)| b.to_string()))
                .unwrap_or_default();
            Some(GitStash {
                index: parts[0].to_string(),
                message,
                branch,
                hash: parts[2].to_string(),
            })
        })
        .collect();
    Ok(stashes)
}

#[tauri::command]
pub async fn git_stash_push(
    workspace_path: String,
    message: Option<String>,
    include_untracked: bool,
) -> Result<GitCommandOutput, String> {
    let mut args = vec!["stash", "push"];
    if include_untracked {
        args.push("-u");
    }
    if let Some(ref msg) = message {
        if !msg.trim().is_empty() {
            args.push("-m");
            args.push(msg.as_str());
        }
    }
    run_git_checked(&workspace_path, &args)
}

#[tauri::command]
pub async fn git_stash_apply(
    workspace_path: String,
    stash: String,
    pop: bool,
) -> Result<GitCommandOutput, String> {
    run_git_checked(
        &workspace_path,
        &["stash", if pop { "pop" } else { "apply" }, &stash],
    )
}

#[tauri::command]
pub async fn git_stash_drop(
    workspace_path: String,
    stash: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["stash", "drop", &stash])
}

#[tauri::command]
pub async fn git_stash_diff(workspace_path: String, stash: String) -> Result<String, String> {
    Ok(run_git_checked(&workspace_path, &["stash", "show", "-p", &stash])?.stdout)
}

// ── Conflict resolution ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_conflict_file(
    workspace_path: String,
    file_path: String,
) -> Result<GitConflictFile, String> {
    let base = run_git(&workspace_path, &["show", &format!(":1:{file_path}")])
        .map(|o| o.stdout)
        .unwrap_or_default();
    let ours = run_git(&workspace_path, &["show", &format!(":2:{file_path}")])
        .map(|o| o.stdout)
        .unwrap_or_default();
    let theirs = run_git(&workspace_path, &["show", &format!(":3:{file_path}")])
        .map(|o| o.stdout)
        .unwrap_or_default();
    let worktree = git_read_worktree_file(workspace_path.clone(), file_path.clone())
        .await
        .unwrap_or_default();
    Ok(GitConflictFile {
        path: file_path,
        base,
        ours,
        theirs,
        worktree,
    })
}

#[tauri::command]
pub async fn git_conflict_accept(
    workspace_path: String,
    file_path: String,
    side: String,
) -> Result<GitCommandOutput, String> {
    match side.as_str() {
        "ours" => run_git_checked(&workspace_path, &["checkout", "--ours", "--", &file_path]),
        "theirs" => run_git_checked(&workspace_path, &["checkout", "--theirs", "--", &file_path]),
        "both" => {
            let conflict = git_conflict_file(workspace_path.clone(), file_path.clone()).await?;
            git_write_worktree_file(
                workspace_path.clone(),
                file_path.clone(),
                format!("{}\n{}", conflict.ours, conflict.theirs),
            )
            .await?;
            run_git_checked(&workspace_path, &["add", "--", &file_path])
        }
        _ => Err("Unknown conflict side".to_string()),
    }
}

#[tauri::command]
pub async fn git_mark_resolved(
    workspace_path: String,
    file_path: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["add", "--", &file_path])
}

#[tauri::command]
pub async fn git_continue(
    workspace_path: String,
    operation: String,
) -> Result<GitCommandOutput, String> {
    match operation.as_str() {
        "merge" => run_git_checked(&workspace_path, &["merge", "--continue"]),
        "rebase" => run_git_checked(&workspace_path, &["rebase", "--continue"]),
        _ => Err("Unknown operation".to_string()),
    }
}

#[tauri::command]
pub async fn git_abort(
    workspace_path: String,
    operation: String,
) -> Result<GitCommandOutput, String> {
    match operation.as_str() {
        "merge" => run_git_checked(&workspace_path, &["merge", "--abort"]),
        "rebase" => run_git_checked(&workspace_path, &["rebase", "--abort"]),
        _ => Err("Unknown operation".to_string()),
    }
}

#[tauri::command]
pub async fn git_merge(
    workspace_path: String,
    branch: String,
    strategy: Option<String>,
) -> Result<GitCommandOutput, String> {
    match strategy.as_deref() {
        Some("squash") => run_git_checked(&workspace_path, &["merge", "--squash", &branch]),
        Some("fast_forward_only") => {
            run_git_checked(&workspace_path, &["merge", "--ff-only", &branch])
        }
        _ => run_git_checked(&workspace_path, &["merge", &branch]),
    }
}

#[tauri::command]
pub async fn git_rebase(
    workspace_path: String,
    branch: String,
    interactive: Option<bool>,
) -> Result<GitCommandOutput, String> {
    if interactive.unwrap_or(false) {
        run_git_checked(&workspace_path, &["rebase", "-i", &branch])
    } else {
        run_git_checked(&workspace_path, &["rebase", &branch])
    }
}

// ── Tags ──────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_tag_list(workspace_path: String) -> Result<Vec<GitTag>, String> {
    let output = run_git(
        &workspace_path,
        &[
            "tag",
            "-l",
            "--format=%(refname:short)\x1f%(objectname:short)\x1f%(subject)\x1f%(objecttype)",
        ],
    )?;
    if output.code != 0 {
        return Ok(vec![]);
    }
    let tags = output
        .stdout
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let parts: Vec<&str> = line.split('\x1f').collect();
            let name = parts.first().copied().unwrap_or("").to_string();
            let hash = parts.get(1).copied().unwrap_or("").to_string();
            let subject = parts.get(2).copied().unwrap_or("").to_string();
            let obj_type = parts.get(3).copied().unwrap_or("").trim().to_string();
            GitTag {
                name,
                hash,
                message: if subject.is_empty() {
                    None
                } else {
                    Some(subject)
                },
                is_annotated: obj_type == "tag",
            }
        })
        .collect();
    Ok(tags)
}

#[tauri::command]
pub async fn git_tag_create(
    workspace_path: String,
    name: String,
    message: Option<String>,
    target: Option<String>,
) -> Result<GitCommandOutput, String> {
    let mut args = vec!["tag".to_string()];
    if let Some(ref msg) = message {
        if !msg.trim().is_empty() {
            args.extend(["-a".to_string(), "-m".to_string(), msg.clone()]);
        }
    }
    args.push(name);
    if let Some(t) = target {
        if !t.trim().is_empty() {
            args.push(t);
        }
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    run_git_checked(&workspace_path, &args_ref)
}

#[tauri::command]
pub async fn git_tag_delete(
    workspace_path: String,
    name: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["tag", "-d", &name])
}

// ── Worktrees ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_worktree_list(workspace_path: String) -> Result<Vec<GitWorktree>, String> {
    let output = run_git(&workspace_path, &["worktree", "list", "--porcelain"])?;
    if output.code != 0 {
        return Ok(vec![]);
    }
    Ok(parse_worktree_output(&output.stdout))
}

fn parse_worktree_output(stdout: &str) -> Vec<GitWorktree> {
    let mut worktrees = Vec::new();
    let mut path = String::new();
    let mut head = String::new();
    let mut branch: Option<String> = None;
    let mut is_locked = false;
    let mut first = true;

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if !path.is_empty() {
                worktrees.push(GitWorktree {
                    is_main: first,
                    path: path.clone(),
                    head: head.clone(),
                    branch: branch.clone(),
                    is_locked,
                });
                first = false;
            }
            path = line["worktree ".len()..].to_string();
            head = String::new();
            branch = None;
            is_locked = false;
        } else if line.starts_with("HEAD ") {
            head = line["HEAD ".len()..].to_string();
        } else if line.starts_with("branch ") {
            branch = Some(
                line["branch ".len()..]
                    .trim_start_matches("refs/heads/")
                    .to_string(),
            );
        } else if line == "locked" || line.starts_with("locked ") {
            is_locked = true;
        }
    }
    if !path.is_empty() {
        worktrees.push(GitWorktree {
            is_main: first,
            path,
            head,
            branch,
            is_locked,
        });
    }
    worktrees
}

#[tauri::command]
pub async fn git_worktree_add(
    workspace_path: String,
    path: String,
    branch: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["worktree", "add", &path, &branch])
}

#[tauri::command]
pub async fn git_worktree_remove(
    workspace_path: String,
    path: String,
) -> Result<GitCommandOutput, String> {
    run_git_checked(&workspace_path, &["worktree", "remove", &path])
}

// ── Terminal passthrough ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_terminal_run(payload: GitTerminalPayload) -> Result<GitCommandOutput, String> {
    let cwd = ensure_path(&payload.workspace_path)?;
    let shell = if cfg!(target_os = "windows") {
        "cmd"
    } else {
        "sh"
    };
    let flag = if cfg!(target_os = "windows") {
        "/C"
    } else {
        "-lc"
    };
    let output = Command::new(shell)
        .current_dir(cwd)
        .arg(flag)
        .arg(&payload.command)
        .env("TERM", "xterm-256color")
        .env("COLORTERM", "truecolor")
        .env("FORCE_COLOR", "1")
        .env("CLICOLOR_FORCE", "1")
        .env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "color.ui")
        .env("GIT_CONFIG_VALUE_0", "always")
        .output()
        .map_err(|e| format!("Command failed: {e}"))?;
    Ok(GitCommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        code: output.status.code().unwrap_or(-1),
    })
}

// ── System terminal launcher ──────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TerminalApp {
    id: String,
    name: String,
}

#[cfg(any(target_os = "windows", target_os = "linux"))]
fn cmd_exists(name: &str) -> bool {
    let checker = if cfg!(target_os = "windows") {
        "where"
    } else {
        "which"
    };
    Command::new(checker)
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn list_terminals() -> Vec<TerminalApp> {
    let mut list: Vec<TerminalApp> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        let apps: &[(&str, &str, &str)] = &[
            (
                "terminal",
                "Terminal",
                "/System/Applications/Utilities/Terminal.app",
            ),
            ("iterm2", "iTerm2", "/Applications/iTerm.app"),
            ("warp", "Warp", "/Applications/Warp.app"),
            ("alacritty", "Alacritty", "/Applications/Alacritty.app"),
            ("hyper", "Hyper", "/Applications/Hyper.app"),
            ("kitty", "kitty", "/Applications/kitty.app"),
            ("ghostty", "Ghostty", "/Applications/Ghostty.app"),
        ];
        for (id, name, path) in apps {
            if std::path::Path::new(path).exists() {
                list.push(TerminalApp {
                    id: id.to_string(),
                    name: name.to_string(),
                });
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if cmd_exists("wt") {
            list.push(TerminalApp {
                id: "wt".into(),
                name: "Windows Terminal".into(),
            });
        }
        if cmd_exists("pwsh") {
            list.push(TerminalApp {
                id: "pwsh".into(),
                name: "PowerShell".into(),
            });
        }
        list.push(TerminalApp {
            id: "powershell".into(),
            name: "Windows PowerShell".into(),
        });
        list.push(TerminalApp {
            id: "cmd".into(),
            name: "Command Prompt".into(),
        });
    }

    #[cfg(target_os = "linux")]
    {
        let apps: &[(&str, &str)] = &[
            ("gnome-terminal", "GNOME Terminal"),
            ("konsole", "Konsole"),
            ("xfce4-terminal", "Xfce Terminal"),
            ("alacritty", "Alacritty"),
            ("kitty", "kitty"),
            ("wezterm", "WezTerm"),
            ("xterm", "XTerm"),
        ];
        for (id, name) in apps {
            if cmd_exists(id) {
                list.push(TerminalApp {
                    id: id.to_string(),
                    name: name.to_string(),
                });
            }
        }
    }

    list
}

#[tauri::command]
pub async fn open_in_terminal(path: String, terminal_id: String) -> Result<(), String> {
    let p = path.as_str();

    #[cfg(target_os = "macos")]
    {
        match terminal_id.as_str() {
            "iterm2" => {
                let script = format!(
                    r#"tell application "iTerm"
                        create window with default profile
                        tell current session of current window
                            write text "cd {p}"
                        end tell
                    end tell"#
                );
                Command::new("osascript")
                    .args(["-e", &script])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            id => {
                let app = match id {
                    "warp" => "Warp",
                    "alacritty" => "Alacritty",
                    "hyper" => "Hyper",
                    "kitty" => "kitty",
                    "ghostty" => "Ghostty",
                    _ => "Terminal",
                };
                Command::new("open")
                    .args(["-a", app, p])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        match terminal_id.as_str() {
            "wt" => {
                Command::new("wt")
                    .args(["-d", p])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "pwsh" => {
                Command::new("pwsh")
                    .args(["-NoExit", "-Command", &format!("Set-Location '{p}'")])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "powershell" => {
                Command::new("powershell")
                    .args(["-NoExit", "-Command", &format!("Set-Location '{p}'")])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            _ => {
                Command::new("cmd")
                    .args(["/K", &format!("cd /d {p}")])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        match terminal_id.as_str() {
            "gnome-terminal" => {
                Command::new("gnome-terminal")
                    .args(["--working-directory", p])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "konsole" => {
                Command::new("konsole")
                    .args(["--workdir", p])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "xfce4-terminal" => {
                Command::new("xfce4-terminal")
                    .args(["--working-directory", p])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            "wezterm" => {
                Command::new("wezterm")
                    .args(["start", "--cwd", p])
                    .spawn()
                    .map_err(|e| e.to_string())?;
            }
            id => {
                Command::new(id)
                    .args(["--working-directory", p])
                    .spawn()
                    .or_else(|_| Command::new(id).current_dir(p).spawn())
                    .map_err(|e| e.to_string())?;
            }
        }
    }

    Ok(())
}

// ── GitHub CLI ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn github_cli_token() -> Result<String, String> {
    let output = Command::new("gh")
        .args(["auth", "token"])
        .output()
        .map_err(|_| "GitHub CLI (gh) not found. Install it from cli.github.com.".to_string())?;
    let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() || token.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "Not signed in to GitHub CLI. Run: gh auth login".to_string()
        } else {
            stderr
        });
    }
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_staged_unstaged_and_untracked_status() {
        let changes = parse_porcelain_status("M  staged.txt\0 M unstaged.txt\0?? new.txt\0");

        assert_eq!(changes.len(), 3);
        assert!(changes[0].staged);
        assert!(!changes[0].unstaged);
        assert!(changes[1].unstaged);
        assert!(!changes[1].staged);
        assert!(changes[2].untracked);
    }

    #[test]
    fn parses_rename_and_copy_status_records() {
        let changes =
            parse_porcelain_status("R  new-name.txt\0old-name.txt\0C  copy.txt\0source.txt\0");

        assert_eq!(changes[0].kind, "renamed");
        assert_eq!(changes[0].path, "new-name.txt");
        assert_eq!(changes[0].old_path.as_deref(), Some("old-name.txt"));
        assert_eq!(changes[1].kind, "copied");
        assert_eq!(changes[1].old_path.as_deref(), Some("source.txt"));
    }

    #[test]
    fn parses_conflict_status_records() {
        let changes = parse_porcelain_status("UU conflicted.txt\0");

        assert_eq!(changes.len(), 1);
        assert!(changes[0].conflicted);
        assert_eq!(changes[0].kind, "modified");
    }

    #[test]
    fn pull_upstream_uses_existing_tracking_branch() {
        let remote_names = vec!["origin".to_string()];
        let remote_branches = vec!["origin/release/may-20".to_string()];

        let upstream = select_pull_upstream(
            "release/may-20",
            Some("upstream/other"),
            &remote_names,
            &remote_branches,
        );

        assert_eq!(upstream, Some(PullUpstream::Existing));
    }

    #[test]
    fn pull_upstream_prefers_origin_matching_current_branch() {
        let remote_names = vec!["upstream".to_string(), "origin".to_string()];
        let remote_branches = vec![
            "upstream/release/may-20".to_string(),
            "origin/release/may-20".to_string(),
        ];

        let upstream =
            select_pull_upstream("release/may-20", None, &remote_names, &remote_branches);

        assert_eq!(
            upstream,
            Some(PullUpstream::SetUpstream {
                remote: "origin".to_string(),
                branch: "release/may-20".to_string(),
            })
        );
    }

    #[test]
    fn pull_upstream_handles_branch_names_with_slashes() {
        let remote_names = vec!["origin".to_string()];
        let remote_branches = vec!["origin/bugfix/abhi/wil-001-ppk-revert".to_string()];

        let upstream = select_pull_upstream(
            "bugfix/abhi/wil-001-ppk-revert",
            None,
            &remote_names,
            &remote_branches,
        );

        assert_eq!(
            upstream,
            Some(PullUpstream::SetUpstream {
                remote: "origin".to_string(),
                branch: "bugfix/abhi/wil-001-ppk-revert".to_string(),
            })
        );
    }

    #[test]
    fn pull_upstream_returns_none_without_matching_remote_branch() {
        let remote_names = vec!["origin".to_string()];
        let remote_branches = vec![
            "origin/main".to_string(),
            "origin/release/may-19".to_string(),
        ];

        let upstream =
            select_pull_upstream("release/may-20", None, &remote_names, &remote_branches);

        assert_eq!(upstream, None);
    }

    #[test]
    fn pull_upstream_does_not_match_remote_branch_suffix_only() {
        let remote_names = vec!["origin".to_string()];
        let remote_branches = vec!["origin/bar/foo".to_string()];

        let upstream = select_pull_upstream("foo", None, &remote_names, &remote_branches);

        assert_eq!(upstream, None);
    }

    #[test]
    fn parses_worktree_porcelain_output() {
        let worktrees = parse_worktree_output(
            "worktree /repo\nHEAD abc123\nbranch refs/heads/main\n\nworktree /repo-feature\nHEAD def456\nbranch refs/heads/feature\nlocked\n",
        );

        assert_eq!(worktrees.len(), 2);
        assert!(worktrees[0].is_main);
        assert_eq!(worktrees[0].branch.as_deref(), Some("main"));
        assert!(!worktrees[0].is_locked);
        assert_eq!(worktrees[1].branch.as_deref(), Some("feature"));
        assert!(worktrees[1].is_locked);
    }
}
