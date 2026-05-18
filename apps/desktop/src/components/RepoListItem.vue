<script setup lang="ts">
import type { LocalRepository } from "@alloy/git-core";

defineProps<{
  repo: LocalRepository;
  active: boolean;
}>();

const emit = defineEmits<{
  (e: "remove", id: string): void;
}>();
</script>

<template>
  <div
    class="repo-item"
    :class="{ active }"
    :title="repo.path"
  >
    <div class="repo-icon">
      <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
        <rect x="1" y="1" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" />
        <path d="M4 4.5h5M4 6.5h5M4 8.5h3" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
      </svg>
    </div>
    <div class="repo-info">
      <span class="repo-name">{{ repo.name }}</span>
    </div>
    <button
      class="remove-btn"
      title="Remove from list"
      @click.stop="emit('remove', repo.id)"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <path d="M2 2l6 6M8 2l-6 6" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.repo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 100ms;
  min-width: 0;
}
.repo-item:hover {
  background: var(--surface-2);
}
.repo-item.active {
  background: var(--accent-subtle);
}
.repo-item.active .repo-name {
  color: var(--accent);
}
.repo-icon {
  color: var(--text-muted);
  flex-shrink: 0;
}
.repo-info {
  flex: 1;
  min-width: 0;
}
.repo-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

/* Remove button — hidden until row is hovered */
.remove-btn {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--text-subtle);
  cursor: pointer;
  opacity: 0;
  transition: opacity 100ms, background 100ms, color 100ms;
  padding: 0;
}
.repo-item:hover .remove-btn {
  opacity: 1;
}
.remove-btn:hover {
  background: rgba(248, 81, 73, 0.15);
  color: var(--deleted, #f85149);
}
</style>
