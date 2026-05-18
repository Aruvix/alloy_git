<script setup lang="ts">
import type { GitFileChange } from "@alloy/git-core";
import { basename, dirname } from "@alloy/shared";

defineProps<{
  file: GitFileChange;
  selected: boolean;
}>();
defineEmits<{
  (e: "click"): void;
  (e: "stage"): void;
  (e: "unstage"): void;
  (e: "discard"): void;
}>();

const kindColors: Record<string, string> = {
  added: "var(--added)",
  deleted: "var(--deleted)",
  modified: "var(--modified)",
  renamed: "var(--accent)",
  untracked: "var(--added)",
  copied: "var(--accent)",
};
const kindLabels: Record<string, string> = {
  added: "A", deleted: "D", modified: "M", renamed: "R",
  untracked: "?", copied: "C", conflict: "C",
};
</script>

<template>
  <div
    class="file-item"
    :class="{ selected, conflicted: file.conflicted }"
    @click="$emit('click')"
  >
    <span
      class="kind-badge"
      :style="{ color: kindColors[file.kind] ?? 'var(--text-muted)' }"
    >{{ kindLabels[file.kind] ?? "M" }}</span>
    <div class="file-info">
      <span class="file-dir" v-if="dirname(file.path)">{{ dirname(file.path) }}/</span><span class="file-name">{{ basename(file.path) }}</span>
    </div>
    <div class="file-actions">
      <button v-if="file.staged" class="action-btn" @click.stop="$emit('unstage')" title="Unstage">−</button>
      <button v-if="!file.staged" class="action-btn" @click.stop="$emit('stage')" title="Stage">+</button>
      <button class="action-btn danger" @click.stop="$emit('discard')" title="Discard">↺</button>
    </div>
  </div>
</template>

<style scoped>
.file-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 80ms;
}
.file-item:hover { background: var(--surface-2); }
.file-item.selected { background: var(--accent-subtle); }
.file-item.conflicted { border-left: 2px solid var(--conflict); }
.kind-badge { font-size: 10px; font-weight: 700; width: 10px; flex-shrink: 0; }
.file-info { flex: 1; min-width: 0; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file-dir { color: var(--text-subtle); }
.file-name { color: var(--text); font-weight: 500; }
.file-actions { display: flex; gap: 2px; opacity: 0; transition: opacity 80ms; }
.file-item:hover .file-actions { opacity: 1; }
.action-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  padding: 1px 4px;
  border-radius: 3px;
  transition: background 80ms, color 80ms;
}
.action-btn:hover { background: var(--surface-3); color: var(--text); }
.action-btn.danger:hover { color: var(--deleted); }
</style>
