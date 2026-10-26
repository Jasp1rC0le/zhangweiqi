<script setup>
defineProps({
  name: {
    type: String,
    required: true,
    validator: (value) => ['sources', 'canteen', 'admin', 'feedback', 'projects', 'wall', 'study', 'instruments', 'timetable', 'updates'].includes(value),
  },
})
</script>

<template>
  <svg
    class="navigation-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'updates'">
      <path d="M5 4h14v16H5V4ZM8 8h8M8 12h8M8 16h4" />
    </template>
    <template v-else-if="name === 'timetable'">
      <rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 10h18M7 14h2m3 0h2m3 0h1M7 17h2m3 0h2" />
    </template>
    <template v-else-if="name === 'wall'">
      <path d="M3 4h13v10H8l-5 4V4Zm6 14h7l5 3V10h-2M7 8h5M7 11h3" />
    </template>
    <template v-else-if="name === 'study'">
      <path d="M3 5c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2V5Zm9 2v14M6 9h3m-3 4h3m6-4h3m-3 4h3" />
    </template>
    <template v-else-if="name === 'instruments'">
      <rect x="3" y="4" width="18" height="14" rx="3" /><path d="M7 21h10M12 18v3M6 12h2l2-4 3 7 2-3h3" />
    </template>
    <template v-else-if="name === 'projects'">
      <path d="M3.5 7.5h6l2-3h9v15h-17v-12Z" />
      <path d="m8 13 2.5 2.5 5-5" />
    </template>
    <template v-else-if="name === 'sources'">
      <path d="M7 4.5h11.5v13H7V4.5ZM4.5 7v12.5H16" />
      <path d="M10 9h5M10 12.5h3" />
    </template>
    <template v-else-if="name === 'canteen'">
      <path d="M4 12h16c-.65 4.7-3.34 7-8 7s-7.35-2.3-8-7ZM9 20h6" />
      <path d="M8.5 9.1c-1-1 .8-1.8.2-3.4M12 9.1c-1-1 .8-1.8.2-3.4" />
      <path d="m16 9 2-6" />
    </template>
    <template v-else-if="name === 'admin'">
      <path d="M12 3.5 19 6v5c0 4.4-2.7 7.2-7 9.5-4.3-2.3-7-5.1-7-9.5V6l7-2.5Z" />
      <path d="m8.8 11.9 2.2 2.2 4.2-4.3" />
    </template>
    <template v-else>
      <path d="M5 5.5h14v10H9l-4 3v-13Z" />
      <path d="m9 13 5.9-5.9 2 2L11 15H9v-2Z" />
    </template>
  </svg>
</template>

<style scoped>
.navigation-icon {
  display: block;
  width: 1em;
  height: 1em;
  flex: none;
}
</style>
