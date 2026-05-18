<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { providerLabel } from "@alloy/provider-core";
import { useUiStore } from "../../stores/uiStore.js";
import { useAccountStore } from "../../stores/accountStore.js";
import Button from "../../components/ui/Button.vue";

const uiStore = useUiStore();
const accountStore = useAccountStore();

const config = ref({
  defaultAccountId: null as string | null,
  defaultRepositoryId: null as string | null,
  authorName: "",
  authorEmail: "",
  defaultBranch: "main",
  defaultCloneDirectory: "",
  autoPullBeforePush: false,
  secretScanMode: "warn" as "warn" | "block" | "off",
});
const saving = ref(false);
const defaultAccountRepositories = computed(() => accountStore.repositoriesForAccount(config.value.defaultAccountId));

onMounted(async () => {
  try {
    await accountStore.load();
    config.value = { ...config.value, ...accountStore.globalConfig };
  } catch {
    // first run — no row yet
  }
});

async function save() {
  saving.value = true;
  try {
    await accountStore.saveGlobalConfig(config.value);
    uiStore.notify("success", "Git config saved");
  } catch (e) {
    uiStore.notify("error", String(e));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="git-settings">
    <h2>Git Configuration</h2>

    <div class="form-section">
      <h3>Author Identity</h3>
      <div class="form-row">
        <label>Name</label>
        <input v-model="config.authorName" class="form-input" placeholder="Your Name" />
      </div>
      <div class="form-row">
        <label>Email</label>
        <input v-model="config.authorEmail" class="form-input" placeholder="you@example.com" />
      </div>
    </div>

    <div class="form-section">
      <h3>Defaults</h3>
      <div class="form-row">
        <label>Git Account</label>
        <select v-model="config.defaultAccountId" class="form-select" @change="config.defaultRepositoryId = null">
          <option :value="null">No default account</option>
          <option v-for="account in accountStore.accounts" :key="account.id" :value="account.id">
            {{ account.name }} · {{ providerLabel(account.provider) }}
          </option>
        </select>
      </div>
      <div class="form-row">
        <label>Cloud Repo</label>
        <select v-model="config.defaultRepositoryId" class="form-select" :disabled="!config.defaultAccountId">
          <option :value="null">No default repository</option>
          <option v-for="repo in defaultAccountRepositories" :key="`${repo.gitAccountId}:${repo.id}`" :value="repo.id">
            {{ repo.repoFullName }}
          </option>
        </select>
      </div>
      <div class="form-row">
        <label>Default Branch</label>
        <input v-model="config.defaultBranch" class="form-input" placeholder="main" />
      </div>
      <div class="form-row">
        <label>Clone Directory</label>
        <input v-model="config.defaultCloneDirectory" class="form-input" placeholder="~/Projects" />
      </div>
    </div>

    <div class="form-section">
      <h3>Security</h3>
      <div class="form-row">
        <label>Secret Scan</label>
        <select v-model="config.secretScanMode" class="form-select">
          <option value="warn">Warn on commit</option>
          <option value="block">Block commit</option>
          <option value="off">Disabled</option>
        </select>
      </div>
      <div class="form-row">
        <label>Auto Pull</label>
        <label class="toggle">
          <input type="checkbox" v-model="config.autoPullBeforePush" />
          Pull before push
        </label>
      </div>
    </div>

    <Button variant="primary" :loading="saving" @click="save">Save</Button>
  </div>
</template>

<style scoped>
.git-settings { max-width: 520px; }
h2 { font-size: 16px; font-weight: 600; color: var(--text); margin: 0 0 24px; }
h3 { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px; }
.form-section { margin-bottom: 24px; }
.form-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.form-row label { font-size: 12px; color: var(--text-muted); width: 120px; flex-shrink: 0; }
.form-input, .form-select {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  padding: 5px 8px;
  outline: none;
}
.form-input:focus, .form-select:focus { border-color: var(--accent); }
.toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text); cursor: pointer; }
</style>
