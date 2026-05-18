import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { useAccountStore } from "./accountStore.js";
import { useRepoStore } from "./repoStore.js";

export interface AppBootstrapState {
  isBooting: boolean;
  settingsLoaded: boolean;
  accountsLoaded: boolean;
  workspacesLoaded: boolean;
  repositoriesLoaded: boolean;
  mappingsHydrated: boolean;
  appReady: boolean;
  warnings: string[];
}

export const useAppBootstrapStore = defineStore("appBootstrap", () => {
  const state = ref<AppBootstrapState>({
    isBooting: true,
    settingsLoaded: false,
    accountsLoaded: false,
    workspacesLoaded: false,
    repositoriesLoaded: false,
    mappingsHydrated: false,
    appReady: true,
    warnings: [],
  });

  const currentStep = computed(() => {
    if (!state.value.settingsLoaded) return "Loading settings...";
    if (!state.value.accountsLoaded) return "Loading accounts...";
    if (!state.value.repositoriesLoaded) return "Loading repositories...";
    if (!state.value.mappingsHydrated) return "Resolving account mappings...";
    return "Preparing workspace...";
  });

  async function bootstrap() {
    const accountStore = useAccountStore();
    const repoStore = useRepoStore();
    state.value = {
      isBooting: true,
      settingsLoaded: false,
      accountsLoaded: false,
      workspacesLoaded: false,
      repositoriesLoaded: false,
      mappingsHydrated: false,
      appReady: true,
      warnings: [],
    };

    try {
      await accountStore.loadGlobalConfig();
      state.value.settingsLoaded = true;
    } catch (error) {
      recordWarning("Settings could not be loaded", error);
    }

    try {
      await accountStore.load();
      state.value.accountsLoaded = true;
    } catch (error) {
      recordWarning("Git accounts could not be loaded", error);
    }

    try {
      await repoStore.load();
      state.value.workspacesLoaded = true;
      state.value.repositoriesLoaded = true;
    } catch (error) {
      recordWarning("Repositories could not be loaded", error);
    }

    if (repoStore.loaded) {
      try {
        await repoStore.hydrateRepositoryMappings(accountStore.accounts, accountStore.repositories);
        state.value.mappingsHydrated = true;
        if (Object.keys(repoStore.mappingErrors).length > 0) {
          recordWarning("Some repository account mappings could not be refreshed", Object.values(repoStore.mappingErrors).join("; "));
        }
      } catch (error) {
        recordWarning("Repository account mappings could not be refreshed", error);
      }
    }

    try {
      await refreshVisibleRepositoryStatuses();
    } catch (error) {
      recordWarning("Repository status could not be refreshed", error);
    }

    state.value.isBooting = false;
  }

  async function waitUntilReady() {
    while (state.value.isBooting) {
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
    }
  }

  async function refreshVisibleRepositoryStatuses() {
    // Status polling is route-scoped today. This hook keeps the bootstrap order explicit
    // without starting background Git operations for every saved repository.
    await Promise.resolve();
  }

  function recordWarning(message: string, error: unknown) {
    state.value.warnings.push(`${message}: ${String(error)}`);
  }

  return {
    state,
    currentStep,
    bootstrap,
    waitUntilReady,
    refreshVisibleRepositoryStatuses,
  };
});
