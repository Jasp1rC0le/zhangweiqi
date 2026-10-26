<script setup>
import CampMark from './CampMark.vue'
</script>

<template>
  <span class="camp-assistant-avatar" aria-hidden="true"><CampMark /></span>
</template>

<style scoped>
.camp-assistant-avatar {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 12px;
  background: var(--assistant-soft, #e9eef2);
  color: var(--assistant-accent, #526b85);
}
.camp-assistant-avatar :deep(svg) {
  width: 22px;
  height: 22px;
  --mark-color: currentColor;
}
</style>
