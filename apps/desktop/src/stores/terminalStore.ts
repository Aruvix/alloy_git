import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DetectedShell {
  id: string;
  name: string;
  executablePath: string;
  args: string[];
  platform: string;
  isDefault: boolean;
  isAvailable: boolean;
  source: string;
}

export interface TerminalSettings {
  defaultShellId: string;
  customShellPath: string;
  defaultWorkingDirectoryMode: "repo" | "workspace" | "last-used" | "custom";
  customWorkingDirectory: string;
  startupCommand: string;
  env: Record<string, string>;
  fontSize: number;
  fontFamily: string;
  cursorStyle: "block" | "underline" | "bar";
  scrollbackLimit: number;
  confirmBeforeKill: boolean;
}

export type SessionStatus = "connecting" | "active" | "exited" | "error";

export interface TerminalSession {
  id: string;
  ptyId: string | null;
  name: string;
  repoPath: string | null;
  repoBranch: string | null;
  cwd: string;
  shellName: string;
  status: SessionStatus;
  errorMessage: string | null;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: TerminalSettings = {
  defaultShellId: "default",
  customShellPath: "",
  defaultWorkingDirectoryMode: "repo",
  customWorkingDirectory: "",
  startupCommand: "",
  env: {},
  fontSize: 13,
  fontFamily: "JetBrains Mono, Fira Code, Cascadia Code, ui-monospace, Menlo, monospace",
  cursorStyle: "block",
  scrollbackLimit: 5000,
  confirmBeforeKill: false,
};

const SETTINGS_KEY = "terminalSettings";

function loadSettings(): TerminalSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: TerminalSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTerminalStore = defineStore("terminal", () => {
  const sessions = ref<TerminalSession[]>([]);
  const activeSessionId = ref<string | null>(null);
  const availableShells = ref<DetectedShell[]>([]);
  const shellsLoaded = ref(false);
  const settings = ref<TerminalSettings>(loadSettings());

  let _sessionCounter = 0;

  const activeSession = computed(() =>
    sessions.value.find((s) => s.id === activeSessionId.value) ?? null,
  );

  // ── Shell detection ─────────────────────────────────────────────────────────

  async function loadShells() {
    try {
      availableShells.value = await invoke<DetectedShell[]>("detect_shells");
      shellsLoaded.value = true;
    } catch {
      availableShells.value = [];
      shellsLoaded.value = true;
    }
  }

  function resolveShell(): { path: string; args: string[] } {
    const { defaultShellId, customShellPath } = settings.value;

    if (defaultShellId === "custom" && customShellPath) {
      return { path: customShellPath, args: [] };
    }

    const shell = availableShells.value.find(
      (s) => s.id === defaultShellId || (defaultShellId === "default" && s.isDefault),
    );
    if (shell) return { path: shell.executablePath, args: shell.args };

    // Last-resort platform fallback
    if (navigator.userAgent.includes("Win")) return { path: "cmd.exe", args: [] };
    const envShell = availableShells.value[0];
    if (envShell) return { path: envShell.executablePath, args: envShell.args };
    return { path: "/bin/sh", args: [] };
  }

  // ── Session management ──────────────────────────────────────────────────────

  async function createSession(repoPath: string | null = null, repoBranch: string | null = null): Promise<string> {
    if (!shellsLoaded.value) await loadShells();

    const sessionId = `session-${++_sessionCounter}`;
    const { path: shellPath, args: shellArgs } = resolveShell();
    const shellLabel = shellPath.split(/[/\\]/).pop() ?? "shell";

    const cwd = resolveCwd(repoPath);

    const session: TerminalSession = {
      id: sessionId,
      ptyId: null,
      name: `${shellLabel} ${_sessionCounter}`,
      repoPath,
      repoBranch,
      cwd,
      shellName: shellLabel,
      status: "connecting",
      errorMessage: null,
    };

    sessions.value.push(session);
    activeSessionId.value = sessionId;

    try {
      const ptyId = await invoke<string>("pty_create", {
        payload: {
          shell: shellPath,
          args: shellArgs,
          cwd,
          env: settings.value.env ?? {},
          cols: 80,
          rows: 24,
        },
      });
      updateSession(sessionId, { ptyId, status: "active" });
    } catch (err) {
      updateSession(sessionId, {
        status: "error",
        errorMessage: String(err),
      });
    }

    return sessionId;
  }

  async function killSession(sessionId: string, force = false) {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session) return;

    if (settings.value.confirmBeforeKill && !force && session.status === "active") {
      // Caller must pass force=true after confirming
      return;
    }

    if (session.ptyId) {
      try {
        await invoke("pty_kill", { sessionId: session.ptyId });
      } catch {
        // Ignore — session may have already exited
      }
    }

    sessions.value = sessions.value.filter((s) => s.id !== sessionId);

    if (activeSessionId.value === sessionId) {
      activeSessionId.value = sessions.value[sessions.value.length - 1]?.id ?? null;
    }
  }

  function markSessionExited(ptyId: string, code: number) {
    const session = sessions.value.find((s) => s.ptyId === ptyId);
    if (session) {
      updateSession(session.id, {
        status: code === 0 ? "exited" : "error",
        errorMessage: code !== 0 ? `Shell exited with code ${code}` : null,
      });
    }
  }

  function renameSession(sessionId: string, name: string) {
    updateSession(sessionId, { name });
  }

  function setActive(sessionId: string) {
    if (sessions.value.some((s) => s.id === sessionId)) {
      activeSessionId.value = sessionId;
    }
  }

  // ── PTY I/O wrappers ────────────────────────────────────────────────────────

  async function writeToSession(sessionId: string, data: string) {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session?.ptyId || session.status !== "active") return;
    try {
      await invoke("pty_write", { sessionId: session.ptyId, data });
    } catch {
      // ignore transient write errors
    }
  }

  async function resizeSession(sessionId: string, cols: number, rows: number) {
    const session = sessions.value.find((s) => s.id === sessionId);
    if (!session?.ptyId || session.status !== "active") return;
    try {
      await invoke("pty_resize", { sessionId: session.ptyId, cols, rows });
    } catch {
      // ignore
    }
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  function updateSettings(partial: Partial<TerminalSettings>) {
    settings.value = { ...settings.value, ...partial };
    saveSettings(settings.value);
  }

  function resetSettings() {
    settings.value = { ...DEFAULT_SETTINGS };
    saveSettings(settings.value);
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  function updateSession(id: string, patch: Partial<TerminalSession>) {
    const idx = sessions.value.findIndex((s) => s.id === id);
    if (idx !== -1) {
      sessions.value[idx] = { ...sessions.value[idx], ...patch };
    }
  }

  function resolveCwd(repoPath: string | null): string {
    const { defaultWorkingDirectoryMode, customWorkingDirectory } = settings.value;
    if (defaultWorkingDirectoryMode === "repo" && repoPath) return repoPath;
    if (defaultWorkingDirectoryMode === "custom" && customWorkingDirectory) return customWorkingDirectory;
    if (repoPath) return repoPath;
    return "";
  }

  return {
    sessions,
    activeSessionId,
    activeSession,
    availableShells,
    shellsLoaded,
    settings,
    loadShells,
    resolveShell,
    createSession,
    killSession,
    markSessionExited,
    renameSession,
    setActive,
    writeToSession,
    resizeSession,
    updateSettings,
    resetSettings,
  };
});
