<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md";
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { variant: "secondary", size: "md" },
);
</script>

<template>
  <button
    class="btn"
    :class="[variant, size, { loading }]"
    :disabled="disabled || loading"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 100ms, color 100ms, opacity 100ms;
  white-space: nowrap;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.sm { padding: 3px 8px; font-size: 11px; }
.btn.md { padding: 5px 12px; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn.secondary { background: var(--surface-3); color: var(--text); }
.btn.secondary:hover:not(:disabled) { background: var(--border); }
.btn.ghost { background: transparent; color: var(--text-muted); }
.btn.ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }
.btn.danger { background: rgba(248, 81, 73, 0.12); color: #f85149; }
.btn.danger:hover:not(:disabled) { background: rgba(248, 81, 73, 0.2); }
</style>
