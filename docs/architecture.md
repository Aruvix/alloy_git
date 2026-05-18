# Alloy Git Architecture

Alloy Git is a local-first desktop Git workspace. Core Git behavior is owned by the Rust/Tauri command layer and executed against repositories on disk. Provider APIs are optional enrichments for account validation, repository discovery, and cloud metadata.

## Package Layout

- `apps/desktop`: Tauri v2 shell, Vue 3 views, Pinia stores, SQLite migrations, Rust commands.
- `packages/git-core`: shared Git data contracts, Tauri invoke client, local secret scanning helpers.
- `packages/provider-core`: provider clients for GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, Forgejo, and custom GitLab-compatible servers.
- `packages/git-ui`: reusable Vue Git UI components extracted from desktop views.
- `packages/shared`: cross-package IDs, formatting, and platform helpers.
- `scripts`: repeatable local fixtures and development helpers.

## Local-First Boundaries

The app must be useful with no network and no account. These operations always go through local Git:

- init, clone, status, diff, commit, history
- branches, tags, stashes, worktrees, remotes
- fetch, pull, push
- conflict resolution and repository-scoped terminal commands

Provider clients must not be imported by the Rust Git command layer. They enhance accounts and cloud repository lists only.

## Durable State

SQLite stores product state:

- `local_repositories`: repos opened or cloned on this machine.
- `repository_groups`: local workspace organization.
- `git_accounts`: provider account metadata only.
- `cloud_repositories`: provider repository indexes linked to accounts.
- `global_git_config`: author defaults, clone directory, secret scan mode.
- `provider_metadata` and `workspace_indexes`: future-ready extension points.

Credentials are stored only in the OS keychain through the Rust `crypto` module.

## Extension Direction

The stable extension points are provider clients, Git command modules, shared Git types, and reusable UI components. PR/MR, issues, notifications, AI summaries, and enterprise policy should build on these boundaries without making local Git dependent on provider availability.
