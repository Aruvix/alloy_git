<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useRoute } from "vue-router";
import { gitApi } from "@alloy/git-core";
import { useRepoStore } from "../stores/repoStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

const route = useRoute();
const repoStore = useRepoStore();
const uiStore = useUiStore();

const terminalEl = ref<HTMLElement | null>(null);
const repo = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId) ?? null);

interface TerminalApp { id: string; name: string }
const terminals = ref<TerminalApp[]>([]);
const showLauncher = ref(false);
const opening = ref<string | null>(null);

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;

// Terminal session state
let currentLine = "";
let cmdHistory: string[] = [];
let historyIdx = -1;
let running = false;

function getTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    background:        v("--surface-0")    || "#0d0d0d",
    foreground:        v("--text")         || "#e8e8e8",
    cursor:            v("--accent")       || "#4f8ef7",
    cursorAccent:      v("--surface-0")    || "#0d0d0d",
    selectionBackground: (v("--accent") || "#4f8ef7") + "40",
    black:             "#1a1a1a",
    red:               v("--deleted")      || "#f85149",
    green:             v("--added")        || "#3fb950",
    yellow:            v("--modified")     || "#d29922",
    blue:              v("--accent")       || "#4f8ef7",
    magenta:           v("--conflict")     || "#ff7b72",
    cyan:              "#5bc8d1",
    white:             v("--text")         || "#e8e8e8",
    brightBlack:       v("--text-subtle")  || "#555555",
    brightRed:         v("--deleted")      || "#f85149",
    brightGreen:       v("--added")        || "#3fb950",
    brightYellow:      v("--modified")     || "#d29922",
    brightBlue:        v("--accent-hover") || "#6ba3ff",
    brightMagenta:     v("--conflict")     || "#ff7b72",
    brightCyan:        "#7ed8e0",
    brightWhite:       "#ffffff",
  };
}

function repoName() {
  return repo.value?.path.split("/").filter(Boolean).pop() ?? "";
}

function writePrompt() {
  const name = repoName();
  term!.write(`\r\n\x1b[34m${name}\x1b[0m \x1b[1;32m$\x1b[0m `);
}

function replaceInputLine(newContent: string) {
  // Clear the current line and rewrite prompt + new content
  const name = repoName();
  term!.write(`\r\x1b[2K\x1b[34m${name}\x1b[0m \x1b[1;32m$\x1b[0m ${newContent}`);
  currentLine = newContent;
}

async function submitCommand(cmd: string) {
  if (!repo.value) return;

  if (!cmd.trim()) {
    writePrompt();
    return;
  }

  // Update history
  if (cmd.trim() && (cmdHistory.length === 0 || cmdHistory[0] !== cmd.trim())) {
    cmdHistory.unshift(cmd.trim());
    if (cmdHistory.length > 200) cmdHistory.pop();
  }
  historyIdx = -1;

  // Built-in: clear
  if (cmd.trim() === "clear" || cmd.trim() === "cls") {
    term!.clear();
    writePrompt();
    return;
  }

  running = true;
  try {
    const result = await gitApi.terminal(repo.value.path, cmd.trim());
    const out = result.stdout.replace(/\r?\n$/, "");
    const err = result.stderr.replace(/\r?\n$/, "");
    if (out) term!.writeln(out);
    if (err && err !== out) term!.write(`\x1b[31m${err}\x1b[0m`);
    if (result.code !== 0 && !err && !out) {
      term!.writeln(`\x1b[2m[exit ${result.code}]\x1b[0m`);
    }
  } catch (e) {
    term!.writeln(`\x1b[31mError: ${e}\x1b[0m`);
  } finally {
    running = false;
    writePrompt();
  }
}

function handleKey({ key, domEvent }: { key: string; domEvent: KeyboardEvent }) {
  if (running) {
    // Allow ctrl+c visual feedback even while running
    if (domEvent.ctrlKey && domEvent.key === "c") {
      term!.write("^C");
    }
    return;
  }

  const isPrintable =
    !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey && key.length === 1;

  if (domEvent.key === "Enter") {
    term!.write("\r\n");
    const cmd = currentLine;
    currentLine = "";
    submitCommand(cmd);
    return;
  }

  if (domEvent.key === "Backspace") {
    if (currentLine.length > 0) {
      currentLine = currentLine.slice(0, -1);
      term!.write("\b \b");
    }
    return;
  }

  if (domEvent.key === "ArrowUp") {
    domEvent.preventDefault();
    if (historyIdx < cmdHistory.length - 1) {
      historyIdx++;
      replaceInputLine(cmdHistory[historyIdx]);
    }
    return;
  }

  if (domEvent.key === "ArrowDown") {
    domEvent.preventDefault();
    if (historyIdx > 0) {
      historyIdx--;
      replaceInputLine(cmdHistory[historyIdx]);
    } else if (historyIdx === 0) {
      historyIdx = -1;
      replaceInputLine("");
    }
    return;
  }

  if (domEvent.ctrlKey && domEvent.key === "c") {
    term!.write("^C\r\n");
    currentLine = "";
    historyIdx = -1;
    writePrompt();
    return;
  }

  if (domEvent.ctrlKey && domEvent.key === "l") {
    term!.clear();
    currentLine = "";
    writePrompt();
    return;
  }

  // Home / End
  if (domEvent.key === "Home") {
    // Move cursor to start of input — complex without readline; ignore for now
    return;
  }

  if (isPrintable) {
    currentLine += key;
    term!.write(key);
  }
}

async function openTerminal(id: string) {
  if (!repo.value) return;
  opening.value = id;
  try {
    await invoke("open_in_terminal", { path: repo.value.path, terminalId: id });
    localStorage.setItem("preferredTerminal", id);
    showLauncher.value = false;
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    opening.value = null;
  }
}

onMounted(async () => {
  // Load available system terminals for the launcher
  try {
    terminals.value = await invoke<TerminalApp[]>("list_terminals");
  } catch {
    // not in Tauri context
  }

  if (!terminalEl.value) return;

  term = new Terminal({
    fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, ui-monospace, Menlo, monospace",
    fontSize: 13,
    lineHeight: 1.45,
    theme: getTheme(),
    cursorBlink: true,
    cursorStyle: "block",
    scrollback: 2000,
    convertEol: true,
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalEl.value);
  fitAddon.fit();

  // Welcome banner
  const name = repoName();
  const path = repo.value?.path ?? "";
  term.writeln(`\x1b[2m╌╌╌ Alloy Terminal  \x1b[0m\x1b[34m${name}\x1b[0m`);
  term.writeln(`\x1b[2m    ${path}\x1b[0m`);
  term.writeln(`\x1b[2m    type a command and press Enter · ↑↓ history · ctrl+l clear\x1b[0m`);
  writePrompt();
  term.focus();

  term.onKey(handleKey);

  resizeObserver = new ResizeObserver(() => fitAddon?.fit());
  resizeObserver.observe(terminalEl.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
  term?.dispose();
});
</script>

<template>
  <div class="terminal-view">
    <!-- Compact topbar -->
    <div class="topbar">
      <span class="topbar-path">{{ repo?.path }}</span>
      <div class="topbar-actions">
        <div class="launcher-wrap" v-if="terminals.length > 0">
          <button class="topbar-btn" @click="showLauncher = !showLauncher" title="Open in external terminal">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
                 stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="2" width="14" height="12" rx="2"/>
              <path d="M4 6l3 2.5L4 11M8 11h4"/>
            </svg>
            External
          </button>
          <div class="launcher-dropdown" v-if="showLauncher">
            <button
              v-for="t in terminals"
              :key="t.id"
              class="launcher-item"
              :disabled="opening !== null"
              @click="openTerminal(t.id)"
            >
              {{ t.name }}
              <span v-if="opening === t.id">…</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- xterm.js terminal container -->
    <div ref="terminalEl" class="xterm-container" />
  </div>
</template>

<style>
/* xterm.js global styles — must not be scoped */
@import "@xterm/xterm/css/xterm.css";

.xterm-container .xterm {
  height: 100%;
  padding: 10px 14px;
}

.xterm-container .xterm-viewport {
  background-color: transparent !important;
}
</style>

<style scoped>
.terminal-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-0);
}

/* ── Topbar ── */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 34px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 8px;
}

.topbar-path {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-subtle);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.topbar-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 80ms, color 80ms;
}

.topbar-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.topbar-btn svg {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
}

/* ── Launcher dropdown ── */
.launcher-wrap {
  position: relative;
}

.launcher-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 4px;
  min-width: 150px;
  z-index: 50;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.launcher-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 80ms, color 80ms;
}

.launcher-item:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text);
}

.launcher-item:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── xterm container ── */
.xterm-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-0);
}
</style>
