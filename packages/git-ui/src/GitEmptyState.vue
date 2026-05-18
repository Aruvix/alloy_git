<script setup lang="ts">
defineProps<{
  title: string;
  detail?: string;
}>();
</script>

<template>
  <div class="empty-state">
    <strong>{{ title }}</strong>
    <p v-if="detail">{{ detail }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  padding: 24px;
  color: var(--text-muted, #888);
  text-align: center;
}
.empty-state strong {
  color: var(--text, #e8e8e8);
  font-size: 13px;
}
.empty-state p {
  max-width: 360px;
  margin: 4px 0 0;
  font-size: 12px;
}
</style>
