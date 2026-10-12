<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { isNavigationFailure, useRouter } from 'vue-router'
import { userSessionEnded } from '@/api/http'
import SessionEnded from '@/components/SessionEnded.vue'

const router = useRouter()
const arriving = ref(false)

async function enterWorkspace(event) {
  const destination = event.detail?.to
  if (!destination || arriving.value) {
    event.detail?.reject?.(new Error('页面正在切换，请稍后重试'))
    return
  }
  arriving.value = true
  const root = document.documentElement
  const navigate = async () => {
    const result = await router.push(destination)
    if (isNavigationFailure(result)) throw new Error('页面未能打开，请重试')
    await nextTick()
  }
  try {
    // Resolve the route chunk before taking the old snapshot. No form values are copied.
    await import('@/views/ChatView.vue')
    await nextTick()
    root.classList.add('workspace-arriving')
    performance.clearMarks('campus:arrival-ready')
    performance.clearMarks('campus:arrival-finished')
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const transition = document.startViewTransition(navigate)
      // A skipped visual transition must not turn a successful login into an error.
      void transition.ready.then(() => performance.mark('campus:arrival-ready')).catch(() => {})
      await transition.updateCallbackDone
      await transition.finished.catch(() => {})
    } else {
      await navigate()
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        await document.querySelector('.workspace')?.animate(
          [{ opacity:0, transform:'translateY(12px)' }, { opacity:1, transform:'translateY(0)' }],
          { duration:360, easing:'cubic-bezier(.22,1,.36,1)' },
        ).finished
      }
    }
    performance.mark('campus:arrival-finished')
    event.detail?.resolve?.()
  } catch (error) {
    event.detail?.reject?.(error)
  } finally {
    root.classList.remove('workspace-arriving')
    arriving.value = false
  }
}

onMounted(() => window.addEventListener('campus:navigate', enterWorkspace))
onBeforeUnmount(() => {
  window.removeEventListener('campus:navigate', enterWorkspace)
  document.documentElement.classList.remove('workspace-arriving')
})
</script>

<template>
  <div class="app-shell">
    <SessionEnded v-if="userSessionEnded && router.currentRoute.value.meta.requiresAuth" />
    <RouterView v-else v-slot="{ Component, route }">
      <Transition name="page" :mode="arriving ? undefined : 'out-in'" :css="!arriving" appear>
        <div :key="route.matched[0]?.name || route.name || route.path" class="route-page">
          <component :is="Component" />
        </div>
      </Transition>
    </RouterView>
  </div>
</template>

<style>
:root {
  color-scheme: light;
  --ink-strong: #1d1d1f;
  --ink: #424245;
  --ink-soft: #6e6e73;
  --surface: #ffffff;
  --surface-soft: #f5f5f7;
  --line: rgba(29, 29, 31, 0.1);
  --blue: #0071e3;
  --el-color-primary: #0071e3;
  --el-border-radius-base: 12px;
  --el-font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', sans-serif;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  min-height: 100%;
  margin: 0;
}

.app-shell {
  min-height: 100svh;
  overflow-x: clip;
  background:
    radial-gradient(circle at 72% 12%, rgba(0, 122, 255, 0.07), transparent 28%),
    #f5f5f7;
}
.route-page { min-height:100svh; }
/* The sign-in card grows into the workspace; its color panel becomes the sidebar. */
.workspace-arriving .auth-dialog,
.workspace-arriving .workspace { view-transition-name: workspace-shell; }
.workspace-arriving .auth-art,
.workspace-arriving .workspace .sidebar { view-transition-name: workspace-rail; }
.workspace-arriving .auth-body { view-transition-name: sign-in-form; }
::view-transition-group(workspace-shell),
::view-transition-group(workspace-rail) { animation-duration: 780ms; animation-timing-function: cubic-bezier(.22,1,.36,1); }
::view-transition-old(workspace-shell) { animation: arrival-out 300ms ease both; }
::view-transition-new(workspace-shell) { animation: arrival-in 600ms 120ms ease both; }
::view-transition-old(workspace-rail) { animation: arrival-out 550ms ease both; }
::view-transition-new(workspace-rail) { animation: arrival-in 600ms 100ms ease both; }
::view-transition-old(sign-in-form) { animation: form-departure 240ms ease both; }
::view-transition-group(sign-in-form) { z-index: 2; }
@keyframes arrival-in { from { opacity:0; } to { opacity:1; } }
@keyframes arrival-out { to { opacity:0; } }
@keyframes form-departure { to { opacity:0; transform:translateY(-12px); } }
@media (max-width:760px) {
  .workspace-arriving .auth-art,.workspace-arriving .workspace .sidebar { view-transition-name:none; }
}

.page-enter-active {
  will-change: opacity, transform;
  transition:
    opacity 300ms ease,
    transform 380ms cubic-bezier(0.22, 1, 0.36, 1);
}

.page-leave-active {
  will-change: opacity, transform;
  transition:
    opacity 160ms ease,
    transform 200ms ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

html {
  scroll-behavior: smooth;
}

body {
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue',
    'PingFang SC', sans-serif;
  color: var(--ink-strong);
  background: var(--surface-soft);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button,
input,
textarea {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

::selection {
  color: #fff;
  background: #0071e3;
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*) { animation-duration:0.01ms!important; }
  html {
    scroll-behavior: auto;
  }

  .page-enter-active,
  .page-leave-active {
    transition: opacity 120ms linear;
  }

  .page-enter-from,
  .page-leave-to {
    filter: none;
    transform: none;
  }
}

@media (max-width: 600px) {
  .page-enter-active,
  .page-leave-active {
    will-change: opacity, transform;
  }

  .page-enter-from,
  .page-leave-to {
    filter: none;
  }

  .page-enter-from {
    transform: translateY(8px) scale(0.996);
  }
}
</style>
