<script setup>
import NavigationIcon from './NavigationIcon.vue'
import QuickActionIcon from './QuickActionIcon.vue'
defineProps({ suggestions: { type: Array, default: () => [] }, campusOpen: Boolean, disabled: Boolean, compact: Boolean, active: { type: Boolean, default: true } })
const emit = defineEmits(['activate'])
</script>

<template>
  <div class="chat-start" :class="{ 'is-typing': compact }">
    <div class="chat-start-lead"><h1 class="chat-start-title">今天想聊什么？</h1></div>
    <nav v-if="!compact" class="chat-start-actions" aria-label="开始校园任务">
      <button type="button" aria-label="我的课表" title="我的课表" :disabled="disabled" @click="emit('activate', { route: '/timetable' })">
        <NavigationIcon name="timetable" class="chat-start-icon" /><strong class="chat-action-label">我的课表</strong>
      </button>
      <button v-for="item in suggestions" :key="item.title" type="button" :aria-label="item.title" :title="item.title" :data-kind="item.icon" :disabled="disabled"
        :aria-expanded="item.action === 'campus' ? campusOpen : undefined" :aria-controls="item.action === 'campus' ? 'campus-quick-lookups' : undefined"
        @click="emit('activate', item)">
        <QuickActionIcon :name="item.icon" class="chat-start-icon" /><strong class="chat-action-label">{{ item.title }}</strong>
      </button>
    </nav>
  </div>
</template>

<style scoped>
:global(html:root body .workspace.chat-focused .welcome.welcome--expressive) { max-width: 760px; padding-top: 20px; padding-bottom: 20px; }
.chat-start { display: grid; gap: 24px; }
.chat-start-lead, .chat-start-actions { min-width: 0; }
:global(html:root body .workspace.chat-focused .welcome--expressive .chat-start-title) { margin: 0; color: var(--assistant-ink); font-size: 22px; font-weight: 500; line-height: 1.35; letter-spacing: -.02em; }
.chat-start-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); width: min(100%, 440px); gap: 12px; margin-inline: auto; }
.chat-start-actions button { position: relative; display: grid; place-items: center; align-content: center; gap: 10px; min-width: 0; min-height: 88px; padding: 12px 4px; border: 0; border-radius: 16px; background: transparent; color: var(--assistant-accent-hover); cursor: pointer; transition: background-color 140ms ease; }
.chat-action-label { color: var(--assistant-ink); font-size: 14px; font-weight: 500; line-height: 1.4; white-space: nowrap; }
.chat-start-icon { width: 28px; height: 28px; flex: none; }
.chat-start-actions button:hover:not(:disabled), .chat-start-actions button[aria-expanded='true'] { background: var(--assistant-soft); }
.chat-start-actions button:disabled { opacity: .5; cursor: not-allowed; }
.chat-start-actions button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 3px; }
@media (max-width: 760px), (max-height: 500px) and (pointer: coarse) {
  :global(html:root body .workspace.chat-focused .welcome--expressive .chat-start-title) { font-size: 1.25rem; font-weight: 500; line-height: 1.35; letter-spacing: -.02em; }
  .chat-start { gap: 16px; }
}
@media (max-width: 760px) { .chat-start-actions { width: min(100%, 320px); gap: 8px; } }
@media (prefers-reduced-motion: reduce) { .chat-start-actions button { transition: none; } }
</style>
