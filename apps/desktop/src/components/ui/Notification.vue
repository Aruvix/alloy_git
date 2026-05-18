<script setup lang="ts">
defineProps<{
  notification: { type: "info" | "success" | "error" | "warning"; message: string };
}>();
defineEmits<{ (e: "dismiss"): void }>();

function typeLabel(type: string) {
  if (type === "success") return "Success";
  if (type === "error") return "Error";
  if (type === "warning") return "Warning";
  return "Info";
}
</script>

<template>
  <div
    class="toast"
    :class="notification.type"
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
  >
    <span class="toast-stripe" aria-hidden="true" />

    <span class="toast-icon" aria-hidden="true">
      <!-- success checkmark -->
      <svg v-if="notification.type === 'success'" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 6l3 3 5-5"/>
      </svg>
      <!-- error × -->
      <svg v-else-if="notification.type === 'error'" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M2 2l8 8M10 2l-8 8"/>
      </svg>
      <!-- warning ! -->
      <svg v-else-if="notification.type === 'warning'" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 2v5M6 9.5v.5"/>
      </svg>
      <!-- info i -->
      <svg v-else width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 5.5v4M6 3v.5"/>
      </svg>
    </span>

    <div class="toast-body">
      <span class="toast-label">{{ typeLabel(notification.type) }}</span>
      <span class="toast-message">{{ notification.message }}</span>
    </div>

    <button
      class="toast-dismiss"
      type="button"
      aria-label="Dismiss notification"
      @click="$emit('dismiss')"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M2 2l8 8M10 2l-8 8"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  gap: 0;
  min-width: 260px;
  max-width: 380px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.18),
    0 1px 3px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  overflow: hidden;
  animation: toast-slide-in 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* Colored left stripe */
.toast-stripe {
  flex-shrink: 0;
  width: 3px;
  align-self: stretch;
}
.toast.success .toast-stripe { background: var(--added); }
.toast.error   .toast-stripe { background: var(--deleted); }
.toast.warning .toast-stripe { background: var(--modified); }
.toast.info    .toast-stripe { background: var(--accent); }

/* Icon circle */
.toast-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  margin: 11px 0 11px 10px;
}
.toast.success .toast-icon { background: rgba(63, 185, 80, 0.18); color: var(--added); }
.toast.error   .toast-icon { background: rgba(248, 81, 73, 0.18); color: var(--deleted); }
.toast.warning .toast-icon { background: rgba(210, 153, 34, 0.18); color: var(--modified); }
.toast.info    .toast-icon { background: rgba(79, 142, 247, 0.18); color: var(--accent); }

/* Body */
.toast-body {
  flex: 1;
  min-width: 0;
  padding: 11px 8px 11px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.toast-label {
  font-size: 12px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--text);
}
.toast-message {
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--text-muted);
  word-break: break-word;
}

/* Dismiss button */
.toast-dismiss {
  flex-shrink: 0;
  align-self: flex-start;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin: 8px 8px 0 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  transition: background 100ms, color 100ms;
}
.toast-dismiss:hover {
  background: var(--surface-2);
  color: var(--text);
}
.toast-dismiss:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
