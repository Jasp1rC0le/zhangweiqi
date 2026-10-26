<script setup>
import NavigationIcon from './NavigationIcon.vue'
import QuickActionIcon from './QuickActionIcon.vue'
import HomeCourseCue from './HomeCourseCue.vue'
import HomeAgenda from './HomeAgenda.vue'
import ProductUpdates from './ProductUpdates.vue'
defineProps({ suggestions: { type: Array, default: () => [] }, campusOpen: Boolean, disabled: Boolean, active: { type: Boolean, default: true } })
const emit = defineEmits(['activate'])
</script>

<template>
  <div class="chat-start">
    <div class="chat-start-lead">
      <h1 class="chat-start-title">今天想聊什么？</h1>
      <p class="chat-start-subtitle">问校园事务，也聊学习里的难题。</p>
    </div>
    <nav class="chat-start-actions" aria-label="开始校园任务">
      <button type="button" class="chat-start-timetable" :disabled="disabled" @click="emit('activate', { route: '/timetable' })">
        <NavigationIcon name="timetable" class="chat-start-icon" />
        <span><strong>我的课表</strong><small>今天、下一节、上课地点</small></span>
      </button>
      <button v-for="item in suggestions" :key="item.title" type="button" class="chat-start-link" :data-kind="item.icon" :disabled="disabled"
        :aria-expanded="item.action === 'campus' ? campusOpen : undefined" :aria-controls="item.action === 'campus' ? 'campus-quick-lookups' : undefined"
        @click="emit('activate', item)">
        <QuickActionIcon :name="item.icon" class="chat-start-icon" />
        <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
      </button>
    </nav>
    <HomeAgenda :disabled="disabled" :active="active" @activate="emit('activate', $event)" />
    <details class="chat-home-notes"><summary>课表设置与产品更新</summary><HomeCourseCue :disabled="disabled" :active="active" @activate="emit('activate', $event)" />
    <ProductUpdates :disabled="disabled" @activate="emit('activate', $event)" /></details>
  </div>
</template>

<style scoped>
:global(html:root body .workspace.chat-focused .welcome.welcome--expressive) { max-width: 760px; padding-top: 16px; padding-bottom: 24px; }
.chat-start { display: grid; gap: 16px; }
.chat-start-lead, .chat-start-actions { min-width: 0; }
:global(html:root body .workspace.chat-focused .welcome--expressive .chat-start-title) { margin: 0; color: var(--assistant-ink); font-size: 22px; font-weight: 500; line-height: 1.35; letter-spacing: -.02em; }
.chat-start-subtitle { margin: 8px 0 0; color: var(--assistant-muted); font-size: 15px; line-height: 1.7; }
.chat-start-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.chat-start-actions button { display: inline-flex; align-items: center; justify-content: flex-start; gap: 8px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--assistant-line); border-radius: 12px; background: var(--assistant-surface); color: var(--assistant-muted); font: inherit; text-align: left; cursor: pointer; transition: background-color 140ms ease; }
.chat-start-actions strong { font-size: 13px; font-weight: 400; line-height: 1.5; }
.chat-start-actions small { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.chat-start-icon { width: 18px; height: 18px; flex: none; color: var(--assistant-muted); }
.chat-start-actions button:hover:not(:disabled) { background: var(--assistant-soft); color: var(--assistant-accent-hover); }
.chat-start-actions button[aria-expanded='true'] { background: var(--assistant-soft); color: var(--assistant-accent-hover); }
.chat-start-actions button:disabled { opacity: .5; cursor: not-allowed; }
.chat-start-actions button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 3px; }
@media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
  :global(html:root body .workspace.chat-focused .welcome--expressive .chat-start-title) { font-size: 1.25rem; font-weight: 500; line-height: 1.35; letter-spacing: -.02em; }
  .chat-start { gap: 16px; }
}
@media (max-width: 760px) {
  :global(html:root body .workspace.chat-focused .welcome.welcome--expressive) { padding-top: 16px; padding-bottom: 18px; }
  .chat-start-subtitle { font-size: 15px; margin-top: 8px; }
  .chat-start-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 350px; gap: 8px; }
}
@media (prefers-reduced-motion: reduce) { .chat-start-actions button { transition: none; } }
@media (max-height: 500px) {
  :global(html:root body .workspace.chat-focused .welcome.welcome--expressive) { padding-top: 8px; padding-bottom: 8px; }
  .chat-start { gap: 8px; }
  .chat-start-subtitle { margin-top: 6px; font-size: 14px; line-height: 1.6; }
}
</style>
