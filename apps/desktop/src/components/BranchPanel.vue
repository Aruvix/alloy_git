<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useGitBranchStore } from "../stores/gitBranchStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { useRepoStore } from "../stores/repoStore.js";
import { useUiStore } from "../stores/uiStore.js";
import type { GitBranchInfo, MergeBranchPayload } from "@alloy/git-core";

const props = defineProps<{ repoPath: string; anchor?: { left: number; top: number } | null }>();
const emit = defineEmits<{ (e: "close"): void }>();

type DialogKind = "new" | "checkout" | "merge" | "rebase" | "delete";

const router = useRouter();
const branchStore = useGitBranchStore();
const statusStore = useGitStatusStore();
const repoStore = useRepoStore();
const uiStore = useUiStore();

const search = ref("");
const busy = ref<string | null>(null);
const dialog = ref<DialogKind | null>(null);
const inlineError = ref("");
const selectedIndex = ref(0);
const openMenuIndex = ref(-1);
const currentMenuOpen = ref(false);

const newBranch = ref({ name: "", from: "", checkout: true, pushToRemote: false });
const checkoutForm = ref({ branch: "", createFromSelected: false });
const mergeForm = ref<MergeBranchPayload>({ sourceBranch: "", strategy: "merge_commit", deleteAfterMerge: false });
const rebaseForm = ref({ targetBranch: "", interactive: false });
const deleteForm = ref({ branchName: "", force: false, confirmation: "" });

const currentRepo = computed(() => repoStore.repos.find((repo) => repo.path === props.repoPath) ?? repoStore.activeRepo);
const currentBranch = computed(() => branchStore.currentBranch);
const totalBranchCount = computed(() => branchStore.branches.length);
const hasChanges = computed(() => Boolean(statusStore.status?.changes.length));
const otherBranches = computed(() => branchStore.branches.filter((branch) => !branch.isCurrent));
const localBranches = computed(() => branchStore.branches.filter((branch) => !branch.isRemote));

const panelStyle = computed(() => {
  if (!props.anchor || typeof window === "undefined") return {};
  const viewportWidth = window.innerWidth;
  const panelWidth = Math.min(420, viewportWidth - 32);
  const left = Math.min(Math.max(props.anchor.left, 16), viewportWidth - panelWidth - 16);
  return { top: `${props.anchor.top}px`, left: `${left}px`, transform: "none" };
});

const normalizedSearch = computed(() => search.value.trim().toLowerCase());
const matchingBranches = computed(() => {
  if (!normalizedSearch.value) return [];
  return branchStore.branches
    .filter((branch) => matchesSearch(branch, normalizedSearch.value))
    .sort(sortBranches)
    .slice(0, 8);
});
const hasMoreMatches = computed(() => {
  if (!normalizedSearch.value) return false;
  return branchStore.branches.filter((branch) => matchesSearch(branch, normalizedSearch.value)).length > 8;
});
const recentBranches = computed(() => {
  const currentName = currentBranch.value?.name;
  return [...branchStore.branches]
    .filter((branch) => !branch.isRemote && branch.name !== currentName)
    .sort(sortBranches)
    .slice(0, 5);
});
const visibleBranches = computed(() => normalizedSearch.value ? matchingBranches.value : recentBranches.value);
const isNoAccessError = computed(() => {
  const message = branchStore.error?.toLowerCase() ?? "";
  return message.includes("permission") || message.includes("access") || message.includes("authentication");
});

watch(visibleBranches, () => {
  selectedIndex.value = 0;
});

onMounted(() => {
  void loadBranches();
  resetForms();
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});

async function loadBranches() {
  try {
    await branchStore.load(props.repoPath);
    resetForms();
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

function resetForms() {
  const current = currentBranch.value?.name ?? localBranches.value[0]?.name ?? "";
  const firstOther = otherBranches.value[0]?.name ?? current;
  newBranch.value = { name: "", from: current, checkout: true, pushToRemote: false };
  checkoutForm.value = { branch: firstOther, createFromSelected: false };
  mergeForm.value = { sourceBranch: firstOther, strategy: "merge_commit", deleteAfterMerge: false };
  rebaseForm.value = { targetBranch: firstOther, interactive: false };
  deleteForm.value = { branchName: firstOther, force: false, confirmation: "" };
}

function matchesSearch(branch: GitBranchInfo, query: string) {
  return [branch.name, branch.shortName, branch.upstream ?? ""].some((value) => value.toLowerCase().includes(query));
}

function sortBranches(a: GitBranchInfo, b: GitBranchInfo) {
  const aDate = Date.parse(a.lastUsedAt ?? a.lastCommitDate ?? "");
  const bDate = Date.parse(b.lastUsedAt ?? b.lastCommitDate ?? "");
  if (Number.isFinite(aDate) && Number.isFinite(bDate) && aDate !== bDate) return bDate - aDate;
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function statusLabel(branch: GitBranchInfo) {
  if (branch.status === "no_upstream") return "No upstream";
  if (branch.status === "conflict") return "Conflict";
  if (branch.ahead > 0 && branch.behind > 0) return `${branch.ahead} ahead, ${branch.behind} behind`;
  if (branch.ahead > 0) return `${branch.ahead} ahead`;
  if (branch.behind > 0) return `${branch.behind} behind`;
  return "Up to date";
}

function branchSummary(branch: GitBranchInfo | null) {
  if (!branch) return "";
  const parts = [];
  if (branch.ahead > 0) parts.push(`${branch.ahead} ahead`);
  if (branch.behind > 0) parts.push(`${branch.behind} behind`);
  return parts.length ? parts.join(" · ") : statusLabel(branch);
}

async function checkout(branch: GitBranchInfo) {
  if (branch.isCurrent) return;
  if (hasChanges.value && !window.confirm("You have uncommitted changes. Checkout may fail or require stash. Continue?")) return;
  busy.value = `checkout:${branch.name}`;
  try {
    await branchStore.checkout(props.repoPath, branch.name);
    await statusStore.refresh(props.repoPath);
    uiStore.notify("success", `Switched to ${branch.name}`);
    emit("close");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    busy.value = null;
  }
}

function openDialog(kind: DialogKind) {
  inlineError.value = "";
  dialog.value = kind;
}

function validateBranchName(name: string) {
  if (!name.trim()) return "Branch name is required.";
  if (branchStore.branches.some((branch) => branch.name === name.trim())) return "Branch already exists.";
  if (/[\s~^:?*\\[\]@{}]|\.\.|^\/|\/$|\.lock$/.test(name)) return "Branch name contains invalid Git characters.";
  return "";
}

async function submitDialog() {
  inlineError.value = "";
  try {
    if (dialog.value === "new") {
      const name = newBranch.value.name.trim();
      inlineError.value = validateBranchName(name);
      if (inlineError.value) return;
      busy.value = "new";
      await branchStore.createFromPayload(props.repoPath, { ...newBranch.value, name });
      uiStore.notify("success", `Created ${name}`);
    } else if (dialog.value === "checkout") {
      const target = branchStore.branches.find((branch) => branch.name === checkoutForm.value.branch);
      if (!target) return;
      if (checkoutForm.value.createFromSelected) {
        const name = window.prompt("New branch name")?.trim();
        if (!name) return;
        inlineError.value = validateBranchName(name);
        if (inlineError.value) return;
        busy.value = "checkout";
        await branchStore.createFromPayload(props.repoPath, {
          name,
          from: target.name,
          checkout: true,
          pushToRemote: false,
        });
        await statusStore.refresh(props.repoPath);
        uiStore.notify("success", `Created and switched to ${name}`);
        dialog.value = null;
        emit("close");
        return;
      }
      await checkout(target);
      return;
    } else if (dialog.value === "merge") {
      busy.value = "merge";
      await branchStore.merge(props.repoPath, mergeForm.value);
      uiStore.notify("success", `Merged ${mergeForm.value.sourceBranch}`);
    } else if (dialog.value === "rebase") {
      busy.value = "rebase";
      await branchStore.rebase(props.repoPath, rebaseForm.value);
      uiStore.notify("success", `Rebased onto ${rebaseForm.value.targetBranch}`);
    } else if (dialog.value === "delete") {
      const target = branchStore.branches.find((branch) => branch.name === deleteForm.value.branchName);
      if (!target) return;
      if (target.isCurrent) inlineError.value = "Cannot delete current branch.";
      else if (target.isDefault || target.isProtected) inlineError.value = "Cannot delete protected or default branch.";
      else if (deleteForm.value.confirmation !== target.name) inlineError.value = "Type the branch name to confirm deletion.";
      if (inlineError.value) return;
      busy.value = "delete";
      await branchStore.removeFromPayload(props.repoPath, deleteForm.value);
      uiStore.notify("success", `Deleted ${target.name}`);
    }
    await statusStore.refresh(props.repoPath);
    dialog.value = null;
    emit("close");
  } catch (e) {
    inlineError.value = String(e);
    uiStore.notify("error", String(e));
  } finally {
    busy.value = null;
  }
}

function viewAllBranches() {
  const repoId = currentRepo.value?.id;
  if (repoId) router.push(`/repositories/${repoId}/branches`);
  emit("close");
}

async function copyBranchName(branch: GitBranchInfo) {
  await navigator.clipboard?.writeText(branch.name);
  uiStore.notify("success", "Branch name copied");
}

function createFrom(branch: GitBranchInfo) {
  newBranch.value.from = branch.name;
  openDialog("new");
}

function mergeFrom(branch: GitBranchInfo) {
  mergeForm.value.sourceBranch = branch.name;
  openDialog("merge");
}

function rebaseOnto(branch: GitBranchInfo) {
  rebaseForm.value.targetBranch = branch.name;
  openDialog("rebase");
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (dialog.value) dialog.value = null;
    else emit("close");
    return;
  }
  if (dialog.value) return;
  if (event.key === "Enter" && visibleBranches.value[selectedIndex.value]) {
    void checkout(visibleBranches.value[selectedIndex.value]);
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") openDialog("new");
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "m") openDialog("merge");
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") openDialog("rebase");
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") openDialog("delete");
  else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") viewAllBranches();
}
</script>

<template>
  <div class="backdrop" @click="openMenuIndex = -1; currentMenuOpen = false; $emit('close')" />
  <section class="branch-panel" :style="panelStyle" role="dialog" aria-label="Branches" @click.stop>
    <header class="panel-header">
      <h2>Branches</h2>
    </header>

    <div class="search-row">
      <div class="search-box">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <circle cx="7" cy="7" r="4.2" />
          <path d="m10.2 10.2 3 3" />
        </svg>
        <input v-model="search" placeholder="Search branches..." autofocus />
      </div>
      <button class="icon-btn" title="Filters live in the full Branch Manager" @click="viewAllBranches">
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 4h10M5.5 8h5M7 12h2" />
          <path d="M5.5 2.8v2.4M10.5 6.8v2.4M8 10.8v2.4" />
        </svg>
      </button>
    </div>

    <div v-if="branchStore.loading" class="loading-area" aria-live="polite">
      <div class="skeleton wide" />
      <div class="skeleton" />
      <div class="skeleton mid" />
      <div class="skeleton wide" />
    </div>

    <template v-else>
      <div v-if="branchStore.error" class="empty-msg">
        <strong>{{ isNoAccessError ? "You do not have access to view branches." : "Failed to load branches" }}</strong>
        <span>{{ isNoAccessError ? "Reconnect or switch account." : "Retry loading branch data." }}</span>
        <button class="view-all-match" @click="loadBranches">Retry</button>
      </div>

      <template v-else>
      <section v-if="currentBranch" class="current-card">
        <div class="section-title">Current Branch</div>
        <div class="current-main">
          <span class="status-dot" :class="currentBranch.status" />
          <strong>{{ currentBranch.name }}</strong>
          <span v-if="currentBranch.isDefault" class="pill">Default</span>
          <div class="row-menu-wrap" style="margin-left:auto" @click.stop>
            <button class="row-menu" title="Branch actions" @click="currentMenuOpen = !currentMenuOpen; openMenuIndex = -1">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>
            </button>
            <div v-if="currentMenuOpen" class="branch-menu-dropdown">
              <button @click="createFrom(currentBranch); currentMenuOpen = false">Create branch from here</button>
              <button @click="copyBranchName(currentBranch); currentMenuOpen = false">Copy branch name</button>
            </div>
          </div>
        </div>
        <div class="meta-line">{{ branchSummary(currentBranch) }}</div>
        <div v-if="currentBranch.lastCommitMessage || currentBranch.lastCommitHash" class="commit-line">
          Last commit: {{ currentBranch.lastCommitMessage || "No message" }}
          <span v-if="currentBranch.lastCommitHash"> · {{ currentBranch.lastCommitHash.slice(0, 7) }}</span>
        </div>
      </section>

      <section class="branch-list-section">
        <div class="section-title">{{ normalizedSearch ? "Search Results" : "Recent Branches" }}</div>
        <div v-if="!visibleBranches.length" class="empty-msg">
          <strong>No branches found</strong>
          <span>Try adjusting your search.</span>
        </div>
        <div v-else class="branch-list">
          <div
            v-for="(branch, index) in visibleBranches"
            :key="branch.id || branch.name"
            class="branch-row"
            :class="{ selected: index === selectedIndex }"
            role="button"
            tabindex="0"
            @mouseenter="selectedIndex = index"
            @click="checkout(branch)"
            @keydown.enter="checkout(branch)"
          >
            <svg class="branch-glyph" aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="5" cy="3.5" r="1.5" />
              <circle cx="5" cy="12.5" r="1.5" />
              <circle cx="11" cy="7" r="1.5" />
              <path d="M5 5v6M5 5.5c0 2 2.2 1.5 4.4 1.5" />
            </svg>
            <span class="branch-name">{{ branch.name }}</span>
            <span class="branch-status" :class="branch.status">{{ statusLabel(branch) }}</span>
            <div class="row-menu-wrap" @click.stop>
              <button class="row-menu-btn" @click="openMenuIndex = openMenuIndex === index ? -1 : index; currentMenuOpen = false">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>
              </button>
              <div v-if="openMenuIndex === index" class="branch-menu-dropdown">
                <button @click="checkout(branch); openMenuIndex = -1">Checkout</button>
                <button @click="createFrom(branch); openMenuIndex = -1">Create branch from here</button>
                <button @click="mergeFrom(branch); openMenuIndex = -1">Merge into current</button>
                <button @click="rebaseOnto(branch); openMenuIndex = -1">Rebase current onto this</button>
                <button @click="copyBranchName(branch); openMenuIndex = -1">Copy branch name</button>
              </div>
            </div>
          </div>
        </div>
        <button v-if="hasMoreMatches" class="view-all-match" @click="viewAllBranches">View all matching branches</button>
      </section>

      <button class="view-all" @click="viewAllBranches">
        <span>View all branches</span>
        <span class="count">{{ totalBranchCount }}</span>
        <span aria-hidden="true">›</span>
      </button>
      </template>
    </template>

    <footer class="quick-actions">
      <button @click="openDialog('new')">
        <svg class="qa-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="4.5" cy="3" r="1.4"/><circle cx="4.5" cy="13" r="1.4"/><circle cx="11.5" cy="6.5" r="1.4"/>
          <path d="M4.5 4.4v7.2M4.5 5.5c0 1.8 2.5 2 5 1.5"/>
        </svg>
        New Branch
      </button>
      <button @click="openDialog('checkout')">
        <svg class="qa-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 8h10M9 4l4 4-4 4"/>
        </svg>
        Checkout
      </button>
      <button @click="openDialog('merge')">
        <svg class="qa-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="4.5" cy="3" r="1.4"/><circle cx="4.5" cy="13" r="1.4"/><circle cx="11.5" cy="6" r="1.4"/>
          <path d="M4.5 4.4v7.2M11.5 7.4c0 3-3 4.5-7 4.6"/>
        </svg>
        Merge
      </button>
      <button @click="openDialog('rebase')">
        <svg class="qa-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4.5 12V4M4.5 4L2.5 6M4.5 4L6.5 6"/>
          <path d="M11.5 4v3c0 2.5-3 3.5-7 3.5"/>
          <circle cx="11.5" cy="13" r="1.4"/>
        </svg>
        Rebase
      </button>
      <button class="danger" @click="openDialog('delete')">
        <svg class="qa-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2.5 4.5h11M5.5 4.5V3h5v1.5M6.5 7v5M9.5 7v5M3.5 4.5l1 9h7l1-9"/>
        </svg>
        Delete
      </button>
    </footer>
  </section>

  <div v-if="dialog" class="dialog-backdrop" @click="dialog = null">
    <section class="action-dialog" role="dialog" :aria-label="dialog" @click.stop>
      <h3>
        {{ dialog === "new" ? "New Branch" : dialog === "checkout" ? "Checkout Branch" : dialog === "merge" ? "Merge into Current" : dialog === "rebase" ? "Rebase onto Branch" : "Delete Branch" }}
      </h3>

      <template v-if="dialog === 'new'">
        <label>Branch name<input v-model="newBranch.name" placeholder="feature/user-auth" /></label>
        <label>From branch<select v-model="newBranch.from"><option v-for="branch in branchStore.branches" :key="branch.name" :value="branch.name">{{ branch.name }}</option></select></label>
        <label class="check"><input v-model="newBranch.checkout" type="checkbox" /> Checkout new branch</label>
        <label class="check"><input v-model="newBranch.pushToRemote" type="checkbox" /> Push to remote</label>
      </template>

      <template v-else-if="dialog === 'checkout'">
        <p v-if="hasChanges" class="warning">You have uncommitted changes. Checkout may fail or require stash.</p>
        <label>Select branch<select v-model="checkoutForm.branch"><option v-for="branch in otherBranches" :key="branch.name" :value="branch.name">{{ branch.name }}</option></select></label>
        <label class="check"><input v-model="checkoutForm.createFromSelected" type="checkbox" /> Create new branch from selected</label>
      </template>

      <template v-else-if="dialog === 'merge'">
        <label>Source branch<select v-model="mergeForm.sourceBranch"><option v-for="branch in otherBranches" :key="branch.name" :value="branch.name">{{ branch.name }}</option></select></label>
        <label>Merge strategy<select v-model="mergeForm.strategy"><option value="merge_commit">Merge commit</option><option value="squash">Squash merge</option><option value="fast_forward_only">Fast-forward only</option></select></label>
        <label class="check"><input v-model="mergeForm.deleteAfterMerge" type="checkbox" /> Delete branch after merge</label>
      </template>

      <template v-else-if="dialog === 'rebase'">
        <p class="warning">Rebase rewrites commit history. Avoid rebasing shared branches.</p>
        <label>Rebase current branch onto<select v-model="rebaseForm.targetBranch"><option v-for="branch in otherBranches" :key="branch.name" :value="branch.name">{{ branch.name }}</option></select></label>
        <label class="check"><input v-model="rebaseForm.interactive" type="checkbox" /> Interactive rebase</label>
      </template>

      <template v-else>
        <p class="danger-note">This action cannot be undone.</p>
        <label>Branch to delete<select v-model="deleteForm.branchName"><option v-for="branch in otherBranches" :key="branch.name" :value="branch.name">{{ branch.name }}</option></select></label>
        <label class="check"><input v-model="deleteForm.force" type="checkbox" /> Force delete</label>
        <label>Type branch name to confirm<input v-model="deleteForm.confirmation" /></label>
      </template>

      <p v-if="inlineError" class="inline-error">{{ inlineError }}</p>
      <div class="dialog-actions">
        <button @click="dialog = null">Cancel</button>
        <button class="primary" :class="{ danger: dialog === 'delete' }" :disabled="Boolean(busy)" @click="submitDialog">
          {{ busy ? "Working..." : dialog === "new" ? "Create Branch" : dialog === "checkout" ? "Checkout" : dialog === "merge" ? "Merge" : dialog === "rebase" ? "Rebase" : "Delete Branch" }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop, .dialog-backdrop { position: fixed; inset: 0; z-index: 39; }
.dialog-backdrop { z-index: 49; display: grid; place-items: center; background: color-mix(in srgb, var(--surface-0) 42%, transparent); }
.branch-panel {
  position: fixed;
  z-index: 40;
  width: min(420px, calc(100vw - 32px));
  max-height: min(620px, calc(100vh - 72px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-1) 96%, white 4%);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow:
    0 22px 60px color-mix(in srgb, var(--surface-0) 32%, transparent),
    0 0 0 1px color-mix(in srgb, white 5%, transparent);
  color: var(--text);
}
.panel-header { padding: 16px 18px 10px; }
h2, h3 { margin: 0; font-size: 15px; line-height: 1.2; font-weight: 750; letter-spacing: 0; }
.search-row { display: grid; grid-template-columns: minmax(0, 1fr) 36px; gap: 8px; padding: 0 18px 12px; border-bottom: 1px solid var(--border); }
.search-box { height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 6px; color: var(--text-subtle); box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent); }
.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 12px; }
.icon-btn, .row-menu { border: 1px solid var(--border); background: var(--surface-1); color: var(--text-muted); border-radius: 6px; cursor: pointer; display: grid; place-items: center; }
.icon-btn:hover, .row-menu:hover { border-color: var(--accent); color: var(--accent); }
.icon-btn { width: 36px; height: 36px; }
.row-menu { width: 30px; height: 26px; }
.current-card { padding: 13px 18px 14px; border-bottom: 1px solid var(--border); }
.section-title { margin-bottom: 9px; color: var(--text-muted); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
.current-main { display: flex; align-items: center; gap: 8px; min-width: 0; }
.current-main strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 650; font-family: var(--font-mono); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--text-muted); }
.status-dot.up_to_date { background: var(--added); }
.status-dot.ahead { background: var(--added); }
.status-dot.behind { background: var(--deleted); }
.status-dot.diverged { background: var(--modified); }
.status-dot.no_upstream { background: var(--text-subtle); }
.status-dot.conflict { background: var(--deleted); }
.branch-status.ahead { color: var(--added); }
.branch-status.behind { color: var(--deleted); }
.branch-status.diverged { color: var(--modified); }
.branch-status.no_upstream { color: var(--text-subtle); }
.branch-status.conflict { color: var(--deleted); }
.pill, .count { padding: 2px 7px; border-radius: 999px; background: var(--surface-2); color: var(--text-muted); font-size: 10px; font-weight: 700; }
.meta-line, .commit-line { margin-top: 7px; padding-left: 16px; color: var(--text-muted); font-size: 11px; }
.commit-line { color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Row context menu */
.row-menu-wrap { position: relative; display: flex; align-items: center; }
.row-menu-btn { display: none; width: 26px; height: 26px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface-1); color: var(--text-muted); cursor: pointer; place-items: center; }
.branch-row:hover .row-menu-btn, .row-menu-btn:focus { display: grid; }
.row-menu-btn:hover { border-color: var(--accent); color: var(--accent); }
.branch-menu-dropdown { position: absolute; right: 0; top: 30px; z-index: 60; min-width: 190px; display: flex; flex-direction: column; gap: 2px; padding: 5px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 10px 28px color-mix(in srgb, var(--surface-0) 45%, transparent); }
.branch-menu-dropdown button { height: 30px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; color: var(--text); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.branch-menu-dropdown button:hover { background: var(--surface-2); }
.branch-list-section { padding: 13px 18px 9px; min-height: 168px; overflow-y: auto; border-bottom: 1px solid var(--border); }
.branch-list { display: grid; gap: 2px; }
.branch-row { position: relative; display: grid; grid-template-columns: 16px minmax(0, 1fr) auto 28px; gap: 9px; align-items: center; min-height: 36px; padding: 0 2px; background: transparent; border: 0; border-radius: 6px; color: var(--text); font: inherit; cursor: pointer; text-align: left; }
.branch-row:hover, .branch-row.selected { background: color-mix(in srgb, var(--surface-2) 72%, transparent); }
.branch-glyph { color: var(--text-muted); }
.branch-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; font-weight: 650; }
.branch-status { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.view-all, .view-all-match { width: 100%; border: 0; background: transparent; color: var(--accent); cursor: pointer; font: inherit; }
.view-all { display: flex; align-items: center; gap: 8px; padding: 12px 18px; color: var(--text); text-align: left; font-size: 12px; border-bottom: 1px solid var(--border); }
.view-all:hover { background: var(--surface-2); }
.view-all span:first-child { flex: 1; }
.view-all-match { padding: 8px; font-size: 12px; }
.quick-actions { height: 64px; display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--border); background: var(--surface-1); flex-shrink: 0; }
.quick-actions button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 0; background: transparent; color: var(--text-muted); font-size: 10px; font-weight: 500; cursor: pointer; padding: 0; transition: color 80ms, background 80ms; border-radius: 0; }
.quick-actions button:hover { color: var(--accent); background: var(--accent-subtle); }
.qa-icon { color: var(--accent); flex-shrink: 0; }
.quick-actions .danger { color: var(--text-muted); }
.quick-actions .danger .qa-icon { color: var(--deleted); }
.quick-actions .danger:hover { color: var(--deleted); background: color-mix(in srgb, var(--deleted) 8%, transparent); }
.danger-note, .inline-error { color: var(--deleted); }
.loading-area { padding: 18px 16px; display: grid; gap: 12px; }
.skeleton { height: 10px; width: 62%; border-radius: 999px; background: var(--surface-2); }
.skeleton.wide { width: 86%; }
.skeleton.mid { width: 74%; }
.empty-msg { min-height: 116px; display: grid; place-content: center; gap: 6px; text-align: center; color: var(--text-subtle); font-size: 12px; }
.empty-msg strong { color: var(--text); }
.action-dialog { width: min(360px, calc(100vw - 32px)); display: grid; gap: 12px; padding: 16px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 18px 48px color-mix(in srgb, var(--surface-0) 42%, transparent); }
.action-dialog label { display: grid; gap: 6px; color: var(--text-muted); font-size: 11px; }
.action-dialog input, .action-dialog select { height: 34px; min-width: 0; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-2); color: var(--text); padding: 0 9px; font: inherit; font-size: 12px; outline: 0; }
.action-dialog .check { grid-template-columns: 16px 1fr; align-items: center; color: var(--text); }
.action-dialog .check input { height: 14px; padding: 0; }
.warning, .danger-note, .inline-error { margin: 0; padding: 9px; border-radius: 6px; background: var(--surface-2); font-size: 12px; }
.warning { color: var(--modified); }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dialog-actions button { height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; }
.dialog-actions .primary { background: var(--accent); border-color: var(--accent); color: white; }
.dialog-actions .primary.danger { background: var(--deleted); border-color: var(--deleted); }
@media (max-width: 520px) {
  .branch-panel { left: 8px !important; width: calc(100vw - 16px); }
}
</style>
