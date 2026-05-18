<script setup lang="ts">
import type { GitBranchInfo } from "@alloy/git-core";
import Button from "./ui/Button.vue";

defineProps<{ branch: GitBranchInfo; busy: string | null }>();
const emit = defineEmits<{
  (e: "checkout", branch: GitBranchInfo): void;
  (e: "merge", branch: GitBranchInfo): void;
  (e: "rebase", branch: GitBranchInfo): void;
  (e: "rename", branch: GitBranchInfo): void;
  (e: "delete", branch: GitBranchInfo): void;
}>();

function statusLabel(branch: GitBranchInfo) {
  if (branch.status === "no_upstream") return "No upstream";
  if (branch.ahead > 0 && branch.behind > 0) return `${branch.ahead} ahead · ${branch.behind} behind`;
  if (branch.ahead > 0) return `${branch.ahead} ahead`;
  if (branch.behind > 0) return `${branch.behind} behind`;
  return "Up to date";
}
</script>

<template>
  <div class="branch-item">
    <div class="branch-leading">
      <svg class="branch-glyph" aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="5" cy="3.5" r="1.5"/><circle cx="5" cy="12.5" r="1.5"/><circle cx="11" cy="7" r="1.5"/>
        <path d="M5 5v6M5 5.5c0 2 2.2 1.5 4.4 1.5"/>
      </svg>
      <div class="branch-info">
        <span class="branch-name">{{ branch.name }}</span>
        <span class="branch-meta">
          <span v-if="branch.isDefault" class="pill">Default</span>
          <span v-if="branch.isProtected" class="pill protected">Protected</span>
          <span v-if="branch.upstream" class="upstream">{{ branch.upstream }}</span>
        </span>
      </div>
    </div>
    <span class="branch-sync" :class="branch.status">{{ statusLabel(branch) }}</span>
    <details class="action-menu">
      <summary aria-label="Branch actions">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="7" cy="2.5" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>
      </summary>
      <div class="action-menu-list">
        <Button size="sm" variant="ghost" :disabled="branch.isCurrent || busy === `checkout:${branch.name}`" @click="emit('checkout', branch)">Checkout</Button>
        <Button size="sm" variant="ghost" @click="emit('merge', branch)">Merge into current</Button>
        <Button size="sm" variant="ghost" @click="emit('rebase', branch)">Rebase current onto this</Button>
        <Button v-if="!branch.isRemote" size="sm" variant="ghost" @click="emit('rename', branch)">Rename</Button>
        <Button v-if="!branch.isCurrent && !branch.isDefault && !branch.isProtected" size="sm" variant="ghost" class="danger-btn" @click="emit('delete', branch)">Delete</Button>
      </div>
    </details>
  </div>
</template>

<style scoped>
.branch-item {
  min-height: 40px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 34px;
  gap: 12px;
  align-items: center;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
  transition: background 80ms;
}
.branch-item:last-child { border-bottom: 0; }
.branch-item:hover { background: var(--surface-2); }

.branch-leading { display: flex; align-items: center; gap: 8px; min-width: 0; }
.branch-glyph { color: var(--text-subtle); flex-shrink: 0; }
.branch-info { display: grid; gap: 2px; min-width: 0; }
.branch-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.branch-meta { display: flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; color: var(--text-subtle); font-size: 10px; }
.pill { padding: 1px 6px; border-radius: 999px; background: var(--surface-3); color: var(--text-muted); font-size: 10px; font-weight: 700; }
.pill.protected { background: color-mix(in srgb, var(--modified) 14%, transparent); color: var(--modified); }
.upstream { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.branch-sync { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.branch-sync.ahead { color: var(--added); }
.branch-sync.behind { color: var(--deleted); }
.branch-sync.diverged { color: var(--modified); }
.branch-sync.conflict { color: var(--deleted); }
.branch-sync.no_upstream { color: var(--text-subtle); }

.action-menu { position: relative; justify-self: end; }
.action-menu summary { width: 30px; height: 28px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-1); color: var(--text-muted); cursor: pointer; list-style: none; transition: border-color 80ms, color 80ms; }
.action-menu summary::-webkit-details-marker { display: none; }
.action-menu[open] summary, .action-menu summary:hover { border-color: var(--accent); color: var(--accent); }
.action-menu-list { position: absolute; right: 0; top: 32px; z-index: 10; min-width: 200px; display: flex; flex-direction: column; gap: 2px; padding: 5px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-1); box-shadow: 0 12px 30px color-mix(in srgb, var(--surface-0) 40%, transparent); }
.action-menu-list :deep(.btn) { justify-content: flex-start; width: 100%; }
.danger-btn { color: var(--deleted) !important; }
</style>
