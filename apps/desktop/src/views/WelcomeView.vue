<script setup lang="ts">
import { useUiStore } from "../stores/uiStore.js";

const uiStore = useUiStore();
</script>

<template>
  <div class="welcome">
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <polygon points="24,4 44,14 44,34 24,44 4,34 4,14"
            stroke="currentColor" stroke-width="2" fill="none" opacity="0.3"/>
          <polygon points="24,12 36,18 36,30 24,36 12,30 12,18"
            stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.6"/>
          <circle cx="24" cy="24" r="4" fill="currentColor" opacity="0.8"/>
        </svg>
      </div>
      <h2>Select a repository to start working</h2>
      <p>Clone, import, or create a repository to begin your workflow.</p>

      <div class="cta-list">
        <button class="cta-btn primary" @click="uiStore.openAddRepoModal('clone')">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v8M4 7l4 4 4-4M1 14h14"/>
          </svg>
          Clone Repository
        </button>
        <button class="cta-btn" @click="uiStore.openAddRepoModal('import')">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="3" width="12" height="10" rx="1.5"/>
            <path d="M2 7h12"/>
          </svg>
          Import Local Repository
        </button>
        <button class="cta-btn" @click="uiStore.openAddRepoModal('create')">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <circle cx="8" cy="8" r="6.5"/>
            <path d="M8 5v6M5 8h6"/>
          </svg>
          Create New Repository
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  background: var(--surface-0);
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 380px;
  gap: 0;
}
.empty-icon {
  color: var(--text-subtle);
  margin-bottom: 20px;
}
h2 {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}
p {
  margin: 0 0 28px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
}
.cta-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.cta-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 38px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-1);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms, color 100ms, border-color 100ms;
}
.cta-btn:hover {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--accent);
}
.cta-btn.primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.cta-btn.primary:hover { background: var(--accent-hover); }
</style>
