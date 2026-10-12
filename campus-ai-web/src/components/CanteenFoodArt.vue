<script setup>
defineProps({ kind: { type: String, default: 'rice' } })
</script>
<template>
  <svg viewBox="0 0 140 140" role="img" aria-label="餐食示意插画，非商家实拍">
    <rect
      width="140"
      height="140"
      :fill="kind === 'noodle' ? '#e8dcc5' : kind === 'dumpling' ? '#dce6d9' : '#f0decf'"
    />
    <ellipse cx="70" cy="110" rx="48" ry="9" fill="#51402e" opacity=".12" />
    <path d="M24 67h92c-3 31-18 43-46 43S27 98 24 67" fill="#fcfaf2" />
    <ellipse cx="70" cy="67" rx="46" ry="26" fill="#d6c8a6" />
    <ellipse cx="70" cy="64" rx="41" ry="22" :fill="kind === 'noodle' ? '#b7854c' : '#faf3db'" />
    <g
      v-if="kind === 'noodle'"
      fill="none"
      stroke="#f1d28f"
      stroke-width="3"
      stroke-linecap="round"
    >
      <path
        d="M39 58c20-20 32 23 53 1M34 64c22-21 42 24 68-2M35 69c20-18 44 25 64 0M44 75c16-14 29 9 43 2"
      />
    </g>
    <g v-else-if="kind === 'dumpling'" fill="#f3e5bb" stroke="#c7aa73" stroke-width="1.5">
      <path
        d="M33 62q12-30 28 0q-14 13-28 0M64 57q13-29 28 0q-15 13-28 0M59 77q13-30 29 0q-15 13-29 0"
      />
      <path d="m39 60 4-10m4 11 1-12m24 7 4-10m4 10 1-12m-14 32 4-9m5 10 0-12" />
    </g>
    <g v-else fill="#ae6c3e" stroke="#8e502a">
      <rect x="43" y="51" width="19" height="15" rx="5" transform="rotate(-15 43 51)" />
      <rect x="67" y="46" width="22" height="18" rx="5" transform="rotate(12 67 46)" />
      <rect x="60" y="67" width="22" height="15" rx="5" />
    </g>
    <g fill="#597d44">
      <ellipse cx="94" cy="69" rx="9" ry="5" transform="rotate(-30 94 69)" />
      <ellipse cx="94" cy="77" rx="8" ry="4" transform="rotate(20 94 77)" />
      <path d="m48 50 4-6 4 3-3 6zm28 21 4-4 4 4-4 3" />
    </g>
    <path
      d="m17 25 101 31M19 18l101 31"
      stroke="#675643"
      stroke-width="3.5"
      stroke-linecap="round"
    />
    <text x="70" y="129" text-anchor="middle" font-size="9" fill="#7a6c58" letter-spacing="2">
      餐食示意
    </text>
  </svg>
</template>
