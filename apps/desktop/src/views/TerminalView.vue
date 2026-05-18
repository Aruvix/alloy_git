<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute } from "vue-router";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { useRepoStore } from "../stores/repoStore.js";
import { useUiStore } from "../stores/uiStore.js";
import { useTerminalStore, type TerminalSession } from "../stores/terminalStore.js";
import { useGitStatusStore } from "../stores/gitStatusStore.js";

const route = useRoute();
const repoStore = useRepoStore();
const uiStore = useUiStore();
const terminalStore = useTerminalStore();
const gitStatusStore = useGitStatusStore();

const repo = computed(() => repoStore.repos.find((r) => r.id === route.params.repoId) ?? null);
const repoPath = computed(() => repo.value?.path ?? "");
const repoBranch = computed(() => gitStatusStore.status?.branch ?? null);

// ── Rename UI state ──────────────────────────────────────────────────────────
const renamingId = ref<string | null>(null);
const renameValue = ref("");

// ── Search UI state ──────────────────────────────────────────────────────────
const searchOpen = ref(false);
const searchQuery = ref("");

// ── Kill confirmation ────────────────────────────────────────────────────────
const killConfirmId = ref<string | null>(null);

// ── Per-session xterm instances (not reactive — DOM objects) ─────────────────
interface XTermInstance {
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  el: HTMLDivElement;
  resizeObserver: ResizeObserver;
}
const xtermMap = new Map<string, XTermInstance>();
const containerRef = ref<HTMLDivElement | null>(null);

// ── Tauri event unsubscribers ────────────────────────────────────────────────
const unlisten: UnlistenFn[] = [];

// ── Theme helper ─────────────────────────────────────────────────────────────
function getTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    background:            v("--surface-0")    || "#0d0d0d",
    foreground:            v("--text")         || "#e8e8e8",
    cursor:                v("--accent")       || "#4f8ef7",
    cursorAccent:          v("--surface-0")    || "#0d0d0d",
    selectionBackground:   (v("--accent") || "#4f8ef7") + "40",
    black:                 "#1a1a1a",
    red:                   v("--deleted")      || "#f85149",
    green:                 v("--added")        || "#3fb950",
    yellow:                v("--modified")     || "#d29922",
    blue:                  v("--accent")       || "#4f8ef7",
    magenta:               v("--conflict")     || "#ff7b72",
    cyan:                  "#5bc8d1",
    white:                 v("--text")         || "#e8e8e8",
    brightBlack:           v("--text-subtle")  || "#555555",
    brightRed:             v("--deleted")      || "#f85149",
    brightGreen:           v("--added")        || "#3fb950",
    brightYellow:          v("--modified")     || "#d29922",
    brightBlue:            v("--accent-hover") || "#6ba3ff",
    brightMagenta:         v("--conflict")     || "#ff7b72",
    brightCyan:            "#7ed8e0",
    brightWhite:           "#ffffff",
  };
}

// ── xterm instance lifecycle ─────────────────────────────────────────────────

function mountXterm(session: TerminalSession) {
  if (!containerRef.value || xtermMap.has(session.id)) return;

  const { settings } = terminalStore;
  const term = new Terminal({
    fontFamily: settings.fontFamily,
    fontSize: settings.fontSize,
    lineHeight: 1.45,
    theme: getTheme(),
    cursorBlink: true,
    cursorStyle: settings.cursorStyle,
    scrollback: settings.scrollbackLimit,
    convertEol: true,
    allowProposedApi: true,
  });

  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);

  const el = document.createElement("div");
  el.className = "xterm-pane";
  el.dataset.sessionId = session.id;
  containerRef.value.appendChild(el);

  term.open(el);
  fitAddon.fit();

  // Show connection state while PTY is starting
  if (session.status === "connecting") {
    term.writeln("\x1b[2mConnecting…\x1b[0m");
  } else if (session.status === "error") {
    writeError(term, session.errorMessage ?? "Failed to start shell.");
  }

  // Forward keyboard input to PTY
  term.onData((data) => {
    terminalStore.writeToSession(session.id, data);
  });

  // Resize → notify PTY
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    const { cols, rows } = term;
    terminalStore.resizeSession(session.id, cols, rows);
  });
  resizeObserver.observe(el);

  xtermMap.set(session.id, { term, fitAddon, searchAddon, el, resizeObserver });
  showXterm(session.id);
}

function showXterm(sessionId: string) {
  for (const [id, inst] of xtermMap) {
    inst.el.style.display = id === sessionId ? "block" : "none";
  }
  const inst = xtermMap.get(sessionId);
  if (inst) {
    nextTick(() => {
      inst.fitAddon.fit();
      inst.term.focus();
    });
  }
}

function destroyXterm(sessionId: string) {
  const inst = xtermMap.get(sessionId);
  if (!inst) return;
  inst.resizeObserver.disconnect();
  inst.term.dispose();
  inst.el.remove();
  xtermMap.delete(sessionId);
}

function writeError(term: Terminal, msg: string) {
  term.writeln(`\x1b[31m⚠  ${msg}\x1b[0m`);
  term.writeln("\x1b[2mChoose another shell in Settings → Terminal.\x1b[0m");
}

// ── Tab management ────────────────────────────────────────────────────────────

async function newTab() {
  const sessionId = await terminalStore.createSession(repoPath.value, repoBranch.value);
  await nextTick();
  const session = terminalStore.sessions.find((s) => s.id === sessionId);
  if (session) mountXterm(session);
}

async function closeTab(sessionId: string, force = false) {
  const session = terminalStore.sessions.find((s) => s.id === sessionId);
  if (!session) return;

  if (terminalStore.settings.confirmBeforeKill && !force && session.status === "active") {
    killConfirmId.value = sessionId;
    return;
  }

  destroyXterm(sessionId);
  await terminalStore.killSession(sessionId, true);
  killConfirmId.value = null;
}

async function confirmKill() {
  if (killConfirmId.value) await closeTab(killConfirmId.value, true);
}

function cancelKill() {
  killConfirmId.value = null;
}

async function restartSession(sessionId: string) {
  const session = terminalStore.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  const prevRepo = session.repoPath;
  const prevBranch = session.repoBranch;
  destroyXterm(sessionId);
  await terminalStore.killSession(sessionId, true);
  const newId = await terminalStore.createSession(prevRepo, prevBranch);
  await nextTick();
  const newSession = terminalStore.sessions.find((s) => s.id === newId);
  if (newSession) mountXterm(newSession);
}

function selectTab(sessionId: string) {
  terminalStore.setActive(sessionId);
  showXterm(sessionId);
}

// ── Rename ────────────────────────────────────────────────────────────────────

function startRename(sessionId: string, currentName: string) {
  renamingId.value = sessionId;
  renameValue.value = currentName;
  nextTick(() => {
    (document.querySelector(".rename-input") as HTMLInputElement)?.select();
  });
}

function commitRename() {
  if (renamingId.value && renameValue.value.trim()) {
    terminalStore.renameSession(renamingId.value, renameValue.value.trim());
  }
  renamingId.value = null;
}

// ── Search ────────────────────────────────────────────────────────────────────

function toggleSearch() {
  searchOpen.value = !searchOpen.value;
  if (!searchOpen.value) {
    clearSearch();
  } else {
    nextTick(() => (document.querySelector(".search-input") as HTMLInputElement)?.focus());
  }
}

function doSearch(direction: "next" | "prev") {
  const active = terminalStore.activeSessionId;
  if (!active) return;
  const inst = xtermMap.get(active);
  if (!inst || !searchQuery.value) return;
  if (direction === "next") {
    inst.searchAddon.findNext(searchQuery.value, { caseSensitive: false, regex: false, wholeWord: false });
  } else {
    inst.searchAddon.findPrevious(searchQuery.value, { caseSensitive: false, regex: false, wholeWord: false });
  }
}

function clearSearch() {
  searchQuery.value = "";
  const active = terminalStore.activeSessionId;
  if (active) xtermMap.get(active)?.searchAddon.clearDecorations();
}

// ── External terminal launcher (kept for power users) ────────────────────────

const showExternal = ref(false);
const externalTerminals = ref<{ id: string; name: string }[]>([]);
const openingExternal = ref<string | null>(null);

async function launchExternal(termId: string) {
  if (!repo.value) return;
  openingExternal.value = termId;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_in_terminal", { path: repoPath.value, terminalId: termId });
    showExternal.value = false;
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    openingExternal.value = null;
  }
}

// ── PTY event subscriptions ───────────────────────────────────────────────────

async function subscribePtyEvents() {
  unlisten.push(
    await listen<{ sessionId: string; data: string }>("pty-data", (event) => {
      const { sessionId: ptyId, data } = event.payload;
      const session = terminalStore.sessions.find((s) => s.ptyId === ptyId);
      if (!session) return;
      const inst = xtermMap.get(session.id);
      if (inst) {
        inst.term.write(data);
      }
    }),
  );

  unlisten.push(
    await listen<{ sessionId: string; code: number }>("pty-exit", (event) => {
      const { sessionId: ptyId, code } = event.payload;
      terminalStore.markSessionExited(ptyId, code);

      const session = terminalStore.sessions.find((s) => s.ptyId === ptyId);
      if (!session) return;
      const inst = xtermMap.get(session.id);
      if (inst) {
        if (code === 0) {
          inst.term.writeln("\r\n\x1b[2m[shell exited]\x1b[0m");
        } else {
          inst.term.writeln(`\r\n\x1b[31m[shell exited with code ${code}]\x1b[0m`);
        }
      }
    }),
  );
}

// ── Watch active session to show correct xterm pane ──────────────────────────

watch(
  () => terminalStore.activeSessionId,
  (id) => {
    if (id) showXterm(id);
  },
);

// ── Watch for new sessions to mount xterm (e.g. after store createSession) ───

watch(
  () => terminalStore.sessions.map((s) => s.id),
  async (ids) => {
    await nextTick();
    for (const session of terminalStore.sessions) {
      if (!xtermMap.has(session.id)) {
        mountXterm(session);
      }
    }
    // Clean up removed sessions
    for (const id of xtermMap.keys()) {
      if (!ids.includes(id)) destroyXterm(id);
    }
  },
);

// Watch for session status changes (connecting → active) to focus terminal
watch(
  () => terminalStore.sessions.map((s) => `${s.id}:${s.status}:${s.errorMessage}`),
  () => {
    for (const session of terminalStore.sessions) {
      if (session.status === "error") {
        const inst = xtermMap.get(session.id);
        if (inst && session.errorMessage) {
          // Only write error if terminal is empty (just connected)
          writeError(inst.term, session.errorMessage);
        }
      }
    }
  },
);

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
  await subscribePtyEvents();

  // Load available system terminals for external launcher
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    externalTerminals.value = await invoke<{ id: string; name: string }[]>("list_terminals");
  } catch {
    // Not in Tauri context
  }

  // Load shells in background
  terminalStore.loadShells();

  // If no sessions exist yet, open a new one
  if (terminalStore.sessions.length === 0) {
    await newTab();
  } else {
    // Re-mount existing sessions (e.g. navigating back)
    await nextTick();
    for (const session of terminalStore.sessions) {
      if (!xtermMap.has(session.id)) mountXterm(session);
    }
    if (terminalStore.activeSessionId) {
      showXterm(terminalStore.activeSessionId);
    }
  }
});

onUnmounted(() => {
  for (const fn of unlisten) fn();
  // Dispose xterm instances but keep PTY sessions alive so the user can return
  for (const [id, inst] of xtermMap) {
    inst.resizeObserver.disconnect();
    inst.term.dispose();
    inst.el.remove();
    xtermMap.delete(id);
  }
});
</script>

<template>
  <div class="terminal-view">

    <!-- ── Tab bar ─────────────────────────────────────────────────────────── -->
    <div class="tabbar">
      <div class="tab-list">
        <div
          v-for="session in terminalStore.sessions"
          :key="session.id"
          class="tab"
          :class="{
            'tab--active': session.id === terminalStore.activeSessionId,
            'tab--error': session.status === 'error',
            'tab--exited': session.status === 'exited',
          }"
          @click="selectTab(session.id)"
          @dblclick.stop="startRename(session.id, session.name)"
        >
          <!-- Status dot -->
          <span class="tab-dot" :class="`tab-dot--${session.status}`" />

          <!-- Name (or inline rename input) -->
          <input
            v-if="renamingId === session.id"
            class="rename-input"
            v-model="renameValue"
            @blur="commitRename"
            @keydown.enter.prevent="commitRename"
            @keydown.escape.prevent="renamingId = null"
            @click.stop
          />
          <span v-else class="tab-name" :title="session.cwd">{{ session.name }}</span>

          <!-- Branch badge -->
          <span v-if="session.repoBranch && session.id === terminalStore.activeSessionId" class="tab-branch">
            {{ session.repoBranch }}
          </span>

          <!-- Restart button (shown for exited/error sessions) -->
          <button
            v-if="session.status === 'exited' || session.status === 'error'"
            class="tab-restart"
            @click.stop="restartSession(session.id)"
            title="Restart terminal"
          >
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M8.5 2A4 4 0 1 0 9 5.5" />
              <polyline points="9,1 9,3 7,3" />
            </svg>
          </button>

          <!-- Close button -->
          <button
            class="tab-close"
            @click.stop="closeTab(session.id)"
            title="Close terminal"
          >
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round">
              <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </div>
      </div>

      <!-- New tab button -->
      <button class="new-tab-btn" @click="newTab" title="New terminal">
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round">
          <line x1="6" y1="1" x2="6" y2="11" /><line x1="1" y1="6" x2="11" y2="6" />
        </svg>
      </button>

      <!-- Right-side toolbar -->
      <div class="tabbar-right">
        <!-- Search -->
        <button class="toolbar-btn" :class="{ 'toolbar-btn--active': searchOpen }"
                @click="toggleSearch" title="Search (Ctrl+F)">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="6.5" cy="6.5" r="4" />
            <line x1="10" y1="10" x2="14" y2="14" />
          </svg>
        </button>

        <!-- External terminal launcher -->
        <div class="launcher-wrap" v-if="externalTerminals.length > 0">
          <button class="toolbar-btn" @click="showExternal = !showExternal" title="Open in external terminal">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
                 stroke-linecap="round" stroke-linejoin="round">
              <rect x="1" y="2" width="14" height="12" rx="2"/>
              <path d="M4 6l3 2.5L4 11M8 11h4"/>
            </svg>
          </button>
          <div class="launcher-dropdown" v-if="showExternal">
            <button
              v-for="t in externalTerminals"
              :key="t.id"
              class="launcher-item"
              :disabled="openingExternal !== null"
              @click="launchExternal(t.id)"
            >
              {{ t.name }}
              <span v-if="openingExternal === t.id">…</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Search bar ─────────────────────────────────────────────────────── -->
    <div class="search-bar" v-if="searchOpen">
      <input
        class="search-input"
        v-model="searchQuery"
        placeholder="Search…"
        @input="doSearch('next')"
        @keydown.enter.prevent="doSearch('next')"
        @keydown.shift.enter.prevent="doSearch('prev')"
        @keydown.escape.prevent="toggleSearch"
      />
      <button class="search-btn" @click="doSearch('prev')" title="Previous">↑</button>
      <button class="search-btn" @click="doSearch('next')" title="Next">↓</button>
      <button class="search-btn" @click="toggleSearch" title="Close">✕</button>
    </div>

    <!-- ── Terminal container ─────────────────────────────────────────────── -->
    <div ref="containerRef" class="terminal-container" />

    <!-- ── Empty state ───────────────────────────────────────────────────── -->
    <div v-if="terminalStore.sessions.length === 0" class="empty-state">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round" class="empty-icon">
        <rect x="2" y="4" width="28" height="24" rx="3"/>
        <path d="M8 12l5 4-5 4M16 20h8"/>
      </svg>
      <p>No terminal sessions</p>
      <button class="btn-new" @click="newTab">New Terminal</button>
    </div>

    <!-- ── Kill confirmation dialog ──────────────────────────────────────── -->
    <div v-if="killConfirmId" class="dialog-backdrop" @click.self="cancelKill">
      <div class="dialog">
        <p class="dialog-msg">Kill this terminal session?</p>
        <div class="dialog-actions">
          <button class="btn-cancel" @click="cancelKill">Cancel</button>
          <button class="btn-danger" @click="confirmKill">Kill Terminal</button>
        </div>
      </div>
    </div>

  </div>
</template>

<style>
/* xterm.js global — must not be scoped */
@import "@xterm/xterm/css/xterm.css";

.xterm-pane { height: 100%; width: 100%; }
.xterm-pane .xterm { height: 100%; padding: 8px 12px; }
.xterm-pane .xterm-viewport { background-color: transparent !important; }
</style>

<style scoped>
.terminal-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--surface-0);
  position: relative;
}

/* ── Tab bar ── */
.tabbar {
  display: flex;
  align-items: stretch;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  height: 34px;
  flex-shrink: 0;
  overflow: hidden;
}

.tab-list {
  display: flex;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  flex: 1;
  min-width: 0;
  scrollbar-width: none;
}
.tab-list::-webkit-scrollbar { display: none; }

.tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 10px;
  min-width: 100px;
  max-width: 200px;
  cursor: pointer;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  transition: background 80ms, color 80ms;
  position: relative;
  flex-shrink: 0;
}

.tab:hover { background: var(--surface-2); color: var(--text); }
.tab--active { background: var(--surface-0); color: var(--text); }
.tab--error { color: var(--deleted); }
.tab--exited { opacity: 0.6; }

.tab-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tab-dot--connecting { background: var(--modified); }
.tab-dot--active     { background: var(--added); }
.tab-dot--exited     { background: var(--text-muted); }
.tab-dot--error      { background: var(--deleted); }

.tab-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 11px;
}

.tab-branch {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-subtle);
  border-radius: 3px;
  padding: 1px 4px;
  flex-shrink: 0;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rename-input {
  flex: 1;
  min-width: 0;
  background: var(--surface-3);
  border: 1px solid var(--accent);
  border-radius: 3px;
  color: var(--text);
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 1px 4px;
  outline: none;
}

.tab-close {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 80ms, background 80ms;
  padding: 0;
}
.tab:hover .tab-close,
.tab--active .tab-close { opacity: 1; }
.tab-close:hover { background: var(--surface-3); color: var(--text); }
.tab-close svg { width: 8px; height: 8px; }

.tab-restart {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 3px;
  color: var(--accent);
  cursor: pointer;
  transition: background 80ms;
  padding: 0;
}
.tab-restart:hover { background: var(--accent-subtle); }
.tab-restart svg { width: 9px; height: 9px; }

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 80ms, color 80ms;
  flex-shrink: 0;
}
.new-tab-btn:hover { background: var(--surface-2); color: var(--text); }
.new-tab-btn svg { width: 12px; height: 12px; }

.tabbar-right {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 0 4px;
  flex-shrink: 0;
  margin-left: auto;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 80ms, color 80ms;
}
.toolbar-btn:hover { background: var(--surface-2); color: var(--text); }
.toolbar-btn--active { color: var(--accent); background: var(--accent-subtle); }
.toolbar-btn svg { width: 13px; height: 13px; }

/* ── Search bar ── */
.search-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 3px 8px;
  outline: none;
}
.search-input:focus { border-color: var(--accent); }

.search-btn {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 8px;
  transition: background 80ms;
}
.search-btn:hover { background: var(--surface-3); color: var(--text); }

/* ── Terminal container ── */
.terminal-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-0);
  position: relative;
}

/* ── Launcher dropdown ── */
.launcher-wrap { position: relative; }

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
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
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
.launcher-item:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
.launcher-item:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Empty state ── */
.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.empty-icon { width: 40px; height: 40px; opacity: 0.4; }

.btn-new {
  padding: 6px 16px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 12px;
  cursor: pointer;
  transition: opacity 80ms;
}
.btn-new:hover { opacity: 0.85; }

/* ── Kill confirmation dialog ── */
.dialog-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.dialog {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 20px 24px;
  min-width: 260px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}

.dialog-msg {
  font-size: 13px;
  color: var(--text);
  margin-bottom: 16px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 5px 14px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}
.btn-cancel:hover { color: var(--text); }

.btn-danger {
  padding: 5px 14px;
  background: var(--deleted);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.9;
}
.btn-danger:hover { opacity: 1; }
</style>
