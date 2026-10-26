<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Document } from '@element-plus/icons-vue'
import CampMark from './CampMark.vue'

const props = defineProps({ kind: { type: String, default: 'not-found' }, inline: Boolean })
const emit = defineEmits(['reload', 'dismiss'])
const root = ref()
let previousFocus = null
const loading = computed(() => props.kind === 'loading')
const missing = computed(() => props.kind === 'not-found')
const heading = computed(() => missing.value ? '这个页面暂时找不到' : loading.value ? '正在载入页面' : '页面暂时没有载入')
const description = computed(() => missing.value ? '链接可能已更新，请从工作台重新进入。'
  : loading.value ? '页面加载完成后会自动显示。若等待时间较长，请检查网络后重试。'
    : props.kind === 'asset' ? '网络中断或页面更新可能导致加载失败。' : '打开这个页面时遇到了问题，请稍后重试。')
async function focusNotice() {
  if (loading.value) return
  previousFocus = document.activeElement
  await nextTick()
  root.value?.focus({ preventScroll: true })
}
function dismiss() {
  emit('dismiss')
  void nextTick(() => {
    const destination = previousFocus?.isConnected && previousFocus !== document.body ? previousFocus
      : document.querySelector('.chat-main textarea[aria-label="输入消息"]:not([disabled]), .workspace-tools-trigger')
    if (typeof destination?.focus === 'function') destination.focus({ preventScroll: true })
  })
}
onMounted(focusNotice)
watch(() => props.kind, focusNotice)
</script>

<template>
  <section ref="root" class="route-recovery" :class="{ 'route-recovery-inline': inline }" :role="inline ? 'alert' : undefined"
    tabindex="-1" aria-labelledby="page-recovery-heading" :aria-busy="loading">
    <div class="recovery-content">
      <RouterLink v-if="!inline" class="recovery-brand" to="/login?reauth=1" aria-label="Campthink 首页"><CampMark /></RouterLink>
      <p v-if="missing" class="recovery-code" aria-hidden="true">404</p>
      <Document v-else-if="!inline && !loading" class="recovery-symbol" aria-hidden="true" />
      <div class="recovery-copy">
        <component :is="inline ? 'h2' : 'h1'" id="page-recovery-heading">{{ heading }}</component>
        <p>{{ description }}</p>
        <p v-if="!loading && !missing" class="recovery-caution">重新载入前，请先保留未保存的内容。</p>
      </div>
      <div class="recovery-actions">
        <RouterLink v-if="missing" class="recovery-primary" to="/chat">返回工作台</RouterLink>
        <button v-else-if="!loading" class="recovery-primary" type="button" @click="emit('reload')">重新载入</button>
        <button v-if="inline" type="button" @click="dismiss">留在当前页面</button>
        <RouterLink v-else to="/login?reauth=1">返回首页</RouterLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.route-recovery {
  --recovery-bg: #eef2f8; --recovery-panel: #ffffff; --recovery-ink: #29323c;
  --recovery-muted: #5d6876; --recovery-line: #e2e7ec; --recovery-accent: #0b62db;
  min-height: 100svh; padding: clamp(20px, 4vw, 56px); display: grid; place-items: center;
  box-sizing: border-box; background: var(--recovery-bg); color: var(--recovery-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif;
}
.route-recovery:focus { outline: none; }
.route-recovery ::selection { background: #eaf2ff; color: var(--recovery-ink); }
.recovery-content {
  width: min(100%, 820px); padding: clamp(28px, 5vw, 64px); box-sizing: border-box;
  border: 1px solid var(--recovery-line); border-radius: 16px; background: var(--recovery-panel); text-align: center;
}
.recovery-brand { display: flex; width: fit-content; min-height: 44px; align-items: center; margin-bottom: 36px; }
.recovery-brand .camp-mark { --mark-color: var(--recovery-accent); }
.recovery-code { margin: 0 0 24px; font-size: 96px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; color: #718499; }
.recovery-symbol { display: block; width: 72px; height: 72px; margin: 0 auto 28px; color: #718499; }
.recovery-copy h1 { margin: 0 0 16px; font-size: clamp(28px, 3.2vw, 40px); line-height: 1.3; font-weight: 600; letter-spacing: -0.03em; text-wrap: balance; }
.recovery-copy p { max-width: 65ch; margin: 0 auto; font-size: 16px; line-height: 1.8; color: var(--recovery-muted); overflow-wrap: anywhere; }
.recovery-copy .recovery-caution { margin-top: 8px; }
.recovery-actions { display: grid; gap: 12px; width: min(100%, 460px); margin: 32px auto 0; }
.recovery-actions :is(a, button) {
  display: flex; justify-content: center; align-items: center; min-height: 48px; padding: 12px 20px; box-sizing: border-box;
  border: 1px solid var(--recovery-line); border-radius: 12px; background: var(--recovery-panel);
  color: var(--recovery-accent); font: inherit; font-size: 16px; line-height: 1.5; text-decoration: none; cursor: pointer;
}
.recovery-actions .recovery-primary { background: var(--recovery-accent); border-color: var(--recovery-accent); color: #ffffff; }
.recovery-actions :is(a, button):hover { background: #eaf2ff; }
.recovery-actions .recovery-primary:hover { background: #084db0; border-color: #084db0; }
.route-recovery :is(a, button):focus-visible { outline: 2px solid var(--recovery-accent); outline-offset: 4px; }
.route-recovery-inline {
  position: fixed; z-index: 6200; inset: 16px 20px auto; min-height: 0; padding: 0; background: transparent;
  pointer-events: none; display: block;
}
.route-recovery-inline .recovery-content {
  display: flex; gap: 24px; align-items: center; width: min(100%, 1100px); margin: 0 auto; padding: 20px 24px;
  text-align: left; pointer-events: auto; border-color: #b8c8dd;
}
.route-recovery-inline .recovery-copy { min-width: 0; flex: 1; }
.route-recovery-inline .recovery-copy p { margin-inline: 0; }
.route-recovery-inline h2 { margin: 0 0 6px; font-size: 20px; line-height: 1.5; font-weight: 600; letter-spacing: -0.02em; }
.route-recovery-inline .recovery-actions { width: auto; min-width: 150px; margin: 0; }
@media (max-width: 760px) {
  .recovery-content { padding: 24px; }
  .recovery-brand { margin-bottom: 28px; }
  .recovery-code { font-size: 88px; }
  .recovery-actions { margin-top: 28px; }
  .route-recovery-inline { inset: 12px 12px auto; }
  .route-recovery-inline .recovery-content { display: block; padding: 20px; }
  .route-recovery-inline .recovery-actions { grid-template-columns: 1fr 1fr; margin-top: 16px; min-width: 0; }
  .route-recovery-inline .recovery-actions :is(a, button) { padding-inline: 10px; }
}
</style>
