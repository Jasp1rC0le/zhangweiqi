<script setup>
defineProps({ name: { type: String, default: 'plan' } })
const paths = {
  campus: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6M8 10h.01M12 10h.01M16 10h.01',
  dining: 'M3 11h18c-1 5-4 8-9 8s-8-3-9-8ZM8 22h8M8 7c-2-2 2-3 0-5M13 7c-2-2 2-3 0-5M17 8l4-6',
  plan: 'M5 4h14v17H5ZM9 2v4M15 2v4M8 11l2 2 5-4M8 17h7',
  read: 'M12 5v16M12 5C9 3 6 3 3 4v15c3-1 6-1 9 2 3-3 6-3 9-2V4c-3-1-6-1-9 1Z',
  outline: 'M5 3v18M5 6h14M5 12h10M5 18h14',
  research: 'M14 15l6 6M17 9A7 7 0 1 1 3 9a7 7 0 0 1 14 0ZM7 9h6M10 6v6',
  debug: 'M8 9h8v7a4 4 0 0 1-8 0V9ZM9 9V6h6v3M3 11h5M16 11h5M3 17h5M16 17h5M6 3l3 3M18 3l-3 3',
  code: 'M8 6l-5 6 5 6M16 6l5 6-5 6M14 3l-4 18',
  explain: 'M4 4h16v16H4ZM7 8l3 3-3 3M12 15h5',
}
</script>
<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.plan" /></svg>
</template>
