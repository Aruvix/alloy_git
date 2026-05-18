<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useGitStatusStore } from "../stores/gitStatusStore.js";

const props = defineProps<{ repoId: string }>();
const route = useRoute();
const router = useRouter();
const statusStore = useGitStatusStore();

const navItems = computed(() => [
  { name: "overview", label: "Overview", badge: null },
  { name: "changes", label: "Changes", badge: statusStore.status?.changes.length || null },
  { name: "history", label: "History", badge: null },
  { name: "branches", label: "Branches", badge: null },
  { name: "remotes", label: "Remotes", badge: null },
  { name: "stash", label: "Stash", route: "stashes", badge: null },
  {
    name: "conflicts",
    label: "Conflicts",
    badge: statusStore.conflictedFiles.length || null,
    danger: statusStore.conflictedFiles.length > 0,
  },
  { name: "terminal", label: "Terminal", badge: null },
  { name: "settings", label: "Settings", badge: null },
]);

function isActive(name: string) {
  return route.name === name || (name === "stash" && route.name === "stashes") || (name === "repo-settings" && route.name === "repo-settings");
}

function navigate(item: { name: string; route?: string }) {
  router.push(`/repositories/${props.repoId}/${item.route ?? item.name}`);
}
</script>

<template>
  <nav class="repo-nav">
    <button
      v-for="item in navItems"
      :key="item.name"
      class="nav-item"
      :class="{ active: isActive(item.name), danger: item.danger }"
      @click="navigate(item)"
    >
      <span class="nav-label">{{ item.label }}</span>
      <span v-if="item.badge" class="nav-badge" :class="{ 'nav-badge-danger': item.danger }">{{ item.badge }}</span>
    </button>
  </nav>
</template>

<style scoped>
.repo-nav {
  display: flex;
  align-items: center;
  min-height: var(--tab-bar-height);
  background: var(--surface-1);
  border-bottom: 1px solid var(--border);
  padding: 0 10px;
  gap: 2px;
  overflow-x: auto;
  flex-shrink: 0;
}
.nav-item {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 10px;
  border-radius: 6px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms, color 100ms;
  white-space: nowrap;
}
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active { background: var(--accent-subtle); color: var(--accent); }
.nav-item.danger { color: var(--deleted); }
.nav-item.danger:hover { background: rgba(239, 68, 68, 0.08); }
.nav-item.active.danger { background: rgba(239, 68, 68, 0.12); color: var(--deleted); }

.nav-badge {
  background: var(--surface-3);
  color: var(--text-muted);
  font-size: 10px;
  padding: 0 5px;
  border-radius: 8px;
  min-width: 16px;
  text-align: center;
}
.nav-item.active .nav-badge { background: var(--accent-subtle); color: var(--accent); }
.nav-badge-danger { background: rgba(239, 68, 68, 0.15) !important; color: var(--deleted) !important; }
</style>
