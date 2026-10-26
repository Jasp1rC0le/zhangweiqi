<script setup>
import { useId } from 'vue'
import { productUpdates } from '@/utils/productUpdates'
defineProps({ disabled: Boolean })
const emit = defineEmits(['activate'])
const id = useId()
</script>

<template>
  <details class="product-updates">
    <summary><span>产品更新</span><time :datetime="productUpdates[0].date">{{ productUpdates[0].label }}</time><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg></summary>
    <div class="product-updates-content">
      <p class="product-updates-intro">看看改了哪里，选择入口就能使用。课程与教学功能仍按当前账号的实际权限开放。</p>
      <section v-for="(group, index) in productUpdates" :key="group.date" :aria-labelledby="`${id}-date-${index}`">
        <h3 :id="`${id}-date-${index}`"><time :datetime="group.date">{{ group.label }}</time></h3>
        <ul>
          <li v-for="item in group.items" :key="item.title"><h4>{{ item.title }}</h4><p>{{ item.text }}</p><button type="button" :disabled="disabled" @click="emit('activate', { route: item.route })">{{ item.action }}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m7 5 5 5-5 5" /></svg></button></li>
        </ul>
      </section>
    </div>
  </details>
</template>

<style scoped>
.product-updates { color: var(--assistant-ink); font-size: 16px; }
summary { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px 0; cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary > span { font-weight: 500; }
summary > time { color: var(--assistant-muted); font-size: 14px; margin-left: auto; }
summary > svg { width: 18px; height: 18px; flex: none; color: var(--assistant-muted); }
details[open] > summary > svg { transform: rotate(180deg); }
summary:hover { color: var(--assistant-accent-hover); }
summary:focus-visible, button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 3px; border-radius: 4px; }
.product-updates-content { padding-top: 8px; max-width: 68ch; }
.product-updates-intro { margin: 0; font-size: 14px; line-height: 1.7; color: var(--assistant-muted); }
section { margin-top: 24px; }
h3 { margin: 0 0 12px; color: var(--assistant-muted); font-size: 14px; line-height: 1.7; font-weight: 400; }
ul { padding: 0; margin: 0; list-style: none; }
li { padding: 0 0 12px; }
li + li { padding-top: 16px; border-top: 1px solid var(--assistant-line); }
h4 { margin: 0; font-size: 16px; line-height: 1.7; font-weight: 500; }
li p { margin: 4px 0 0; font-size: 14px; line-height: 1.85; color: var(--assistant-muted); overflow-wrap: anywhere; }
button { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 8px 0; border: 0; background: transparent; color: var(--assistant-accent-hover); font: inherit; font-size: 14px; text-align: left; text-underline-offset: 4px; cursor: pointer; }
button svg { width: 16px; height: 16px; flex: none; }
button:hover:not(:disabled) { text-decoration: underline; }
button:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 560px) { summary { gap: 8px; } summary > time { font-size: 14px; } }
</style>
