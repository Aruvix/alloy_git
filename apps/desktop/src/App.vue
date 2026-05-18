<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { gitApi } from "@alloy/git-core";
import { useRepoStore } from "./stores/repoStore.js";
import { useAccountStore } from "./stores/accountStore.js";
import { useGitStatusStore } from "./stores/gitStatusStore.js";
import { useGitBranchStore } from "./stores/gitBranchStore.js";
import { useUiStore } from "./stores/uiStore.js";
import AppSidebar from "./components/AppSidebar.vue";
import AddRepositoryModal from "./components/AddRepositoryModal.vue";
import Notification from "./components/ui/Notification.vue";
import ResizableSplitter from "./components/ui/ResizableSplitter.vue";

const router = useRouter();
const repoStore = useRepoStore();
const accountStore = useAccountStore();
const statusStore = useGitStatusStore();
const branchStore = useGitBranchStore();
const uiStore = useUiStore();
const paletteOpen = ref(false);
const paletteQuery = ref("");
const fetchingAll = ref(false);

onMounted(async () => {
  uiStore.applyTheme();
  try {
    await Promise.all([repoStore.load(), accountStore.load()]);
  } catch {
    uiStore.notify("warning", "Repository data is unavailable in this browser preview. Open the Tauri app for live repository data.");
  }
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => window.removeEventListener("keydown", handleKeydown));

const activeRepo = computed(() => repoStore.activeRepo);

const selectedAccountId = computed({
  get: () => uiStore.repositoryScope.type === "account" ? uiStore.repositoryScope.id : uiStore.repositoryScope.type,
  set: (id: string) => {
    uiStore.setRepositoryScope(id === "local" ? { type: "local" } : id === "all" ? { type: "all" } : { type: "account", id });
    if (repoStore.activeRepo && id !== "all") {
      const activeVisible = id === "local"
        ? !repoStore.activeRepo.linkedAccountId
        : repoStore.activeRepo.linkedAccountId === id;
      if (!activeVisible) router.push("/");
    }
  },
});

const commands = computed(() => {
  const repo = activeRepo.value;
  return [
    { id: "clone", label: "Clone Repository", run: () => uiStore.openAddRepoModal("clone") },
    { id: "import", label: "Import Local Repository", run: () => uiStore.openAddRepoModal("import") },
    { id: "create", label: "Create New Repository", run: () => uiStore.openAddRepoModal("create") },
    { id: "open-repo", label: "Open Repository", run: () => repoStore.activeRepo && router.push(`/repositories/${repoStore.activeRepo.id}/overview`) },
    { id: "switch-account", label: "Switch Account", run: () => paletteQuery.value = "account" },
    { id: "fetch-all", label: "Fetch All", run: () => fetchAll() },
    { id: "pull-all", label: "Pull All", run: () => repo ? runGit("pull") : undefined },
    { id: "push-all", label: "Push All", run: () => repo ? runGit("push") : undefined },
    { id: "accounts", label: "Open Accounts Settings", run: () => router.push("/settings/accounts") },
    { id: "appearance", label: "Open Appearance Settings", run: () => router.push("/settings/appearance") },
    ...(repo ? [
      { id: "changes", label: "Go to Changes", run: () => router.push(`/repositories/${repo.id}/changes`) },
      { id: "history", label: "Go to History", run: () => router.push(`/repositories/${repo.id}/history`) },
      { id: "branches", label: "Go to Branches", run: () => router.push(`/repositories/${repo.id}/branches`) },
      { id: "terminal", label: "Open Terminal", run: () => router.push(`/repositories/${repo.id}/terminal`) },
      { id: "create-branch", label: "Create Branch", run: () => router.push(`/repositories/${repo.id}/branches`) },
      { id: "checkout-branch", label: "Checkout Branch", run: () => router.push(`/repositories/${repo.id}/branches`) },
      { id: "conflicts", label: "View Conflicts", run: () => router.push(`/repositories/${repo.id}/conflicts`) },
      { id: "fetch", label: "Fetch All Remotes", run: () => runGit("fetch") },
      { id: "pull", label: "Pull Current Branch", run: () => runGit("pull") },
      { id: "push", label: "Push Current Branch", run: () => runGit("push") },
      { id: "stage-all", label: "Stage All Changes", run: () => statusStore.stageAll(repo.path) },
    ] : []),
  ];
});

const filteredCommands = computed(() => {
  const query = paletteQuery.value.trim().toLowerCase();
  if (!query) return commands.value;
  return commands.value.filter((c) => c.label.toLowerCase().includes(query));
});

function handleKeydown(event: KeyboardEvent) {
  const paletteShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
  if (paletteShortcut) {
    event.preventDefault();
    paletteOpen.value = true;
    paletteQuery.value = "";
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
    event.preventDefault();
    if (activeRepo.value) statusStore.refresh(activeRepo.value.path);
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    paletteOpen.value = true;
    paletteQuery.value = "";
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p") {
    event.preventDefault();
    runGit("push").catch((e) => uiStore.notify("error", String(e)));
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "l") {
    event.preventDefault();
    runGit("pull").catch((e) => uiStore.notify("error", String(e)));
  }
  if (event.key === "Escape") paletteOpen.value = false;
}

async function fetchAll() {
  if (!activeRepo.value) {
    uiStore.notify("info", "Select a repository first");
    return;
  }
  fetchingAll.value = true;
  try {
    const result = await gitApi.fetch(activeRepo.value.path);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    await statusStore.refresh(activeRepo.value.path);
    uiStore.notify("success", "Fetched from remote");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    fetchingAll.value = false;
  }
}

async function runGit(action: "fetch" | "pull" | "push") {
  if (!activeRepo.value) return;
  const repo = activeRepo.value;
  const result = action === "fetch"
    ? await gitApi.fetch(repo.path)
    : action === "pull"
      ? await gitApi.pull(repo.path)
      : await gitApi.push(repo.path);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout);
  await Promise.all([
    statusStore.refresh(repo.path),
    action === "pull" ? branchStore.load(repo.path) : Promise.resolve(),
  ]);
  uiStore.notify("success", `${action} completed`);
}

async function runCommand(command: { run: () => unknown | Promise<unknown> }) {
  paletteOpen.value = false;
  try {
    await command.run();
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}
</script>

<template>
  <div class="app-shell">
    <!-- ── Global Top Bar ─────────────────────────────────────────────────── -->
    <header class="top-bar">
      <div class="top-bar-left">
        <span class="app-logo">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <polygon points="10,2 18,6 18,14 10,18 2,14 2,6" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <polygon points="10,6 14,8 14,12 10,14 6,12 6,8" fill="currentColor" opacity="0.7"/>
          </svg>
          Alloy Git
        </span>

        <div class="account-switcher-wrap">
          <select
            v-model="selectedAccountId"
            class="account-switcher"
            title="Switch account scope"
          >
            <option value="all">All Accounts</option>
            <option v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
              {{ account.name }}{{ account.username ? ` - ${account.username}` : "" }}
            </option>
            <option value="local">Local Only</option>
          </select>
        </div>
      </div>

      <div class="top-bar-center">
        <button class="global-search" @click="paletteOpen = true; paletteQuery = ''">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="6" cy="6" r="4.5"/>
            <path d="M9.5 9.5L12.5 12.5"/>
          </svg>
          <span>Search repositories, branches, commits…</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <div class="top-bar-right">
        <button
          class="top-btn"
          :class="{ loading: fetchingAll }"
          :disabled="fetchingAll"
          @click="fetchAll"
          title="Fetch all remotes"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 2v5M4 5l3 3 3-3M2 10h10"/>
          </svg>
          Fetch All
        </button>
        <button class="top-btn primary" @click="uiStore.openAddRepoModal()">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          Add Repository
        </button>
        <RouterLink to="/settings" class="top-icon-btn" title="Settings">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5zm0 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
            <path d="M6.4 1.5L5.8 3A6.2 6.2 0 0 0 4 4L2.4 3.7l-1.2 2.1 1.2 1.4a6.2 6.2 0 0 0 0 1.6L1.2 10.2l1.2 2.1L4 12a6.2 6.2 0 0 0 1.8 1l.6 1.5h2.4l.6-1.5A6.2 6.2 0 0 0 11.2 12l1.6.3 1.2-2.1-1.2-1.4a6.2 6.2 0 0 0 0-1.6l1.2-1.4-1.2-2.1L11.2 4A6.2 6.2 0 0 0 9.4 3l-.6-1.5H6.4z" opacity="0.4"/>
          </svg>
        </RouterLink>
      </div>
    </header>

    <!-- ── Body: Sidebar + Main ─────────────────────────────────────────── -->
    <div class="app-body">
      <AppSidebar />
      <ResizableSplitter
        v-if="!uiStore.sidebarCollapsed"
        :min="200"
        :max="420"
        @resize-end="uiStore.sidebarWidth = $event"
      />
      <main class="app-main">
        <RouterView />
      </main>
    </div>

    <!-- ── Add Repository Modal ─────────────────────────────────────────── -->
    <AddRepositoryModal v-if="uiStore.addRepoModalOpen" @close="uiStore.closeAddRepoModal" />

    <!-- ── Command Palette ──────────────────────────────────────────────── -->
    <div v-if="paletteOpen" class="palette-backdrop" @click.self="paletteOpen = false">
      <div class="palette">
        <div class="palette-search">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="6" cy="6" r="4.5"/>
            <path d="M9.5 9.5L12.5 12.5"/>
          </svg>
          <input
            v-model="paletteQuery"
            class="palette-input"
            placeholder="Type a command or search…"
            autofocus
            @keyup.enter="filteredCommands[0] && runCommand(filteredCommands[0])"
          />
        </div>
        <div class="palette-list">
          <button
            v-for="command in filteredCommands"
            :key="command.id"
            class="palette-item"
            @click="runCommand(command)"
          >
            {{ command.label }}
          </button>
          <div v-if="filteredCommands.length === 0" class="palette-empty">No commands found</div>
        </div>
      </div>
    </div>

    <Notification v-if="uiStore.notification" :notification="uiStore.notification" @dismiss="uiStore.clearNotification" />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--surface-0);
}

/* ── Top Bar ── */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--top-bar-height);
  padding: 0 12px 0 0;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  z-index: 20;
  gap: 8px;
}
.top-bar-left {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
}
.top-bar-center {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: center;
  padding: 0 8px;
  max-width: 480px;
}
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.app-logo {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  height: var(--top-bar-height);
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: -0.02em;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}

.account-switcher-wrap {
  padding: 0 10px;
  border-right: 1px solid var(--border);
  height: var(--top-bar-height);
  display: flex;
  align-items: center;
}
.account-switcher {
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-0);
  color: var(--text);
  font-size: 12px;
  font-weight: 500;
  padding: 0 8px;
  cursor: pointer;
  max-width: 220px;
}

.global-search {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-0);
  color: var(--text-muted);
  font-size: 12px;
  padding: 0 10px;
  cursor: text;
  transition: border-color 120ms;
}
.global-search:hover { border-color: var(--accent); }
.global-search span { flex: 1; text-align: left; }
.global-search kbd {
  font-size: 10px;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 1px 4px;
  color: var(--text-subtle);
  font-family: inherit;
}

.top-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms, color 100ms;
  white-space: nowrap;
}
.top-btn:hover { background: var(--surface-3); color: var(--text); }
.top-btn.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.top-btn.primary:hover { background: var(--accent-hover); }
.top-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.top-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--text-muted);
  text-decoration: none;
  transition: background 100ms, color 100ms;
}
.top-icon-btn:hover { background: var(--surface-2); color: var(--text); }

/* ── App Body ── */
.app-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.app-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Command Palette ── */
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}
.palette {
  width: min(580px, calc(100vw - 32px));
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-1);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.40);
  overflow: hidden;
}
.palette-search {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
}
.palette-input {
  flex: 1;
  height: 48px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
}
.palette-input::placeholder { color: var(--text-muted); }
.palette-list {
  max-height: 340px;
  overflow: auto;
  padding: 6px;
}
.palette-item {
  width: 100%;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  text-align: left;
  font-size: 13px;
  padding: 9px 12px;
  cursor: pointer;
}
.palette-item:hover { background: var(--surface-2); }
.palette-empty {
  color: var(--text-muted);
  font-size: 12px;
  padding: 12px;
  text-align: center;
}
</style>
