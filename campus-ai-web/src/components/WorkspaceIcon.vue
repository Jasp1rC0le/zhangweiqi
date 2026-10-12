<script setup>
defineProps({
  mode: {
    type: String,
    required: true,
    validator: (value) => ['standard', 'kimi', 'glm'].includes(value),
  },
})
</script>

<template>
  <svg
    class="workspace-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="mode === 'standard'">
      <path d="M5 4.5h10.5L20 9v8H10l-5 3V4.5Z" />
      <path d="M15.5 4.5V9H20M8.5 9h3.5M8.5 12.5h7" />
    </template>
    <template v-else-if="mode === 'kimi'">
      <path d="M5 3.5h10l4 4V20H5V3.5ZM15 3.5v4h4M8.5 11h7M8.5 14.5h7M8.5 17.5h4" />
    </template>
    <template v-else>
      <path d="M3.5 5h12L20.5 10v9h-17V5ZM15.5 5v5h5M7 10l3 2.5L7 15M12.5 15h4" />
    </template>
  </svg>
</template>

<style scoped>
.workspace-icon {
  display: block;
  width: 1em;
  height: 1em;
  flex: none;
}
</style>
