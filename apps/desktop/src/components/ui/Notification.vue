<script setup lang="ts">
defineProps<{
  notification: { type: "info" | "success" | "error" | "warning"; message: string };
}>();
defineEmits<{ (e: "dismiss"): void }>();
</script>

<template>
  <div class="notification" :class="notification.type" @click="$emit('dismiss')">
    <span>{{ notification.message }}</span>
  </div>
</template>

<style scoped>
.notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  max-width: 360px;
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  animation: fade-in 150ms ease;
  z-index: 9999;
  border: 1px solid transparent;
}
.notification.success { background: rgba(63, 185, 80, 0.15); border-color: rgba(63, 185, 80, 0.3); color: #3fb950; }
.notification.error { background: rgba(248, 81, 73, 0.15); border-color: rgba(248, 81, 73, 0.3); color: #f85149; }
.notification.warning { background: rgba(210, 153, 34, 0.15); border-color: rgba(210, 153, 34, 0.3); color: #d29922; }
.notification.info { background: rgba(79, 142, 247, 0.15); border-color: rgba(79, 142, 247, 0.3); color: var(--accent); }
@keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>
