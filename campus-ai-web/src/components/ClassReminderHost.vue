<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { isNavigationFailure, NavigationFailureType, useRouter } from 'vue-router'
import { Bell, Close } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { userSessionGeneration } from '@/api/http'
import { useClassReminderStore } from '@/stores/classReminders'

const props = defineProps({ paused: Boolean })
const auth = useAuthStore(), reminders = useClassReminderStore(), router = useRouter(), navigationError = ref('')
const owner = computed(() => auth.user && !props.paused ? `${auth.user.id}:${auth.user.schoolId}:${auth.user.role}:${userSessionGeneration.value}` : '')
const preferenceOwner = () => auth.user ? `${auth.user.id}:${auth.user.schoolId}` : ''
const banner = computed(() => reminders.state.banner?.owner === owner.value ? reminders.state.banner : null)
let timer
function foreground() { if (document.visibilityState === 'visible' && !props.paused) void reminders.pulse(); else reminders.suspend() }
function changedStorage(event) { reminders.storageChanged(event.key) }
async function openCourse() {
  const notice = banner.value
  if (!notice || props.paused) return
  navigationError.value = ''
  try {
    const failure = await router.push(notice.destination)
    if (notice.owner === owner.value && (!failure || isNavigationFailure(failure, NavigationFailureType.duplicated))) reminders.dismiss()
  } catch { if (notice.owner === owner.value) navigationError.value = '课表暂未打开，请重试' }
}
watch(owner, () => { navigationError.value = ''; reminders.syncOwner() }, { flush: 'sync' })
onMounted(() => {
  reminders.attach(() => owner.value, preferenceOwner)
  timer = window.setInterval(foreground, 15000)
  document.addEventListener('visibilitychange', foreground)
  window.addEventListener('focus', foreground)
  window.addEventListener('storage', changedStorage)
})
onBeforeUnmount(() => {
  window.clearInterval(timer); reminders.detach()
  document.removeEventListener('visibilitychange', foreground)
  window.removeEventListener('focus', foreground)
  window.removeEventListener('storage', changedStorage)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="class-notice">
      <section v-if="banner" class="class-reminder-toast" aria-label="课前提醒" role="status" aria-live="polite">
        <div class="class-notice-heading"><Bell aria-hidden="true" /><strong>即将上课</strong><button type="button" aria-label="关闭这次上课提醒" @click="reminders.dismiss"><Close aria-hidden="true" /></button></div>
        <ul><li v-for="row in banner.rows.slice(0, 2)" :key="row.id"><strong>{{ row.name }}</strong><span>{{ row.startTime.slice(0, 5) }}<template v-if="row.room"> · {{ row.room }}</template> · {{ row.minutesUntil }} 分钟后</span></li></ul>
        <p v-if="banner.rows.length > 1" class="class-notice-warning">{{ banner.rows.length }} 项同时段安排，请核对</p>
        <p v-if="navigationError" class="class-notice-warning" role="alert">{{ navigationError }}</p>
        <button type="button" class="class-notice-open" @click="openCourse">查看课表</button>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.class-reminder-toast{position:fixed;z-index:70;top:max(80px,env(safe-area-inset-top));right:24px;box-sizing:border-box;width:min(360px,calc(100vw - 32px));max-height:55dvh;overflow:auto;padding:16px 18px;border-radius:16px;background:#fff;color:#29323c;box-shadow:0 12px 48px #1c30492b;font-family:inherit}
.class-notice-heading{display:flex;align-items:center;gap:8px;color:#165dc4;font-size:14px}.class-notice-heading>svg{width:20px;height:20px}.class-notice-heading button{margin-left:auto}
.class-reminder-toast button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;border:0;border-radius:10px;background:#edf3fd;color:#245b9e;font:inherit;font-size:14px;cursor:pointer;transition:background-color 160ms ease,scale 180ms cubic-bezier(.22,.8,.24,1)}
.class-reminder-toast button:active{scale:.98}.class-reminder-toast button:focus-visible{outline:2px solid #0b62db;outline-offset:2px}.class-notice-heading button{background:transparent}.class-notice-heading button svg{width:18px;height:18px}
.class-reminder-toast ul{list-style:none;margin:4px 0 12px;padding:0}.class-reminder-toast li+li{margin-top:12px}.class-reminder-toast li strong{display:block;font-size:17px;line-height:1.45;overflow-wrap:anywhere}.class-reminder-toast li span{display:block;margin-top:4px;color:#5d6876;font-size:13px;line-height:1.5}.class-notice-open{width:100%}.class-notice-warning{margin:8px 0;color:#805617;font-size:13px;line-height:1.5}
.class-notice-enter-active{transition:opacity 240ms ease,transform 280ms cubic-bezier(.22,.8,.24,1)}.class-notice-leave-active{transition:opacity 140ms ease,transform 180ms ease}.class-notice-enter-from,.class-notice-leave-to{opacity:0;transform:translateY(-8px)}
@media(max-width:760px){.class-reminder-toast{right:16px;top:max(76px,env(safe-area-inset-top))}}
@media(prefers-reduced-motion:reduce){.class-notice-enter-active,.class-notice-leave-active,.class-reminder-toast button{transition:none}.class-notice-enter-from,.class-notice-leave-to{transform:none}.class-reminder-toast button:active{scale:1}}
</style>
