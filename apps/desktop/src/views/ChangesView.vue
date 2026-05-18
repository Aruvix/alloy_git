<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Database from "@tauri-apps/plugin-sql";
import { useRepoStore } from "../stores/repoStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { gitApi, scanGitSecrets } from "@alloy/git-core";
import type { GitFileChange } from "@alloy/git-core";
import FileChangeItem from "../components/FileChangeItem.vue";
import DiffViewer from "../components/DiffViewer.vue";
import Button from "../components/ui/Button.vue";
import ResizableSplitter from "../components/ui/ResizableSplitter.vue";

const route = useRoute();
const repoStore = useRepoStore();
const statusStore = useGitStatusStore();
const uiStore = useUiStore();

const repoPath = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId)?.path ?? "");
const diff = ref("");
const loadingDiff = ref(false);
const committing = ref(false);
const amend = ref(false);
const commitDescription = ref("");
const pushAfterCommit = ref(false);
let db: Awaited<ReturnType<typeof Database.load>> | null = null;

async function secretScanMode(): Promise<"warn" | "block" | "off"> {
  db ??= await Database.load("sqlite:alloy.db");
  const rows = await db.select<Array<{ secret_scan_mode?: string }>>(
    "SELECT secret_scan_mode FROM global_git_config WHERE id = 1",
  );
  const mode = rows[0]?.secret_scan_mode;
  return mode === "block" || mode === "off" ? mode : "warn";
}

async function loadDiff(file: GitFileChange | null) {
  if (!file || !repoPath.value) { diff.value = ""; return; }
  loadingDiff.value = true;
  try {
    diff.value = await gitApi.diff(repoPath.value, file.path, file.staged);
  } finally {
    loadingDiff.value = false;
  }
}

watch(() => statusStore.selectedFile, loadDiff);

async function stageFile(file: GitFileChange) {
  try { await statusStore.stageFile(repoPath.value, file.path); }
  catch (e) { uiStore.notify("error", String(e)); }
}
async function unstageFile(file: GitFileChange) {
  try { await statusStore.unstageFile(repoPath.value, file.path); }
  catch (e) { uiStore.notify("error", String(e)); }
}
async function discardFile(file: GitFileChange) {
  try { await statusStore.discardFile(repoPath.value, file.path); }
  catch (e) { uiStore.notify("error", String(e)); }
}
async function stageAll() {
  try { await statusStore.stageAll(repoPath.value); }
  catch (e) { uiStore.notify("error", String(e)); }
}
async function unstageAll() {
  try { await statusStore.unstageAll(repoPath.value); }
  catch (e) { uiStore.notify("error", String(e)); }
}
async function doCommit() {
  committing.value = true;
  try {
    const mode = await secretScanMode();
    if (mode !== "off") {
      const findings = await scanGitSecrets(repoPath.value, statusStore.stagedFiles.map((file) => file.path));
      if (findings.length > 0) {
        const message = `${findings.length} potential secret${findings.length === 1 ? "" : "s"} found before commit`;
        if (mode === "block") throw new Error(message);
        uiStore.notify("warning", message, 6000);
      }
    }
    if (commitDescription.value.trim()) {
      statusStore.commitMessage = `${statusStore.commitMessage.trim()}\n\n${commitDescription.value.trim()}`;
    }
    await statusStore.commit(repoPath.value, amend.value);
    commitDescription.value = "";
    if (pushAfterCommit.value) {
      const pushResult = await gitApi.push(repoPath.value);
      if (pushResult.code !== 0) throw new Error(pushResult.stderr || pushResult.stdout);
    }
    uiStore.notify("success", "Committed successfully");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    committing.value = false;
  }
}

function handleShortcut(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && statusStore.canCommit) {
    event.preventDefault();
    doCommit();
  }
}

onMounted(() => window.addEventListener("keydown", handleShortcut));
onUnmounted(() => window.removeEventListener("keydown", handleShortcut));
</script>

<template>
  <div class="changes-view">
    <div class="file-panel" :style="{ width: uiStore.filePanelWidth + 'px' }">
      <!-- Staged -->
      <div class="file-section">
        <div class="section-header">
          <span>Staged <span class="count">{{ statusStore.stagedFiles.length }}</span></span>
          <Button size="sm" variant="ghost" v-if="statusStore.stagedFiles.length > 0" @click="unstageAll">Unstage all</Button>
        </div>
        <div v-if="statusStore.stagedFiles.length === 0" class="empty">No staged changes</div>
        <FileChangeItem
          v-for="file in statusStore.stagedFiles"
          :key="file.path"
          :file="file"
          :selected="statusStore.selectedFile?.path === file.path"
          @click="statusStore.selectFile(file)"
          @unstage="unstageFile(file)"
          @discard="discardFile(file)"
        />
      </div>

      <!-- Unstaged -->
      <div class="file-section">
        <div class="section-header">
          <span>Unstaged <span class="count">{{ statusStore.unstagedFiles.length }}</span></span>
          <Button size="sm" variant="ghost" v-if="statusStore.unstagedFiles.length > 0" @click="stageAll">Stage all</Button>
        </div>
        <div v-if="statusStore.unstagedFiles.length === 0" class="empty">No unstaged changes</div>
        <FileChangeItem
          v-for="file in statusStore.unstagedFiles"
          :key="file.path"
          :file="file"
          :selected="statusStore.selectedFile?.path === file.path"
          @click="statusStore.selectFile(file)"
          @stage="stageFile(file)"
          @discard="discardFile(file)"
        />
      </div>

      <!-- Commit panel -->
      <div class="commit-panel">
        <textarea
          v-model="statusStore.commitMessage"
          class="commit-input"
          placeholder="Commit message…"
          rows="3"
        />
        <textarea
          v-model="commitDescription"
          class="commit-input description"
          placeholder="Description (optional)…"
          rows="4"
        />
        <div class="commit-actions">
          <div class="commit-options">
            <label class="amend-toggle">
              <input type="checkbox" v-model="amend" />
              Amend last commit
            </label>
            <label class="amend-toggle">
              <input type="checkbox" v-model="pushAfterCommit" />
              Push after commit
            </label>
          </div>
          <Button
            variant="primary"
            size="sm"
            :disabled="!statusStore.canCommit"
            :loading="committing"
            @click="doCommit"
          >
            Commit Changes
          </Button>
        </div>
      </div>
    </div>

    <ResizableSplitter :min="180" :max="520" @resize-end="uiStore.filePanelWidth = $event" />
    <div class="diff-panel">
      <div v-if="loadingDiff" class="diff-loading">Loading diff…</div>
      <div v-else-if="!statusStore.selectedFile" class="diff-empty">Select a file to view diff</div>
      <DiffViewer v-else :diff="diff" :file-path="statusStore.selectedFile.path" />
    </div>
  </div>
</template>

<style scoped>
.changes-view {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
.file-panel {
  min-width: 0;
  max-width: min(520px, 55vw);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
}
.file-section {
  flex: 1;
  overflow-y: auto;
  border-bottom: 1px solid var(--border);
  min-height: 80px;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  position: sticky;
  top: 0;
  background: var(--surface-1);
  z-index: 1;
}
.count {
  background: var(--surface-3);
  color: var(--text-muted);
  border-radius: 8px;
  padding: 0 5px;
  font-size: 10px;
  margin-left: 4px;
}
.empty {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-subtle);
}
.commit-panel {
  padding: 8px;
  border-top: 1px solid var(--border);
  background: var(--surface-1);
  flex-shrink: 0;
}
.commit-input {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  padding: 6px 8px;
  resize: none;
  font-family: inherit;
  outline: none;
  transition: border-color 100ms;
}
.commit-input:focus { border-color: var(--accent); }
.commit-input.description { margin-top: 6px; }
.commit-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  gap: 10px;
}
.commit-options {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.amend-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
}
.diff-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.diff-loading,
.diff-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-subtle);
}
</style>
