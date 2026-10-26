<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import NavigationIcon from './NavigationIcon.vue'
import { workspaceTools, workspaceToolsPlacement } from '@/utils/workspaceNavigation.js'
import { wasRouteFailureHandled } from '@/utils/routeRecovery.js'

const route = useRoute()
const router = useRouter()
const id = `workspace-tools-${useId()}`
const trigger = ref()
const panel = ref()
const nativePopover = 'showPopover' in HTMLElement.prototype
const open = ref(false)
const navigating = ref(false)
const placement = ref({})
const active = computed(() => workspaceTools.some((item) => item.name === route.name))

function positionPanel() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  placement.value = workspaceToolsPlacement(window.innerWidth, window.innerHeight, rect.right, rect.bottom)
}
function close(returnFocus = false) {
  if (nativePopover) panel.value?.hidePopover()
  else open.value = false
  if (returnFocus) trigger.value?.focus()
}
function beforeToggle(event) {
  if (event.newState === 'open') positionPanel()
}
async function openWithKeyboard() {
  if (nativePopover) panel.value?.showPopover()
  else {
    positionPanel()
    open.value = true
  }
  await nextTick()
  panel.value?.querySelector('button')?.focus()
}
async function navigate(item) {
  if (navigating.value) return
  navigating.value = true
  // Release the top layer before a route guard can open its confirmation.
  close()
  try {
    const failure = await router.push(item.path)
    // Cancellation retains the page/draft and returns to the visible trigger.
    if (failure || route.name === item.name) trigger.value?.focus()
  } catch (error) {
    if (!wasRouteFailureHandled(error)) ElMessage.error('页面暂时没能打开，请再试一次')
  } finally {
    navigating.value = false
  }
}
function toggleFallback() {
  if (nativePopover) return
  positionPanel()
  open.value = !open.value
}
function dismissFallback(event) {
  if (
    !nativePopover &&
    open.value &&
    !panel.value?.contains(event.target) &&
    !trigger.value?.contains(event.target)
  )
    close()
}
watch(
  () => route.fullPath,
  () => close(),
)
onMounted(() => {
  window.addEventListener('resize', positionPanel)
  document.addEventListener('pointerdown', dismissFallback)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', positionPanel)
  document.removeEventListener('pointerdown', dismissFallback)
})
</script>

<template>
  <div class="workspace-tools">
    <button
      ref="trigger"
      class="workspace-tools-trigger"
      type="button"
      :class="{ active }"
      :popovertarget="nativePopover ? id : undefined"
      :aria-expanded="open"
      :aria-controls="id"
      @click="toggleFallback"
      @keydown.down.prevent="openWithKeyboard"
      @keydown.esc.stop="close(true)"
    >
      <span>工具</span>
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        aria-hidden="true"
      >
        <path d="m6 8 4 4 4-4" />
      </svg>
    </button>
    <Teleport to="body" :disabled="nativePopover">
      <nav
        :id="id"
        ref="panel"
        :popover="nativePopover ? 'auto' : undefined"
        :hidden="!nativePopover && !open"
        class="workspace-tools-panel"
        :class="{ 'fallback-open': !nativePopover && open }"
        aria-label="工具与使用帮助"
        :style="placement"
        @beforetoggle="beforeToggle"
        @toggle="open = $event.newState === 'open'"
        @keydown.esc.stop.prevent="close(true)"
      >
        <button
          v-for="item in workspaceTools"
          :key="item.name"
          type="button"
          :aria-current="route.name === item.name ? 'page' : undefined"
          :disabled="navigating"
          @click="navigate(item)"
        >
          <NavigationIcon :name="item.icon" />
          <span
            ><strong>{{ item.label }}</strong
            ><small>{{ item.description }}</small></span
          >
        </button>
      </nav>
    </Teleport>
  </div>
</template>

<style scoped>
.workspace-tools {
  flex: none;
}
html:root body .workspace .workspace-tools-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  padding: 8px 12px;
  border: 0;
  border-radius: 10px;
  color: var(--assistant-muted);
  background: transparent;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}
html:root body .workspace .workspace-tools-trigger:is(:hover, [aria-expanded='true'], .active) {
  background: var(--assistant-soft);
  color: var(--assistant-accent-hover);
}
.workspace-tools-trigger svg {
  width: 16px;
  height: 16px;
}
/* Native top-layer popover: never clipped by the scrolling workspace. */
html:root body .workspace-tools-panel {
  position: fixed;
  inset: auto;
  width: min(300px, calc(100vw - 24px));
  margin: 0;
  padding: 8px;
  box-sizing: border-box;
  border: 0;
  border-radius: 16px;
  background: #fff;
  color: var(--assistant-ink);
  box-shadow: 0 10px 40px rgb(36 51 57 / 15%);
  overflow: auto;
  overscroll-behavior: contain;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity 180ms ease,
    transform 180ms var(--assistant-ease),
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}
html:root body .workspace-tools-panel:popover-open {
  opacity: 1;
  transform: translateY(0);
}
html:root body .workspace-tools-panel.fallback-open {
  opacity: 1;
  transform: translateY(0);
  z-index: 100;
}
@starting-style {
  html:root body .workspace-tools-panel:popover-open {
    opacity: 0;
    transform: translateY(-4px);
  }
}
html:root body .workspace-tools-panel button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  text-align: left;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--assistant-ink);
  font-family: inherit;
  cursor: pointer;
  transition: background-color 160ms ease;
}
html:root body .workspace-tools-panel button:is(:hover, [aria-current='page']) {
  background: var(--assistant-soft);
}
.workspace-tools-panel button:disabled {
  cursor: progress;
}
.workspace-tools-panel .navigation-icon {
  width: 20px;
  height: 20px;
  color: var(--assistant-accent);
}
.workspace-tools-panel button > span {
  display: grid;
  gap: 3px;
}
.workspace-tools-panel strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.6;
}
.workspace-tools-panel small {
  font-size: 12px;
  color: var(--assistant-muted);
  line-height: 1.5;
}
html:root body :is(.workspace-tools-panel button, .workspace-tools-trigger):focus-visible {
  outline: 2px solid var(--assistant-accent);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  html:root
    body
    :is(
      .workspace-tools-panel,
      .workspace-tools-panel button,
      .workspace .workspace-tools-trigger
    ) {
    transition: none;
    transform: none;
  }
}
</style>
