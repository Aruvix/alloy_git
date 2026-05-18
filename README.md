# Alloy Git

A universal, local-first Git workspace desktop app built with Tauri v2 and Vue 3. Alloy supports every major Git hosting provider in a single UI, with an enterprise-grade design built for focus and speed.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Monorepo Structure](#monorepo-structure)
- [Features](#features)
  - [Repository Management](#repository-management)
  - [Branch Management](#branch-management)
  - [Working Copy & Changes](#working-copy--changes)
  - [Commit History](#commit-history)
  - [Stash Management](#stash-management)
  - [Remote Management](#remote-management)
  - [Tags](#tags)
  - [Worktrees](#worktrees)
  - [Conflict Resolution](#conflict-resolution)
  - [Integrated Terminal](#integrated-terminal)
  - [Provider Integration](#provider-integration)
  - [Account Management](#account-management)
  - [UI & Layout](#ui--layout)
  - [Themes & Appearance](#themes--appearance)
  - [Keyboard Shortcuts & Command Palette](#keyboard-shortcuts--command-palette)
  - [Security & Credential Storage](#security--credential-storage)
  - [Settings](#settings)
- [Development](#development)
- [Architecture](#architecture)

---

## Overview

Alloy Git is a desktop Git client that competes directly with GitHub Desktop and GitKraken, with two core differences:

1. **Universal provider support** — GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, Forgejo, and any custom self-hosted Git server work side-by-side in a single workspace.
2. **Local-first architecture** — all repository data, account credentials, and settings are stored locally in SQLite and the OS keychain. No cloud sync. No telemetry.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend framework | Vue 3 + TypeScript |
| State management | Pinia |
| Routing | Vue Router |
| Styling | CSS custom properties (design tokens) |
| Local database | SQLite via `tauri-plugin-sql` |
| Credential storage | OS keychain via Tauri crypto vault |
| Build system | pnpm workspaces monorepo |
| Type checking | vue-tsc |

---

## Monorepo Structure

```
alloy/
├── apps/
│   └── desktop/                  Tauri v2 desktop app
│       ├── src/                  Vue 3 frontend
│       │   ├── components/       Reusable UI components
│       │   ├── views/            Route-level page views
│       │   ├── stores/           Pinia state stores
│       │   ├── router/           Vue Router configuration
│       │   └── assets/           Global CSS, themes
│       └── src-tauri/            Rust backend
│           └── src/
│               ├── git/          All git commands (mod.rs)
│               ├── repository/   DB migrations, path validation
│               └── crypto/       OS keychain vault
└── packages/
    ├── git-core/                 Git types + gitApi service (Tauri invoke wrappers)
    ├── provider-core/            Provider clients: GitHub, GitLab, Bitbucket, Azure, Gitea
    ├── git-ui/                   Shared Vue UI components (badges, empty states)
    └── shared/                   Utilities: timeAgo, generateId, basename, IS_TAURI
```

---

## Features

### Repository Management

**Add Repository modal** — triggered from the global top bar or sidebar `+` button. Supports three flows:

- **Clone** — choose a cloud account and pick from its repositories list, or paste any Git URL directly. Select HTTPS or SSH protocol, choose a local destination folder, and click Clone. Field-level validation shows errors inline. A progress banner shows clone status.
- **Import** — open an existing local folder. Alloy auto-detects whether it is a Git repository, reads its `origin` remote URL, matches it against configured accounts, and pre-fills Remote, Branch, Provider, and Account fields. The user can override the linked account.
- **Create** — enter a name and parent folder. Alloy shows a live preview of the full path (`folder/name`). Optionally add a README. Runs `git init` and registers the repository.

**Repository list** — all repositories are stored in a local SQLite database and persisted across sessions. Each entry tracks:
- Display name, local path, linked cloud account, linked remote repository ID
- Last-accessed timestamp (updated on every open)
- Favorite status
- Active/current state

**Favorites** — any repository can be pinned to the top of the sidebar. Stored locally, survive restarts.

**Repository linking** — a local repository can be linked to a cloud repository on any configured account. The link enables remote URL resolution, ahead/behind tracking, visibility badges, and org/owner display.

---

### Branch Management

**Branch popup** — opened by clicking the branch badge in the repository toolbar. A focused 420 × 620px floating panel with:

- **Current branch card** — colored status dot (green = synced/ahead, red = behind/conflict, orange = diverged, gray = no upstream), branch name, Default badge, `…` context menu (Create from here, Copy branch name), and a meta line showing ahead/behind counts and the last commit message + short hash.
- **Recent branches** — the 5 most recently used local branches (excluding current). Each row shows the branch icon, name in monospace, and a colored status label (Up to date, N ahead, N behind). Click any row to check it out immediately.
- **Search** — typing filters all branches (name, shortName, upstream) and shows up to 8 results. A "View all matching branches" link appears when there are more. The filter icon button opens the full Branch Manager.
- **Row `…` context menu** — hover any branch to reveal a context menu with: Checkout, Create branch from here, Merge into current, Rebase current onto this, Copy branch name.
- **View all branches** — a row at the bottom showing the total branch count links to the full Branch Manager page.
- **Quick action footer** — five SVG-icon buttons: New Branch, Checkout, Merge, Rebase, Delete. Each opens a focused dialog modal.

**Quick action dialogs** (opened from the footer or keyboard shortcut):

| Action | Dialog Fields |
|---|---|
| New Branch | Branch name, From branch, Checkout new branch, Push to remote |
| Checkout | Select branch, Create new branch from selected |
| Merge | Source branch, Strategy (merge commit / squash / fast-forward only), Delete after merge |
| Rebase | Target branch, Interactive rebase |
| Delete | Branch to delete, Force delete, Type branch name to confirm |

Merge, rebase, and delete show warning banners. Delete is styled red. Branch name validation rejects duplicates and invalid Git characters.

**Full Branch Manager page** (`/repositories/:id/branches`) — opened via "View all branches":

- **Tab filters** with live counts: All · Local · Remote · Merged
- **Search box** with SVG search icon, compound input
- **Type filter** (All Types / Protected / Ahead / Behind) and **Sort** (Recent / Name / Status)
- **Current Branch section** — highlighted with accent tint, status dot, Default/Protected pills, upstream label, and `…` action menu
- **Local Branches section** and **Remote Branches section** — each with a group label and count badge. Uses the `BranchRow` component per branch: icon, name, meta row (pills + upstream), colored status label, `…` dropdown (Checkout, Merge into current, Rebase current onto this, Rename, Delete)
- **Protected branch guards** — default and protected branches cannot be deleted. Appropriate error is shown if attempted.

**Keyboard shortcuts** (active inside the branch popup):

| Key | Action |
|---|---|
| `Enter` | Checkout selected/highlighted branch |
| `Cmd/Ctrl + N` | Open New Branch dialog |
| `Cmd/Ctrl + M` | Open Merge dialog |
| `Cmd/Ctrl + R` | Open Rebase dialog |
| `Cmd/Ctrl + D` | Open Delete dialog |
| `Cmd/Ctrl + B` | Open full Branch Manager page |
| `Esc` | Close dialog / close popup |

---

### Working Copy & Changes

**Changes view** (`/repositories/:id/changes`) — two-panel layout:

- **Left panel** — file list showing all staged, unstaged, and untracked changes. Each file shows its change kind (added / modified / deleted / renamed / untracked) with color coding. Stage and unstage per-file buttons, plus "Stage All" / "Unstage All" bulk actions. File discard with confirmation.
- **Right panel** — diff viewer showing unified diff for the selected file. Syntax-highlighted hunks with `+`/`-` line markers. Powered by `git_diff` (for unstaged) or `git_show_file` (for staged).
- **Commit panel** — commit message textarea and Commit button. Validates that at least one file is staged.
- **Live polling** — the status store polls the working tree periodically while a repository is active, keeping the file list and conflict count in the nav badge up to date.

**Conflict badge** — the Conflicts tab in the repo navigation shows a red badge with the conflicted file count. The badge turns the tab label red when conflicts exist.

---

### Commit History

**History view** (`/repositories/:id/history`) — paginated commit log:

- Initial load shows the most recent commits. A "Load more" action appends older commits.
- Each row: short hash, commit message, author, relative timestamp (`timeAgo`), changed file count.
- **Commit detail** — click a commit to open its diff in the right panel. Shows all changed files with their kind. Selecting a file loads the full per-file diff via `git_commit_diff`.
- **Revert commit** — a revert action on any commit runs `git revert` and refreshes the status.

---

### Stash Management

**Stash view** (`/repositories/:id/stashes`) — list of all stashes:

- Each stash shows its index, message, and creation timestamp.
- **Push stash** — create a new stash with an optional message.
- **Apply stash** — apply a stash to the working tree (keeps stash in list).
- **Drop stash** — remove a stash permanently with confirmation.
- **Stash diff** — click a stash to view its diff via `git_stash_diff`.

---

### Remote Management

**Remotes view** (`/repositories/:id/remotes`) — lists all configured Git remotes:

- Shows remote name and URL for each remote.
- **Add / update remote** — set a remote name and URL (`git remote set-url` or `git remote add`).
- **Remove remote** — delete a configured remote with confirmation.

---

### Tags

**Tags view** (`/repositories/:id/tags`) — lists all local and remote tags:

- **Create tag** — specify tag name and optional message (annotated tag).
- **Delete tag** — remove a local tag with confirmation.

---

### Worktrees

**Worktrees view** (`/repositories/:id/worktrees`) — lists all Git worktrees for the repository:

- Shows worktree path, branch, and HEAD commit for each entry.
- **Add worktree** — create a linked worktree at a new path on a new or existing branch.
- **Remove worktree** — delete a worktree with confirmation.
- Read and write files within a specific worktree via `git_read_worktree_file` / `git_write_worktree_file`.

---

### Conflict Resolution

**Conflicts view** (`/repositories/:id/conflicts`) — appears when the repository is in a conflict state (merge, rebase, or cherry-pick in progress):

- Lists all conflicted files with their status.
- **View conflict** — open the raw conflict file content (shows `<<<<<<<`, `=======`, `>>>>>>>` markers).
- **Accept ours / theirs** — resolve a file by accepting one side using `git_conflict_accept`.
- **Mark resolved** — stage a file after manual editing using `git_mark_resolved`.
- **Abort** — abort the current merge or rebase operation with `git_abort`.
- **Continue** — continue the operation after all conflicts are resolved with `git_continue`.

The repository state (merging / rebasing) is shown as a colored badge in the repo toolbar header.

---

### Integrated Terminal

**Terminal view** (`/repositories/:id/terminal`) — an embedded terminal scoped to the repository's working directory:

- Runs git commands and shell commands directly inside the app via `git_terminal_run`.
- Lists available terminal emulators on the system via `list_terminals`.
- **Open in external terminal** — launches the repo folder in the user's preferred terminal app via `open_in_terminal`.

---

### Provider Integration

Alloy supports six Git hosting providers out of the box. Each provider implements a typed client interface with three methods: `validateAuth`, `listRepositories`, and `parseRemoteUrl`.

| Provider | Auth Method | Self-Hosted |
|---|---|---|
| GitHub | Personal Access Token, OAuth Device Flow | GitHub Enterprise Server |
| GitLab | Personal Access Token | Yes (any GitLab instance) |
| Bitbucket | App Password (PAT) | Bitbucket Server / Data Center |
| Azure DevOps | Personal Access Token | Azure DevOps Server |
| Gitea | Personal Access Token | Yes (any Gitea/Forgejo instance) |
| Forgejo | Personal Access Token | Yes |

**Remote URL parsing** — every provider client implements `parseRemoteUrl`, which maps HTTPS and SSH remote URLs back to structured account/repository metadata. The provider registry tries each configured account before falling back to public provider defaults. This powers:

- Auto-detection of the linked account when importing a local repository
- HTTPS / SSH URL generation for cloning (`bestCloneUrl`)
- Provider badge display in the sidebar

**Provider capabilities** — each provider exposes a capabilities object (`getProviderCapabilities`) describing which features it supports (e.g., whether server-side validation is available, which auth methods are accepted).

**GitHub Device Flow** — GitHub OAuth uses the device authorization flow (`startGitHubDeviceFlow` + `pollGitHubDeviceFlow`), so no browser redirect is required. The user enters a code at github.com/login/device.

---

### Account Management

**Accounts Settings** (`/settings/accounts`) — manage all configured Git hosting accounts:

- **Add account** — select a provider, enter a Personal Access Token (or complete device flow for GitHub), and optionally enter a server URL for self-hosted providers. Alloy validates the token via the provider's API before saving.
- **Remove account** — removes the account and its stored credentials from the keychain.
- **Default account** — set a default account used as the pre-selection when opening dialogs.
- **Repository sync** — `syncRepositories` fetches the full repository list from the provider API and stores it locally. Called on account add and on app startup. Repositories are stored in SQLite and available offline.
- **Default repository** — the last-opened repository per account is stored as the default and restored on next launch.

---

### UI & Layout

**Global top bar** (52px, full width) — always visible:

- Hexagon logo mark
- **Account switcher** — dropdown that filters the sidebar and scope to a specific account or "All Accounts"
- **Search** — opens the command palette (Cmd+K)
- **Fetch All** — triggers a fetch on all repositories for the selected account scope
- **+ Add Repository** — opens the Add Repository modal
- **Settings** icon — navigates to global settings

**Sidebar** (resizable, default 260px) — repository-first list:

- Grouped by account / organization with collapsible group headers
- **Status dots** per repository:
  - Blue — currently active (open in workspace)
  - Green — linked to a cloud account
  - Orange — needs setup (no valid credential)
  - Red — has conflicts
  - Gray — local only (no remote)
- **Favorites section** — pinned repositories shown at the top above the grouped list
- **Inline search** — filter repositories by name
- **Quick links** — "All Repos (N)" and "Favorites (N)" counts
- Clicking a repository navigates to its workspace, preserving the last active tab

**Repository workspace** — a layout with:
- **Repo toolbar** (72px) — repo name, visibility badge, org/account label, remote URL, branch badge button, sync status, Fetch / Pull / Push buttons
- **Tab navigation** — Overview | Changes | History | Branches | Remotes | Stash | Conflicts | Terminal | Settings
- **Tab badges** — Changes shows the unstaged file count; Conflicts shows the conflicted file count in red

**Repository Overview** (`/repositories/:id/overview`) — 5-card dashboard:
- **Repository Health** — overall status at a glance
- **Latest Commit** — author, date, short hash, message
- **Quick Actions** — common one-click operations
- **Changes Summary** — staged/unstaged file counts with a visual bar
- **Top Contributors** — grouped by author email, commit count

**Resizable splitter** — the sidebar width is draggable. The final width is persisted in the UI store and restored on next launch.

**Notification toasts** — success, error, and info toasts appear in the top-right corner. Auto-dismiss after a few seconds.

**Empty states** — every major view has a designed empty state with an icon and descriptive copy.
**Loading states** — skeleton rows replace content while data is fetching.
**Error states** — inline error cards with a Retry action appear on failed loads.

---

### Themes & Appearance

Five enterprise themes are built in. Each theme bakes in its own light or dark mode — the mode is forced by the theme regardless of the OS preference, ensuring consistent visual identity.

| Theme | Mode | Accent | Description |
|---|---|---|---|
| Alloy Light | Light | `#2563EB` (blue) | Clean, modern professional light theme |
| Alloy Dark | Dark | `#3B82F6` (blue) | Balanced dark theme for everyday use |
| Graphite | Dark | `#A3A3A3` (neutral) | High contrast dark theme for deep focus |
| Midnight Blue | Dark | `#60A5FA` (blue) | Cool blue tones for developer workflows |
| Warm Paper | Light | `#C2410C` (orange) | Warm light theme for comfortable reading |

**Theme tokens** — all colors are CSS custom properties. No hardcoded values in components. Key tokens:

```
--surface-0   Page background
--surface-1   Card / panel background
--surface-2   Hover / subtle fill
--surface-3   Muted chip background
--border      Dividers and input borders
--text        Primary text
--text-muted  Secondary text
--text-subtle Tertiary / placeholder text
--accent      Primary brand color (varies by theme)
--accent-subtle Accent background fill
--added       Green (additions / success)
--modified    Orange (modifications / warning)
--deleted     Red (deletions / danger)
--conflict    Red (conflict indicator)
--font-mono   Monospace font for branch names, hashes, paths
```

**Appearance Settings** (`/settings/appearance`) — visual theme picker with:
- Mini preview card per theme (sidebar + top bar + content lines rendered at 88px height)
- Mode badge (Light / Dark)
- Theme description
- Live checkmark on the active theme
- Current Palette section showing 9 color swatches for the active theme

---

### Keyboard Shortcuts & Command Palette

**Command palette** — `Cmd+K` opens a searchable palette of all application commands. Supports keyboard navigation (`↑ ↓` to move, `Enter` to execute, `Esc` to close).

**Global shortcuts:**

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + ,` | Open settings |

**Branch popup shortcuts** (active while popup is open):

| Shortcut | Action |
|---|---|
| `Enter` | Checkout highlighted branch |
| `Cmd/Ctrl + N` | New Branch dialog |
| `Cmd/Ctrl + M` | Merge dialog |
| `Cmd/Ctrl + R` | Rebase dialog |
| `Cmd/Ctrl + D` | Delete dialog |
| `Cmd/Ctrl + B` | Open Branch Manager page |
| `Esc` | Close dialog or popup |

---

### Security & Credential Storage

**OS keychain vault** — all account tokens and credentials are stored in the native OS keychain via Tauri's secure storage layer. Three Rust commands handle all credential I/O:

- `vault_store` — write a credential to the keychain under a namespaced key
- `vault_load` — read a credential back
- `vault_delete` — remove a credential on account deletion

Tokens never touch the SQLite database. The database stores only non-sensitive metadata (account ID, provider type, display name, server URL).

**Secret masking** — the `scanGitSecrets` function scans raw git command output for token-like values and authorization headers. The `maskSecrets` utility redacts bearer tokens and PAT-shaped strings from any log output before it reaches the UI. This prevents credential leakage in terminal output or error messages.

---

### Settings

**Global Settings** are accessible from the top bar Settings icon or `Cmd+,`.

| Settings Page | What It Configures |
|---|---|
| Accounts | Add, remove, validate, and set default accounts for each provider |
| Appearance | Theme selection, current color palette preview |
| Git | Global Git config (user.name, user.email, default branch, GPG signing, etc.) |

**Repository Settings** (`/repositories/:id/settings`) — per-repository configuration:
- Display name override
- Linked account and remote repository association
- Local path information

---

## Development

**Prerequisites:** Rust toolchain, Node.js 20+, pnpm 9+, Tauri v2 CLI.

```bash
# Install dependencies
pnpm install

# Start dev server (Tauri + Vite on port 1431)
pnpm dev

# TypeScript check (frontend only)
pnpm -C apps/desktop exec vue-tsc --noEmit

# Rust check
cd apps/desktop/src-tauri && cargo check

# Run tests
pnpm test
```

---

## Architecture

```
OS (macOS / Windows / Linux)
└── Tauri v2 shell
    ├── Rust backend  (apps/desktop/src-tauri/)
    │   ├── git/mod.rs       ~60 Tauri commands — all git operations
    │   ├── repository/mod.rs  SQLite migrations, path validation, folder dialog
    │   └── crypto/mod.rs      OS keychain vault (store / load / delete)
    │
    └── Vue 3 frontend  (apps/desktop/src/)
        ├── App.vue            Global layout: top bar + sidebar + router-view
        ├── router/            Route tree: / → WelcomeView, /repositories/:id/* → tabs
        ├── stores/            Pinia stores (one per domain)
        │   ├── repoStore      Repository list, active repo, favorites
        │   ├── accountStore   Accounts, cloud repos, token access, provider sync
        │   ├── gitStatusStore Working tree status, staging, commit, live polling
        │   ├── gitBranchStore Branch list, checkout, create, merge, rebase, delete
        │   ├── gitHistoryStore Commit log, pagination, commit diff, revert
        │   ├── gitStashStore  Stash list, push, apply, drop, diff
        │   └── uiStore        Theme, sidebar width, modal state, notifications
        └── packages/          Shared workspace packages
            ├── git-core       gitApi service — all Tauri invoke() wrappers + types
            ├── provider-core  Provider clients + remote URL parser + registry
            ├── git-ui         Shared Vue components (badges, empty states)
            └── shared         Pure utilities (timeAgo, generateId, basename, IS_TAURI)
```

**Layering rule:** components never call `invoke()` directly. All Tauri commands are wrapped in the `gitApi` service (`packages/git-core/src/service.ts`), which is consumed by Pinia stores. Components only read store state and call store actions. Provider API calls are isolated in `packages/provider-core` with no Tauri dependency, so they can be tested independently.
