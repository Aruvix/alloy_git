<script setup lang="ts">
const navItems = [
  { path: "/settings/accounts", label: "Accounts" },
  { path: "/settings/git", label: "Git Config" },
  { path: "/settings/appearance", label: "Appearance" },
];
</script>

<template>
  <div class="settings-layout">
    <div class="settings-sidebar">
      <div class="settings-title">Settings</div>
      <nav class="settings-nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="settings-nav-item"
          active-class="active"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
    </div>
    <div class="settings-content">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.settings-layout { display: flex; height: 100%; overflow: hidden; }
.settings-sidebar { width: 180px; min-width: 180px; background: var(--surface-1); border-right: 1px solid var(--border); padding: 16px 0; }
.settings-title { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.07em; padding: 0 14px 10px; }
.settings-nav { display: flex; flex-direction: column; gap: 1px; padding: 0 6px; }
.settings-nav-item { display: block; padding: 6px 10px; border-radius: 5px; color: var(--text-muted); text-decoration: none; font-size: 12px; transition: background 100ms, color 100ms; }
.settings-nav-item:hover { background: var(--surface-2); color: var(--text); }
.settings-nav-item.active { background: var(--accent-subtle); color: var(--accent); }
.settings-content { flex: 1; overflow-y: auto; padding: 24px; }
</style>
