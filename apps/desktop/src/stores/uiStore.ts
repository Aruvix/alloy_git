import { defineStore } from "pinia";
import { ref, watchEffect } from "vue";

export type ActivePanel = "changes" | "history" | "branches" | "stashes" | "remotes" | "conflicts" | "terminal";
export type ThemeMode = "light" | "dark" | "system";
export type ThemeName =
  | "alloy-light"
  | "alloy-dark"
  | "graphite"
  | "midnight-blue"
  | "warm-paper";

export type AddRepoFlow = "clone" | "import" | "create" | null;

export type RepositoryScope =
  | { type: "all" }
  | { type: "account"; id: string }
  | { type: "local" };

const ENTERPRISE_THEME_MODES: Partial<Record<ThemeName, "light" | "dark">> = {
  "alloy-light": "light",
  "warm-paper": "light",
  "alloy-dark": "dark",
  "graphite": "dark",
  "midnight-blue": "dark",
};

const VALID_MODES: ThemeMode[] = ["light", "dark", "system"];
const VALID_THEMES: ThemeName[] = [
  "alloy-light",
  "alloy-dark",
  "graphite",
  "midnight-blue",
  "warm-paper",
];

function parseMode(v: string | null): ThemeMode {
  return VALID_MODES.includes(v as ThemeMode) ? (v as ThemeMode) : "system";
}
function parseTheme(v: string | null): ThemeName {
  return VALID_THEMES.includes(v as ThemeName) ? (v as ThemeName) : "alloy-dark";
}

export const useUiStore = defineStore("ui", () => {
  const sidebarCollapsed = ref(false);
  const diffPanelWidth = ref(60);
  const notification = ref<{ type: "info" | "success" | "error" | "warning"; message: string; id: number } | null>(null);
  const repositoryScope = ref<RepositoryScope>({ type: "all" });
  const addRepoModalOpen = ref(false);
  const addRepoModalFlow = ref<AddRepoFlow>(null);
  let notifTimer: ReturnType<typeof setTimeout> | null = null;
  let notifSeq = 0;

  const themeMode = ref<ThemeMode>(parseMode(localStorage.getItem("themeMode")));
  const themeName = ref<ThemeName>(parseTheme(localStorage.getItem("themeName")));

  const sidebarWidth = ref(Number(localStorage.getItem("sidebarWidth")) || 280);
  const filePanelWidth = ref(Number(localStorage.getItem("filePanelWidth")) || 280);
  const commitListWidth = ref(Number(localStorage.getItem("commitListWidth")) || 300);
  const historyFileListWidth = ref(Number(localStorage.getItem("historyFileListWidth")) || 220);

  function applyTheme() {
    const html = document.documentElement;
    html.dataset.theme = themeName.value;
    const forcedMode = ENTERPRISE_THEME_MODES[themeName.value];
    if (forcedMode) {
      html.dataset.mode = forcedMode;
    } else if (themeMode.value === "system") {
      delete html.dataset.mode;
    } else {
      html.dataset.mode = themeMode.value;
    }
    localStorage.setItem("themeMode", themeMode.value);
    localStorage.setItem("themeName", themeName.value);
  }

  watchEffect(applyTheme);

  watchEffect(() => {
    localStorage.setItem("sidebarWidth", String(sidebarWidth.value));
    localStorage.setItem("filePanelWidth", String(filePanelWidth.value));
    localStorage.setItem("commitListWidth", String(commitListWidth.value));
    localStorage.setItem("historyFileListWidth", String(historyFileListWidth.value));
  });

  function notify(type: "info" | "success" | "error" | "warning", message: string, durationMs?: number) {
    const id = ++notifSeq;
    notification.value = { type, message, id };
    if (notifTimer) clearTimeout(notifTimer);
    // Errors linger longer so users can read them; success/info dismiss quickly.
    const ms = durationMs ?? (type === "error" ? 7000 : type === "warning" ? 5000 : 4000);
    notifTimer = setTimeout(() => {
      if (notification.value?.id === id) notification.value = null;
    }, ms);
  }

  function clearNotification() {
    notification.value = null;
    if (notifTimer) clearTimeout(notifTimer);
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function setRepositoryScope(scope: RepositoryScope) {
    repositoryScope.value = scope;
  }

  function openAddRepoModal(flow: AddRepoFlow = null) {
    addRepoModalFlow.value = flow;
    addRepoModalOpen.value = true;
  }

  function closeAddRepoModal() {
    addRepoModalOpen.value = false;
    addRepoModalFlow.value = null;
  }

  return {
    sidebarCollapsed,
    diffPanelWidth,
    notification,
    repositoryScope,
    addRepoModalOpen,
    addRepoModalFlow,
    themeMode,
    themeName,
    sidebarWidth,
    filePanelWidth,
    commitListWidth,
    historyFileListWidth,
    applyTheme,
    notify,
    clearNotification,
    toggleSidebar,
    setRepositoryScope,
    openAddRepoModal,
    closeAddRepoModal,
  };
});
