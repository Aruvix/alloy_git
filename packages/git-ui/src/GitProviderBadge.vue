<script setup lang="ts">
import type { GitProvider } from "@alloy/git-core";

defineProps<{
  provider: GitProvider;
  label: string;
  status?: "connected" | "expired" | "invalid" | "untested";
}>();
</script>

<template>
  <span class="provider-badge" :class="status">
    <span class="dot" />
    {{ label }}
  </span>
</template>

<style scoped>
.provider-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  border: 1px solid var(--border, #2a2a2a);
  border-radius: 999px;
  padding: 2px 8px;
  color: var(--text-muted, #888);
  font-size: 11px;
  white-space: nowrap;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}
.connected { color: var(--added, #3fb950); }
.invalid, .expired { color: var(--deleted, #f85149); }
.untested { color: var(--modified, #d29922); }
</style>
