<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalStore } from "../../stores/terminalStore.js";
import { useUiStore } from "../../stores/uiStore.js";

const terminalStore = useTerminalStore();
const uiStore = useUiStore();

const s = computed(() => terminalStore.settings);
const shells = computed(() => terminalStore.availableShells);

// Local draft for custom shell path + env editor
const customShellPath = ref(s.value.customShellPath);
const newEnvKey = ref("");
const newEnvVal = ref("");
const testingShell = ref(false);
const testResult = ref<{ ok: boolean; msg: string } | null>(null);
const saving = ref(false);

onMounted(() => {
  terminalStore.loadShells();
});

// ── Shell selection ───────────────────────────────────────────────────────────

function selectShell(shellId: string) {
  terminalStore.updateSettings({ defaultShellId: shellId });
  if (shellId !== "custom") {
    customShellPath.value = "";
    terminalStore.updateSettings({ customShellPath: "" });
  }
}

function applyCustomPath() {
  terminalStore.updateSettings({
    defaultShellId: "custom",
    customShellPath: customShellPath.value,
  });
}

async function testShell() {
  testingShell.value = true;
  testResult.value = null;
  const path =
    s.value.defaultShellId === "custom"
      ? s.value.customShellPath
      : shells.value.find(
          (sh) => sh.id === s.value.defaultShellId || (s.value.defaultShellId === "default" && sh.isDefault),
        )?.executablePath ?? "";

  if (!path) {
    testResult.value = { ok: false, msg: "No shell selected." };
    testingShell.value = false;
    return;
  }

  try {
    const ptyId = await invoke<string>("pty_create", {
      payload: {
        shell: path,
        args: [],
        cwd: "",
        env: {},
        cols: 80,
        rows: 24,
      },
    });
    // Kill immediately — we only wanted to verify the shell starts
    await invoke("pty_kill", { sessionId: ptyId }).catch(() => {});
    testResult.value = { ok: true, msg: `Shell launched successfully: ${path}` };
  } catch (e) {
    testResult.value = { ok: false, msg: String(e) };
  } finally {
    testingShell.value = false;
  }
}

// ── Env var editor ────────────────────────────────────────────────────────────

function addEnvVar() {
  if (!newEnvKey.value.trim()) return;
  const env = { ...(s.value.env ?? {}), [newEnvKey.value.trim()]: newEnvVal.value };
  terminalStore.updateSettings({ env });
  newEnvKey.value = "";
  newEnvVal.value = "";
}

function removeEnvVar(key: string) {
  const env = { ...(s.value.env ?? {}) };
  delete env[key];
  terminalStore.updateSettings({ env });
}

// ── Save + reset ──────────────────────────────────────────────────────────────

function save() {
  saving.value = true;
  // Settings are auto-saved via updateSettings, but give visual feedback
  setTimeout(() => {
    saving.value = false;
    uiStore.notify("success", "Terminal settings saved.");
  }, 250);
}

function reset() {
  terminalStore.resetSettings();
  customShellPath.value = "";
  uiStore.notify("info", "Terminal settings reset to defaults.");
}

const fontFamilyOptions = [
  "JetBrains Mono, Fira Code, Cascadia Code, ui-monospace, Menlo, monospace",
  "Fira Code, monospace",
  "Cascadia Code, monospace",
  "Menlo, Monaco, monospace",
  "Consolas, monospace",
  "SF Mono, monospace",
];

const cursorOptions: { value: "block" | "underline" | "bar"; label: string }[] = [
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
  { value: "bar", label: "Bar" },
];

const wdModes = [
  { value: "repo",       label: "Current repo",       desc: "Start in the opened repo directory" },
  { value: "workspace",  label: "Current workspace",  desc: "Start in the workspace root" },
  { value: "last-used",  label: "Last used directory", desc: "Remember the last working directory" },
  { value: "custom",     label: "Custom path",        desc: "Always start in a specific path" },
] as const;
</script>

<template>
  <div class="terminal-settings">
    <h2 class="page-title">Terminal</h2>
    <p class="page-desc">Configure the integrated terminal shell and behavior.</p>

    <!-- ── Default Shell ─────────────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header">Default Shell</div>
      <p class="section-desc">Select the shell to use when opening a new terminal.</p>

      <div class="shell-list" v-if="shells.length > 0">
        <label
          v-for="shell in shells"
          :key="shell.id"
          class="shell-option"
          :class="{ 'shell-option--active': s.defaultShellId === shell.id || (s.defaultShellId === 'default' && shell.isDefault) }"
        >
          <input
            type="radio"
            :value="shell.id"
            :checked="s.defaultShellId === shell.id || (s.defaultShellId === 'default' && shell.isDefault)"
            @change="selectShell(shell.id)"
            class="sr-only"
          />
          <span class="shell-name">{{ shell.name }}</span>
          <span class="shell-path">{{ shell.executablePath }}</span>
          <span class="shell-badge" v-if="shell.isDefault">system default</span>
        </label>
      </div>

      <div v-else-if="terminalStore.shellsLoaded" class="shells-empty">
        No shells detected automatically.
      </div>
      <div v-else class="shells-loading">Detecting shells…</div>

      <!-- Custom shell path -->
      <div class="field-group" style="margin-top: 12px;">
        <label class="field-label">Custom shell path</label>
        <div class="input-row">
          <input
            class="field-input mono"
            v-model="customShellPath"
            placeholder="/usr/local/bin/myshell"
            @blur="applyCustomPath"
            @keydown.enter.prevent="applyCustomPath"
          />
          <label class="shell-option shell-option--custom"
                 :class="{ 'shell-option--active': s.defaultShellId === 'custom' }"
                 @click="applyCustomPath">
            <input type="radio" value="custom"
                   :checked="s.defaultShellId === 'custom'"
                   @change="applyCustomPath" class="sr-only" />
            Use custom
          </label>
        </div>
      </div>

      <!-- Test shell -->
      <div class="test-row">
        <button class="btn-secondary" @click="testShell" :disabled="testingShell">
          {{ testingShell ? "Testing…" : "Test shell" }}
        </button>
        <span v-if="testResult" class="test-result" :class="testResult.ok ? 'ok' : 'fail'">
          {{ testResult.msg }}
        </span>
      </div>
    </section>

    <!-- ── Working Directory ─────────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header">Default Working Directory</div>
      <div class="radio-group">
        <label
          v-for="mode in wdModes"
          :key="mode.value"
          class="radio-option"
          :class="{ 'radio-option--active': s.defaultWorkingDirectoryMode === mode.value }"
        >
          <input
            type="radio"
            :value="mode.value"
            :checked="s.defaultWorkingDirectoryMode === mode.value"
            @change="terminalStore.updateSettings({ defaultWorkingDirectoryMode: mode.value })"
            class="sr-only"
          />
          <div class="radio-content">
            <span class="radio-label">{{ mode.label }}</span>
            <span class="radio-desc">{{ mode.desc }}</span>
          </div>
        </label>
      </div>

      <div v-if="s.defaultWorkingDirectoryMode === 'custom'" class="field-group" style="margin-top:8px;">
        <label class="field-label">Custom working directory</label>
        <input
          class="field-input mono"
          :value="s.customWorkingDirectory"
          @change="(e) => terminalStore.updateSettings({ customWorkingDirectory: (e.target as HTMLInputElement).value })"
          placeholder="/Users/you/projects"
        />
      </div>
    </section>

    <!-- ── Startup Command ───────────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header">Startup Command</div>
      <p class="section-desc">Runs once when a terminal opens. Commands are shown to the user.</p>
      <textarea
        class="field-textarea mono"
        :value="s.startupCommand"
        @change="(e) => terminalStore.updateSettings({ startupCommand: (e.target as HTMLTextAreaElement).value })"
        placeholder="e.g. source ~/.nvm/nvm.sh"
        rows="3"
      />
      <p class="field-hint">Tip: use semicolons to chain commands.</p>
    </section>

    <!-- ── Environment Variables ─────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header">Environment Variables</div>
      <p class="section-desc">Extra environment variables injected into each terminal session.</p>

      <div class="env-rows" v-if="Object.keys(s.env ?? {}).length > 0">
        <div class="env-row" v-for="(val, key) in s.env" :key="key">
          <span class="env-key mono">{{ key }}</span>
          <span class="env-eq">=</span>
          <span class="env-val mono">{{ val }}</span>
          <button class="env-remove" @click="removeEnvVar(String(key))" title="Remove">
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"
                 stroke-linecap="round">
              <line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </div>
      </div>

      <div class="env-add">
        <input class="field-input mono" v-model="newEnvKey" placeholder="KEY" style="flex:1;" />
        <span class="env-eq">=</span>
        <input class="field-input mono" v-model="newEnvVal" placeholder="value" style="flex:2;" @keydown.enter.prevent="addEnvVar" />
        <button class="btn-secondary" @click="addEnvVar">Add</button>
      </div>
    </section>

    <!-- ── Appearance ────────────────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header">Appearance</div>

      <div class="field-row">
        <div class="field-group">
          <label class="field-label">Font size</label>
          <input
            class="field-input"
            type="number"
            min="8"
            max="32"
            :value="s.fontSize"
            @change="(e) => terminalStore.updateSettings({ fontSize: Number((e.target as HTMLInputElement).value) })"
          />
        </div>
        <div class="field-group">
          <label class="field-label">Cursor style</label>
          <select
            class="field-select"
            :value="s.cursorStyle"
            @change="(e) => terminalStore.updateSettings({ cursorStyle: (e.target as HTMLSelectElement).value as 'block' | 'underline' | 'bar' })"
          >
            <option v-for="c in cursorOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </div>
      </div>

      <div class="field-group">
        <label class="field-label">Font family</label>
        <select
          class="field-select mono"
          :value="s.fontFamily"
          @change="(e) => terminalStore.updateSettings({ fontFamily: (e.target as HTMLSelectElement).value })"
        >
          <option v-for="f in fontFamilyOptions" :key="f" :value="f">{{ f }}</option>
        </select>
      </div>

      <div class="field-group">
        <label class="field-label">Scrollback limit</label>
        <input
          class="field-input"
          type="number"
          min="100"
          max="50000"
          :value="s.scrollbackLimit"
          @change="(e) => terminalStore.updateSettings({ scrollbackLimit: Number((e.target as HTMLInputElement).value) })"
        />
      </div>
    </section>

    <!-- ── Behavior ──────────────────────────────────────────────────────── -->
    <section class="section">
      <div class="section-header">Behavior</div>

      <label class="checkbox-option">
        <input
          type="checkbox"
          :checked="s.confirmBeforeKill"
          @change="(e) => terminalStore.updateSettings({ confirmBeforeKill: (e.target as HTMLInputElement).checked })"
        />
        <span>Confirm before closing an active terminal session</span>
      </label>
    </section>

    <!-- ── Actions ───────────────────────────────────────────────────────── -->
    <div class="actions-row">
      <button class="btn-secondary" @click="reset">Reset to defaults</button>
      <button class="btn-primary" @click="save" :disabled="saving">
        {{ saving ? "Saving…" : "Save settings" }}
      </button>
    </div>

  </div>
</template>

<style scoped>
.terminal-settings {
  max-width: 640px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px;
}

.page-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 24px;
}

.section {
  margin-bottom: 28px;
}

.section-header {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.section-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0 0 10px;
}

/* ── Shell list ── */
.shell-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shell-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 100ms, background 100ms;
}
.shell-option:hover { border-color: var(--accent); background: var(--accent-subtle); }
.shell-option--active { border-color: var(--accent); background: var(--accent-subtle); }
.shell-option--custom {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

.shell-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  flex-shrink: 0;
}

.shell-path {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell-badge {
  font-size: 10px;
  color: var(--accent);
  background: var(--accent-subtle);
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.shells-empty, .shells-loading {
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px 0;
}

.test-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.test-result {
  font-size: 12px;
  font-family: var(--font-mono);
  padding: 3px 8px;
  border-radius: 4px;
}
.test-result.ok   { color: var(--added);   background: color-mix(in srgb, var(--added)   12%, transparent); }
.test-result.fail { color: var(--deleted); background: color-mix(in srgb, var(--deleted) 12%, transparent); }

/* ── Fields ── */
.field-row {
  display: flex;
  gap: 12px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.field-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field-input {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: 12px;
  padding: 6px 10px;
  font-family: inherit;
  outline: none;
  transition: border-color 100ms;
}
.field-input:focus { border-color: var(--accent); }
.field-input.mono { font-family: var(--font-mono); }

.field-select {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: 12px;
  padding: 6px 10px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
}
.field-select.mono { font-family: var(--font-mono); }
.field-select:focus { border-color: var(--accent); }

.field-textarea {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text);
  font-size: 12px;
  padding: 8px 10px;
  font-family: var(--font-mono);
  outline: none;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
  transition: border-color 100ms;
}
.field-textarea:focus { border-color: var(--accent); }

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin: 4px 0 0;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* ── Radio options ── */
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 100ms, background 100ms;
}
.radio-option:hover { border-color: var(--accent); background: var(--accent-subtle); }
.radio-option--active { border-color: var(--accent); background: var(--accent-subtle); }

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.radio-label { font-size: 12px; font-weight: 500; color: var(--text); }
.radio-desc  { font-size: 11px; color: var(--text-muted); }

/* ── Env vars ── */
.env-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.env-key  { font-size: 12px; font-family: var(--font-mono); color: var(--accent); flex-shrink: 0; }
.env-eq   { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
.env-val  { font-size: 12px; font-family: var(--font-mono); color: var(--text); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.env-remove {
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  background: none; border: none; border-radius: 3px;
  color: var(--text-muted); cursor: pointer;
  flex-shrink: 0;
  transition: background 80ms;
}
.env-remove:hover { background: var(--surface-3); color: var(--deleted); }
.env-remove svg { width: 8px; height: 8px; }

.env-add {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Checkbox ── */
.checkbox-option {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text);
  cursor: pointer;
}
.checkbox-option input[type="checkbox"] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Actions ── */
.actions-row {
  display: flex;
  gap: 10px;
  padding-top: 8px;
}

.btn-primary {
  padding: 7px 18px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 13px;
  cursor: pointer;
  transition: opacity 80ms;
}
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  padding: 7px 18px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: background 80ms, color 80ms;
}
.btn-secondary:hover:not(:disabled) { background: var(--surface-3); color: var(--text); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  border: 0;
}
</style>
