<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { invoke } from "@tauri-apps/api/core";
import { gitApi } from "@alloy/git-core";
import { useRepoStore } from "../stores/repoStore.js";
import { useAccountStore } from "../stores/accountStore.js";
import { useUiStore } from "../stores/uiStore.js";

const emit = defineEmits<{ (e: "close"): void }>();

const router = useRouter();
const repoStore = useRepoStore();
const accountStore = useAccountStore();
const uiStore = useUiStore();

type Flow = "clone" | "import" | "create" | null;
const step = ref<Flow>(uiStore.addRepoModalFlow);

// ── Clone state ────────────────────────────────────────────────────────────
type CloneMode = "cloud" | "url";
const cloneMode = ref<CloneMode>("cloud");
const cloneAccountId = ref("");
const cloneRepoId = ref("");
const cloneUrl = ref("");
const cloneProtocol = ref<"https" | "ssh">("https");
const cloneDestFolder = ref("");
const cloneRepoName = ref("");
const cloneOpenAfter = ref(true);
const cloneErrors = ref<Record<string, string>>({});
const cloneProgress = ref("");
const cloneBusy = ref(false);

// ── Import state ───────────────────────────────────────────────────────────
const importPath = ref("");
const importDetecting = ref(false);
const importDetectedRemote = ref("");
const importDetectedBranch = ref("");
const importDetectedProvider = ref("");
const importDetectedAccount = ref("");
const importAccountId = ref("");
const importOpenAfter = ref(true);
const importError = ref("");
const importBusy = ref(false);

// ── Create state ───────────────────────────────────────────────────────────
const createName = ref("");
const createVisibility = ref<"private" | "public">("private");
const createAccountId = ref("");
const createInitReadme = ref(true);
const createFolder = ref("");
const createOpenAfter = ref(true);
const createErrors = ref<Record<string, string>>({});
const createBusy = ref(false);

// ── Computed ───────────────────────────────────────────────────────────────
const connectedAccounts = computed(() => accountStore.accounts.filter((a) => a.status === "connected"));
const cloneRepos = computed(() => accountStore.repositoriesForAccount(cloneAccountId.value));
const selectedCloneRepo = computed(() => cloneRepos.value.find((r) => r.id === cloneRepoId.value) ?? null);

const inferredRepoName = computed(() => {
  const url = cloneUrl.value.trim();
  if (!url) return "";
  return url.split("/").pop()?.replace(/\.git$/, "") ?? "";
});

watch(cloneAccountId, () => { cloneRepoId.value = ""; });
watch(step, () => {
  cloneErrors.value = {};
  importError.value = "";
  createErrors.value = {};
});

onMounted(() => {
  const first = connectedAccounts.value[0];
  if (first) {
    cloneAccountId.value = first.id;
    importAccountId.value = first.id;
    createAccountId.value = first.id;
  }
});

// ── Browse helpers ─────────────────────────────────────────────────────────
async function browseFolder(target: "clone" | "import" | "create") {
  const path = await invoke<string | null>("repo_open_dialog");
  if (!path) return;
  if (target === "clone") {
    cloneDestFolder.value = path;
  } else if (target === "import") {
    importPath.value = path;
    await detectImportInfo(path);
  } else {
    createFolder.value = path;
  }
}

// ── Import auto-detection ──────────────────────────────────────────────────
async function detectImportInfo(path: string) {
  importDetecting.value = true;
  importDetectedRemote.value = "";
  importDetectedBranch.value = "";
  importDetectedProvider.value = "";
  importDetectedAccount.value = "";
  importError.value = "";

  try {
    const validation = await invoke<{ name: string; isGitRepo: boolean; path: string }>(
      "repo_validate_path",
      { path },
    );
    if (!validation.isGitRepo) {
      importError.value = "This folder is not a Git repository.";
      return;
    }
    const [remotes, status] = await Promise.all([
      gitApi.remotes(path),
      gitApi.status(path),
    ]);

    const origin = remotes.find((r) => r.name === "origin") ?? remotes[0];
    if (origin?.url) {
      importDetectedRemote.value = origin.url;
      const match = accountStore.findRepositoryMatch(origin.url);
      if (match?.account) {
        importDetectedAccount.value = match.account.username || match.account.name;
        importDetectedProvider.value = match.account.provider;
        importAccountId.value = match.account.id;
      } else if (match?.parsed) {
        importDetectedProvider.value = match.parsed.provider ?? "";
      }
    } else {
      importDetectedRemote.value = "No remote configured";
    }
    importDetectedBranch.value = status.branch || "main";
  } catch (e) {
    importError.value = String(e);
  } finally {
    importDetecting.value = false;
  }
}

// ── Clone ──────────────────────────────────────────────────────────────────
async function doClone() {
  const errors: Record<string, string> = {};

  if (cloneMode.value === "cloud") {
    if (!cloneAccountId.value) errors.account = "Select an account.";
    if (!cloneRepoId.value) errors.repo = "Select a repository.";
  } else {
    if (!cloneUrl.value.trim()) errors.url = "Paste a repository URL.";
  }
  if (!cloneDestFolder.value) errors.dest = "Choose a destination folder.";

  cloneErrors.value = errors;
  if (Object.keys(errors).length) return;

  cloneBusy.value = true;
  cloneProgress.value = "Preparing…";
  try {
    let url: string;
    let repoName: string;
    let linkedAccountId: string | null = null;
    let linkedRepoId: string | null = null;

    if (cloneMode.value === "cloud" && selectedCloneRepo.value) {
      url = accountStore.bestCloneUrl(selectedCloneRepo.value, cloneProtocol.value);
      if (!url) throw new Error("Repository has no clone URL");
      repoName = cloneRepoName.value.trim() || selectedCloneRepo.value.repoName;
      linkedAccountId = selectedCloneRepo.value.gitAccountId ?? null;
      linkedRepoId = selectedCloneRepo.value.id;
    } else {
      url = cloneUrl.value.trim();
      repoName = cloneRepoName.value.trim() || inferredRepoName.value || "repository";
    }

    cloneProgress.value = `Cloning ${repoName}…`;
    const result = await gitApi.clone(cloneDestFolder.value, url, repoName);
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);

    const localPath = `${cloneDestFolder.value.replace(/\/+$/, "")}/${repoName}`;
    cloneProgress.value = "Registering repository…";
    const repo = await repoStore.addRepo(localPath);
    await repoStore.linkRepo(repo.id, linkedAccountId, linkedRepoId);

    if (cloneOpenAfter.value) {
      repoStore.setActiveRepo(repo.id);
      router.push(`/repositories/${repo.id}/overview`);
    }
    uiStore.notify("success", `Cloned ${repoName}`);
    emit("close");
  } catch (e) {
    cloneErrors.value = { _: String(e) };
  } finally {
    cloneBusy.value = false;
    cloneProgress.value = "";
  }
}

// ── Import ─────────────────────────────────────────────────────────────────
async function doImport() {
  if (!importPath.value) {
    await browseFolder("import");
    return;
  }
  if (importError.value) return;

  importBusy.value = true;
  try {
    const repo = await repoStore.addRepo(importPath.value);
    // Try to match best account if not explicitly selected
    let accountId = importAccountId.value || null;
    if (!accountId && importDetectedRemote.value && importDetectedRemote.value !== "No remote configured") {
      const match = accountStore.findRepositoryMatch(importDetectedRemote.value);
      accountId = match?.account?.id ?? null;
    }
    await repoStore.linkRepo(repo.id, accountId, null);

    if (importOpenAfter.value) {
      repoStore.setActiveRepo(repo.id);
      router.push(`/repositories/${repo.id}/overview`);
    }
    uiStore.notify("success", `Imported ${repo.name}`);
    emit("close");
  } catch (e) {
    importError.value = String(e);
  } finally {
    importBusy.value = false;
  }
}

// ── Create ─────────────────────────────────────────────────────────────────
async function doCreate() {
  const errors: Record<string, string> = {};
  if (!createName.value.trim()) errors.name = "Repository name is required.";
  if (!createFolder.value) errors.folder = "Choose a local folder.";
  createErrors.value = errors;
  if (Object.keys(errors).length) return;

  createBusy.value = true;
  try {
    const fullPath = `${createFolder.value.replace(/\/+$/, "")}/${createName.value.trim()}`;
    const result = await gitApi.init(fullPath, "main");
    if (result.code !== 0) throw new Error(result.stderr || result.stdout);
    const repo = await repoStore.addRepo(fullPath);
    await repoStore.linkRepo(repo.id, createAccountId.value || null, null);

    if (createOpenAfter.value) {
      repoStore.setActiveRepo(repo.id);
      router.push(`/repositories/${repo.id}/overview`);
    }
    uiStore.notify("success", `Created ${createName.value.trim()}`);
    emit("close");
  } catch (e) {
    createErrors.value = { _: String(e) };
  } finally {
    createBusy.value = false;
  }
}

function close() { emit("close"); }
</script>

<template>
  <div class="modal-backdrop" @click.self="close">
    <div class="modal">

      <!-- ── Step 1: Choose Action ────────────────────────────────────── -->
      <template v-if="step === null">
        <div class="modal-header">
          <h2>Add Repository</h2>
          <button class="close-btn" @click="close"><XIcon /></button>
        </div>
        <p class="modal-desc">Choose how you want to add a repository to Alloy Git.</p>
        <div class="action-list">
          <button class="action-card" @click="step = 'clone'">
            <div class="action-icon">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 3v10M6 9l4 4 4-4M3 17h14"/>
              </svg>
            </div>
            <div class="action-body">
              <strong>Clone from Git Provider</strong>
              <span>Clone a repository from GitHub, GitLab, or Bitbucket.</span>
            </div>
            <ChevronRightIcon />
          </button>
          <button class="action-card" @click="step = 'import'">
            <div class="action-icon">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="14" height="14" rx="2"/>
                <path d="M3 8h14M8 3v5"/>
              </svg>
            </div>
            <div class="action-body">
              <strong>Import Local Repository</strong>
              <span>Add an existing local repository to Alloy Git.</span>
            </div>
            <ChevronRightIcon />
          </button>
          <button class="action-card" @click="step = 'create'">
            <div class="action-icon">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                <circle cx="10" cy="10" r="7.5"/>
                <path d="M10 6.5v7M6.5 10h7"/>
              </svg>
            </div>
            <div class="action-body">
              <strong>Create New Repository</strong>
              <span>Initialize a new Git repository locally.</span>
            </div>
            <ChevronRightIcon />
          </button>
        </div>
        <div class="modal-footer">
          <button class="btn-ghost" @click="close">Cancel</button>
        </div>
      </template>

      <!-- ── Step 2A: Clone Repository ────────────────────────────────── -->
      <template v-else-if="step === 'clone'">
        <div class="modal-header">
          <button class="back-btn" @click="step = null"><BackIcon /></button>
          <h2>Clone Repository</h2>
          <button class="close-btn" @click="close"><XIcon /></button>
        </div>

        <div class="form">
          <!-- Mode toggle -->
          <div class="mode-toggle">
            <button :class="{ active: cloneMode === 'cloud' }" @click="cloneMode = 'cloud'">
              From Cloud Account
            </button>
            <button :class="{ active: cloneMode === 'url' }" @click="cloneMode = 'url'">
              From URL
            </button>
          </div>

          <!-- Cloud mode -->
          <template v-if="cloneMode === 'cloud'">
            <div class="form-row">
              <label>Account</label>
              <select v-model="cloneAccountId" :class="{ error: cloneErrors.account }">
                <option value="">— Select account —</option>
                <option v-for="a in connectedAccounts" :key="a.id" :value="a.id">
                  {{ a.username || a.name }} ({{ a.provider }})
                </option>
              </select>
              <span v-if="cloneErrors.account" class="field-error">{{ cloneErrors.account }}</span>
              <span v-if="!connectedAccounts.length" class="field-hint">
                No connected accounts. Go to <RouterLink to="/settings/accounts" @click="close">Settings → Accounts</RouterLink> to add one.
              </span>
            </div>
            <div v-if="cloneAccountId" class="form-row">
              <label>Repository</label>
              <select v-model="cloneRepoId" :class="{ error: cloneErrors.repo }">
                <option value="">— Search repositories —</option>
                <option v-for="r in cloneRepos" :key="r.id" :value="r.id">{{ r.repoFullName }}</option>
              </select>
              <span v-if="cloneErrors.repo" class="field-error">{{ cloneErrors.repo }}</span>
              <span v-if="cloneAccountId && !cloneRepos.length" class="field-hint">No repositories synced. Sync them in Settings → Accounts.</span>
            </div>
            <div v-if="cloneRepoId" class="form-row">
              <label>Protocol</label>
              <div class="toggle-row">
                <button :class="{ active: cloneProtocol === 'https' }" @click="cloneProtocol = 'https'">HTTPS</button>
                <button :class="{ active: cloneProtocol === 'ssh' }" @click="cloneProtocol = 'ssh'">SSH</button>
              </div>
            </div>
          </template>

          <!-- URL mode -->
          <template v-else>
            <div class="form-row">
              <label>Repository URL</label>
              <input
                v-model="cloneUrl"
                :class="{ error: cloneErrors.url }"
                placeholder="https://github.com/org/repo.git"
              />
              <span v-if="cloneErrors.url" class="field-error">{{ cloneErrors.url }}</span>
            </div>
          </template>

          <!-- Destination folder (always shown) -->
          <div class="form-row">
            <label>Destination Folder</label>
            <div class="path-row">
              <input
                :value="cloneDestFolder || 'Choose a folder…'"
                class="path-input"
                :class="{ error: cloneErrors.dest, placeholder: !cloneDestFolder }"
                readonly
                @click="browseFolder('clone')"
              />
              <button class="browse-btn" @click="browseFolder('clone')">Browse</button>
            </div>
            <span v-if="cloneErrors.dest" class="field-error">{{ cloneErrors.dest }}</span>
          </div>

          <!-- Local folder name override -->
          <div class="form-row">
            <label>Local Folder Name <span class="optional">(optional)</span></label>
            <input
              v-model="cloneRepoName"
              :placeholder="cloneMode === 'cloud' ? (selectedCloneRepo?.repoName ?? 'repository') : (inferredRepoName || 'repository')"
            />
          </div>

          <label class="checkbox-row">
            <input v-model="cloneOpenAfter" type="checkbox" />
            Open repository after clone
          </label>

          <div v-if="cloneProgress" class="progress-banner">
            <div class="progress-spinner" />
            {{ cloneProgress }}
          </div>
          <div v-if="cloneErrors._" class="error-banner">{{ cloneErrors._ }}</div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" :disabled="cloneBusy" @click="close">Cancel</button>
          <button class="btn-primary" :disabled="cloneBusy" @click="doClone">
            {{ cloneBusy ? "Cloning…" : "Clone Repository" }}
          </button>
        </div>
      </template>

      <!-- ── Step 2B: Import Local Repository ─────────────────────────── -->
      <template v-else-if="step === 'import'">
        <div class="modal-header">
          <button class="back-btn" @click="step = null"><BackIcon /></button>
          <h2>Import Local Repository</h2>
          <button class="close-btn" @click="close"><XIcon /></button>
        </div>

        <div class="form">
          <div class="form-row">
            <label>Repository Path</label>
            <div class="path-row">
              <input
                :value="importPath || 'Browse to select a folder…'"
                class="path-input"
                :class="{ placeholder: !importPath }"
                readonly
                @click="browseFolder('import')"
              />
              <button class="browse-btn" @click="browseFolder('import')">Browse</button>
            </div>
          </div>

          <!-- Detection spinner -->
          <div v-if="importDetecting" class="detecting-state">
            <div class="progress-spinner" />
            Detecting repository information…
          </div>

          <!-- Detection results -->
          <template v-else-if="importPath && !importError">
            <div class="detected-grid">
              <div class="detected-row">
                <span class="detected-label">Detected Remote</span>
                <span class="detected-value" :class="{ muted: importDetectedRemote === 'No remote configured' }">
                  {{ importDetectedRemote || "—" }}
                </span>
              </div>
              <div class="detected-row">
                <span class="detected-label">Current Branch</span>
                <span class="detected-value mono">{{ importDetectedBranch || "—" }}</span>
              </div>
              <div v-if="importDetectedProvider" class="detected-row">
                <span class="detected-label">Detected Provider</span>
                <span class="detected-value">{{ importDetectedProvider }}</span>
              </div>
              <div v-if="importDetectedAccount" class="detected-row">
                <span class="detected-label">Matched Account</span>
                <span class="detected-value ok">{{ importDetectedAccount }}</span>
              </div>
            </div>

            <div class="form-row">
              <label>Link to Account <span class="optional">(override)</span></label>
              <select v-model="importAccountId">
                <option value="">Local only (no account)</option>
                <option v-for="a in connectedAccounts" :key="a.id" :value="a.id">
                  {{ a.username || a.name }} ({{ a.provider }})
                </option>
              </select>
            </div>

            <label class="checkbox-row">
              <input v-model="importOpenAfter" type="checkbox" />
              Open repository after import
            </label>
          </template>

          <div v-if="importError" class="error-banner">{{ importError }}</div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" :disabled="importBusy" @click="close">Cancel</button>
          <button
            class="btn-primary"
            :disabled="importBusy || importDetecting || !!importError"
            @click="doImport"
          >
            {{ importBusy ? "Importing…" : importPath ? "Import and Link" : "Browse for Repository" }}
          </button>
        </div>
      </template>

      <!-- ── Step 2C: Create New Repository ───────────────────────────── -->
      <template v-else-if="step === 'create'">
        <div class="modal-header">
          <button class="back-btn" @click="step = null"><BackIcon /></button>
          <h2>Create New Repository</h2>
          <button class="close-btn" @click="close"><XIcon /></button>
        </div>

        <div class="form">
          <div class="form-row">
            <label>Repository Name</label>
            <input
              v-model="createName"
              :class="{ error: createErrors.name }"
              placeholder="my-new-project"
              @input="delete createErrors.name"
            />
            <span v-if="createErrors.name" class="field-error">{{ createErrors.name }}</span>
          </div>

          <div class="form-row">
            <label>Visibility</label>
            <div class="toggle-row">
              <button :class="{ active: createVisibility === 'private' }" @click="createVisibility = 'private'">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="5" width="8" height="6" rx="1"/><path d="M4 5V3.5a2 2 0 0 1 4 0V5"/></svg>
                Private
              </button>
              <button :class="{ active: createVisibility === 'public' }" @click="createVisibility = 'public'">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="6" cy="6" r="4.5"/><path d="M1.5 6h9M6 1.5C4.5 3.5 4.5 8.5 6 10.5M6 1.5C7.5 3.5 7.5 8.5 6 10.5"/></svg>
                Public
              </button>
            </div>
          </div>

          <div class="form-row">
            <label>Account <span class="optional">(optional)</span></label>
            <select v-model="createAccountId">
              <option value="">Local only</option>
              <option v-for="a in connectedAccounts" :key="a.id" :value="a.id">
                {{ a.username || a.name }} ({{ a.provider }})
              </option>
            </select>
            <span v-if="createAccountId" class="field-hint">Repository will be initialized locally and linked to this account.</span>
          </div>

          <div class="form-row">
            <label>Local Path</label>
            <div class="path-row">
              <input
                :value="createFolder ? `${createFolder}/${createName || 'my-repo'}` : 'Choose a folder…'"
                class="path-input"
                :class="{ error: createErrors.folder, placeholder: !createFolder }"
                readonly
                @click="browseFolder('create')"
              />
              <button class="browse-btn" @click="browseFolder('create')">Browse</button>
            </div>
            <span v-if="createErrors.folder" class="field-error">{{ createErrors.folder }}</span>
          </div>

          <label class="checkbox-row">
            <input v-model="createInitReadme" type="checkbox" />
            Initialize with README
          </label>
          <label class="checkbox-row">
            <input v-model="createOpenAfter" type="checkbox" />
            Open repository after create
          </label>

          <div v-if="createErrors._" class="error-banner">{{ createErrors._ }}</div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" :disabled="createBusy" @click="close">Cancel</button>
          <button class="btn-primary" :disabled="createBusy || !createName.trim()" @click="doCreate">
            {{ createBusy ? "Creating…" : "Create and Clone" }}
          </button>
        </div>
      </template>

    </div>
  </div>
</template>

<!-- Inline icon components to avoid extra imports -->
<script lang="ts">
import { defineComponent, h } from "vue";

const XIcon = defineComponent({
  render: () => h("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" },
    [h("path", { d: "M2 2l10 10M12 2L2 12" })]),
});
const BackIcon = defineComponent({
  render: () => h("svg", { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" },
    [h("path", { d: "M8 2L4 7l4 5" })]),
});
const ChevronRightIcon = defineComponent({
  render: () => h("svg", { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round" },
    [h("path", { d: "M4 2l4 4-4 4" })]),
});

export { XIcon, BackIcon, ChevronRightIcon };
export default {};
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.52);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal {
  width: min(480px, calc(100vw - 40px));
  max-height: calc(100vh - 80px);
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* ── Header ── */
.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 18px 0;
  flex-shrink: 0;
}
.modal-header h2 {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.modal-desc {
  margin: 8px 18px 16px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
.close-btn, .back-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 80ms, color 80ms;
}
.close-btn:hover, .back-btn:hover { color: var(--text); background: var(--surface-2); }

/* ── Action list (choose step) ── */
.action-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 14px 4px;
}
.action-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-0);
  cursor: pointer;
  text-align: left;
  transition: background 100ms, border-color 100ms;
}
.action-card:hover { background: var(--surface-2); border-color: var(--accent); }
.action-icon {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  background: var(--accent-subtle);
  color: var(--accent);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.action-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.action-body strong { font-size: 13px; font-weight: 600; color: var(--text); }
.action-body span { font-size: 12px; color: var(--text-muted); }

/* ── Form ── */
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
}
.form-row { display: flex; flex-direction: column; gap: 5px; }
.form-row label { font-size: 12px; font-weight: 500; color: var(--text-muted); }
.form-row input,
.form-row select {
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-0);
  color: var(--text);
  font-size: 13px;
  padding: 0 10px;
  transition: border-color 100ms;
}
.form-row input:focus,
.form-row select:focus { outline: none; border-color: var(--accent); }
.form-row input.error,
.form-row select.error { border-color: var(--deleted); }

.path-row { display: flex; gap: 6px; }
.path-input {
  flex: 1;
  min-width: 0;
  cursor: pointer !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.path-input.placeholder { color: var(--text-subtle) !important; }
.browse-btn {
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  transition: background 80ms, color 80ms;
}
.browse-btn:hover { background: var(--surface-3); color: var(--text); }

/* Clone mode toggle */
.mode-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
}
.mode-toggle button {
  flex: 1;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 80ms, color 80ms;
}
.mode-toggle button.active { background: var(--accent); color: #fff; }

/* Protocol toggle */
.toggle-row {
  display: flex;
  width: fit-content;
  border: 1px solid var(--border);
  border-radius: 7px;
  overflow: hidden;
}
.toggle-row button {
  display: flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  padding: 5px 14px;
  cursor: pointer;
  transition: background 80ms, color 80ms;
}
.toggle-row button.active { background: var(--accent); color: #fff; }

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  cursor: pointer;
}
.checkbox-row input { width: 14px; height: 14px; cursor: pointer; }

.field-error { font-size: 11px; color: var(--deleted); }
.field-hint { font-size: 11px; color: var(--text-subtle); }
.field-hint a { color: var(--accent); }
.optional { font-weight: 400; font-size: 11px; color: var(--text-subtle); }

.progress-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 7px;
  background: var(--accent-subtle);
  color: var(--accent);
  font-size: 12px;
}
.error-banner {
  padding: 10px 12px;
  border-radius: 7px;
  background: rgba(239, 68, 68, 0.1);
  color: var(--deleted);
  font-size: 12px;
}

/* Progress spinner */
.progress-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Detecting state */
.detecting-state {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}

/* Detected info grid */
.detected-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.detected-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}
.detected-row:last-child { border-bottom: none; }
.detected-label {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.detected-value {
  font-size: 12px;
  color: var(--text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}
.detected-value.mono { font-family: var(--font-mono, monospace); font-size: 11px; }
.detected-value.muted { color: var(--text-subtle); }
.detected-value.ok { color: var(--added); }

/* ── Footer ── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.btn-ghost {
  height: 34px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: background 80ms, color 80ms;
}
.btn-ghost:hover { background: var(--surface-2); color: var(--text); }
.btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary {
  height: 34px;
  padding: 0 18px;
  border: none;
  border-radius: 7px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms;
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
