<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAccountStore } from "../../stores/accountStore.js";
import { useUiStore } from "../../stores/uiStore.js";
import { getProviderCapabilities, providerLabel, providerAuthHelp, isProviderValidationSupported } from "@alloy/provider-core";
import Button from "../../components/ui/Button.vue";
import type { GitProvider, GitCredentialType } from "@alloy/git-core";

const accountStore = useAccountStore();
const uiStore = useUiStore();

const showForm = ref(false);
const validating = ref(false);
const form = ref<{
  name: string;
  provider: GitProvider;
  authType: GitCredentialType;
  token: string;
  sshKeyPath: string;
  remoteBaseUrl: string;
}>({
  name: "",
  provider: "github",
  authType: "pat",
  token: "",
  sshKeyPath: "",
  remoteBaseUrl: "",
});

const providers: GitProvider[] = [
  "github",
  "github-enterprise",
  "gitlab",
  "bitbucket",
  "bitbucket-server",
  "azure-devops",
  "azure-devops-server",
  "gitea",
  "forgejo",
  "custom",
];
const providerCapabilities = computed(() => getProviderCapabilities(form.value.provider));
const showsServerUrl = computed(() => providerCapabilities.value.serverUrlRequired || providerCapabilities.value.supportsSelfHosted);
const availableAuthTypes = computed(() => getProviderCapabilities(form.value.provider).authTypes);

watch(() => form.value.provider, () => {
  form.value.remoteBaseUrl = "";
  if (!availableAuthTypes.value.includes(form.value.authType)) form.value.authType = availableAuthTypes.value[0] ?? "pat";
});

function resetForm() {
  form.value = { name: "", provider: "github", authType: "pat", token: "", sshKeyPath: "", remoteBaseUrl: "" };
  showForm.value = false;
}

const repositoryCountByAccount = computed(() => {
  const counts = new Map<string, number>();
  for (const repo of accountStore.repositories) {
    if (!repo.gitAccountId) continue;
    counts.set(repo.gitAccountId, (counts.get(repo.gitAccountId) ?? 0) + 1);
  }
  return counts;
});

async function addAccount() {
  if (!form.value.name.trim()) return;
  try {
    const account = await accountStore.addAccount({
      name: form.value.name.trim(),
      provider: form.value.provider,
      authType: form.value.authType,
      token: form.value.token.trim() || undefined,
      sshKeyPath: form.value.sshKeyPath.trim() || undefined,
      remoteBaseUrl: form.value.remoteBaseUrl.trim() || undefined,
    });
    if (isProviderValidationSupported(form.value.provider, form.value.remoteBaseUrl)) {
      validating.value = true;
      await accountStore.validateAccount(account.id);
      validating.value = false;
    }
    uiStore.notify("success", `Account ${form.value.name} added`);
    resetForm();
  } catch (e) {
    validating.value = false;
    uiStore.notify("error", String(e));
  }
}

async function validate(id: string) {
  try {
    await accountStore.validateAccount(id);
    const acc = accountStore.accounts.find((a) => a.id === id);
    uiStore.notify(acc?.status === "connected" ? "success" : "error", acc?.validationMessage ?? "Validated");
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function sync(id: string) {
  try {
    const count = await accountStore.syncRepositories(id);
    uiStore.notify("success", `${count} repositories synced`);
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function setDefault(id: string) {
  try {
    await accountStore.setDefaultAccount(id);
    uiStore.notify("success", "Default Git account updated");
  } catch (e) {
    uiStore.notify("error", String(e));
  }
}

async function remove(id: string) {
  await accountStore.removeAccount(id);
  uiStore.notify("info", "Account removed");
}
</script>

<template>
  <div class="accounts-settings">
    <div class="section-header">
      <h2>Git Accounts</h2>
      <Button variant="primary" size="sm" @click="showForm = !showForm">
        {{ showForm ? "Cancel" : "Add Account" }}
      </Button>
    </div>

    <div v-if="showForm" class="add-form">
      <div class="form-row">
        <label>Name</label>
        <input v-model="form.name" class="form-input" placeholder="My GitHub account" />
      </div>
      <div class="form-row">
        <label>Provider</label>
        <select v-model="form.provider" class="form-select">
          <option v-for="p in providers" :key="p" :value="p">{{ providerLabel(p) }}</option>
        </select>
      </div>
      <div v-if="showsServerUrl" class="form-row">
        <label>Server URL</label>
        <input
          v-model="form.remoteBaseUrl"
          class="form-input"
          :placeholder="providerCapabilities.serverUrlRequired ? providerCapabilities.defaultRemoteBaseUrl || 'https://your-server.com' : `${providerCapabilities.defaultRemoteBaseUrl} (default)`"
        />
      </div>
      <div class="form-row">
        <label>Auth Type</label>
        <select v-model="form.authType" class="form-select">
          <option v-if="availableAuthTypes.includes('pat')" value="pat">Personal Access Token</option>
          <option v-if="availableAuthTypes.includes('oauth')" value="oauth">OAuth Token</option>
          <option v-if="availableAuthTypes.includes('ssh')" value="ssh">SSH Key</option>
          <option v-if="availableAuthTypes.includes('system')" value="system">System Credentials</option>
        </select>
      </div>
      <div v-if="form.authType === 'pat' || form.authType === 'oauth'" class="form-row">
        <label>Token</label>
        <input v-model="form.token" class="form-input" type="password" placeholder="ghp_…" />
      </div>
      <div v-if="form.authType === 'ssh'" class="form-row">
        <label>SSH Key</label>
        <input v-model="form.sshKeyPath" class="form-input" placeholder="~/.ssh/id_ed25519" />
      </div>
      <p class="form-hint">{{ providerAuthHelp(form.provider) }}</p>
      <div class="form-actions">
        <Button variant="ghost" size="sm" @click="resetForm">Cancel</Button>
        <Button variant="primary" size="sm" :loading="validating" :disabled="!form.name.trim()" @click="addAccount">
          Add & Validate
        </Button>
      </div>
    </div>

    <div class="accounts-list">
      <div v-if="accountStore.accounts.length === 0" class="empty">No accounts added yet.</div>
      <div v-for="acc in accountStore.accounts" :key="acc.id" class="account-card">
        <div class="account-avatar" :class="acc.status">
          {{ (acc.username ?? acc.name)[0]?.toUpperCase() }}
        </div>
        <div class="account-info">
          <div class="account-name">{{ acc.name }}</div>
          <div class="account-meta">{{ providerLabel(acc.provider) }} · {{ acc.username ?? acc.authType }}</div>
          <div class="account-meta">{{ repositoryCountByAccount.get(acc.id) ?? acc.repositoryCount ?? 0 }} indexed repositories</div>
          <div class="account-status" :class="acc.status">
            {{ acc.status }}
            <span v-if="accountStore.globalConfig.defaultAccountId === acc.id" class="default-pill">Default</span>
          </div>
          <div v-if="acc.validationMessage" class="account-message">{{ acc.validationMessage }}</div>
        </div>
        <div class="account-actions">
          <Button
            v-if="accountStore.globalConfig.defaultAccountId !== acc.id"
            size="sm"
            variant="ghost"
            @click="setDefault(acc.id)"
          >
            Set default
          </Button>
          <Button size="sm" variant="ghost" :loading="accountStore.loading" @click="validate(acc.id)">Refresh</Button>
          <Button size="sm" variant="ghost" :loading="accountStore.loading" @click="sync(acc.id)">Sync repos</Button>
          <Button size="sm" variant="ghost" class="danger-btn" @click="remove(acc.id)">Remove</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.accounts-settings { max-width: 640px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
h2 { font-size: 16px; font-weight: 600; color: var(--text); margin: 0; }
.add-form {
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-row { display: flex; align-items: center; gap: 10px; }
.form-row label { font-size: 12px; color: var(--text-muted); width: 90px; flex-shrink: 0; }
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
.form-hint { font-size: 11px; color: var(--text-muted); margin: 0; }
.form-actions { display: flex; justify-content: flex-end; gap: 6px; }
.accounts-list { display: flex; flex-direction: column; gap: 10px; }
.empty { font-size: 13px; color: var(--text-muted); }
.account-card {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
}
.account-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface-3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  flex-shrink: 0;
}
.account-avatar.connected { background: rgba(63, 185, 80, 0.15); color: var(--added); }
.account-avatar.invalid { background: rgba(248, 81, 73, 0.15); color: var(--deleted); }
.account-info { flex: 1; min-width: 0; }
.account-name { font-size: 13px; font-weight: 500; color: var(--text); }
.account-meta { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.account-status { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 3px; }
.account-status.connected { color: var(--added); }
.account-status.invalid { color: var(--deleted); }
.account-status.expired { color: var(--modified); }
.account-status.untested { color: var(--text-subtle); }
.default-pill {
  margin-left: 6px;
  border-radius: 999px;
  background: var(--accent-subtle);
  color: var(--accent);
  padding: 1px 6px;
  letter-spacing: 0;
  text-transform: none;
}
.account-message { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.account-actions { display: flex; gap: 4px; }
.danger-btn { color: #f85149 !important; }
</style>
