<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElDialog } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { userSessionGeneration } from '@/api/http'
import { readCalendarLink, enableCalendarLink, revokeCalendarLink } from '@/api/calendarImport'
import { readScheduleExportAccess, prepareScheduleExport, downloadScheduleExport } from '@/api/teaching'
import { calendarDevice, CALENDAR_GUIDES, createCalendarImport } from '@/utils/calendarImport'

const props = defineProps({ minutes: { type: Number, default: 30 }, active: Boolean, disabled: Boolean })
const emit = defineEmits(['fallback'])
const auth = useAuthStore(), device = calendarDevice(window.navigator), help = ref(false), guide = ref(device.platform)
const state = reactive({ busy: false, ready: false, count: 0, error: '', notice: '', hasLink: false })
const owner = computed(() => auth.user ? `${auth.user.id}:${auth.user.schoolId}:${auth.user.role}:${userSessionGeneration.value}` : '')
const scope = computed(() => props.active && !props.disabled && owner.value ? `${owner.value}:${props.minutes}` : '')
const model = createCalendarImport({ owner: () => owner.value, minutes: () => props.minutes, active: () => props.active && !props.disabled,
  state, readLink: readCalendarLink, enableLink: enableCalendarLink, revokeLink: revokeCalendarLink,
  readAccess: readScheduleExportAccess, prepare: prepareScheduleExport, download: downloadScheduleExport, origin: window.location.origin })
const steps = computed(() => CALENDAR_GUIDES[guide.value] || CALENDAR_GUIDES.desktop)
const labels = { apple: '苹果', android: '安卓', harmony: '鸿蒙', desktop: '电脑' }
let disposed = false, warming = null, launchSequence = 0
const copyValue = ref(''), launching = ref(false)
const urls = new Set(), timers = new Set()
function releaseUrls() { for (const timer of timers) window.clearTimeout(timer); timers.clear(); for (const url of urls) URL.revokeObjectURL(url); urls.clear() }
function downloadFile(file) {
  const url = URL.createObjectURL(file.blob), link = document.createElement('a'); urls.add(url)
  link.href = url; link.download = file.filename; link.rel = 'noopener'; document.body.append(link); link.click(); link.remove()
  const timer = window.setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); timers.delete(timer) }, 60000); timers.add(timer)
  model.notice('请在系统日历确认'); help.value = true
}
function nativeFile(file) { return new File([file.blob], file.filename, { type: 'text/calendar' }) }
function canShare(file) { try { return typeof navigator.share === 'function' && navigator.canShare?.({ files: [nativeFile(file)] }) === true } catch { return false } }
async function copySite() {
  try { await navigator.clipboard.writeText(window.location.origin + '/timetable#class-reminders'); model.notice('网址已复制，请在系统浏览器打开'); help.value = true }
  catch { model.fail('未能复制，请从浏览器打开 campthink.cn') }
}
function warm() {
  const pending = model.warm(); warming = pending
  pending.finally(() => { if (warming === pending) warming = null }).catch(() => {})
  return pending
}
async function begin() {
  if (!scope.value || disposed || launching.value) return
  const started = scope.value, sequence = ++launchSequence
  launching.value = true
  try {
    if (warming) await warming
    if (disposed || started !== scope.value || state.busy) return
    model.clearFeedback()
    if (device.platform === 'apple') {
      const url = await model.subscription()
      if (!url || disposed || started !== scope.value) return
      model.notice('请在系统日历确认')
      window.location.assign(url)
      return
    }
    if (!state.ready && !await warm()) return
    const file = await model.verifiedFile()
    if (!file || disposed || started !== scope.value) return
    if (canShare(file)) {
      try {
        await navigator.share({ files: [nativeFile(file)], title: 'Campthink 课表' })
        if (!disposed && started === scope.value) model.notice('请在系统日历确认')
        return
      } catch (failure) {
        if (disposed || started !== scope.value) return
        if (failure.name === 'AbortError') return
        if (failure.name === 'NotAllowedError') { model.notice('课表已核对，请再点一次打开系统面板'); return }
      }
    }
    downloadFile(file)
  } finally { if (sequence === launchSequence) launching.value = false }
}
async function compatibleDownload() {
  if (!scope.value || state.busy) return
  const started = scope.value, file = await model.verifiedFile()
  if (file && !disposed && started === scope.value) downloadFile(file)
}
async function revoke() { copyValue.value = ''; await model.revoke() }
async function copySubscription() {
  const started = scope.value, url = model.currentLink() || await model.subscription()
  if (!url || disposed || started !== scope.value) return
  try { await navigator.clipboard.writeText(url); if (!disposed && started === scope.value) model.notice('私人订阅地址已复制，请勿转发') }
  catch { if (!disposed && started === scope.value) { copyValue.value = url; model.notice('请长按复制下方私人地址') } }
}
watch(scope, value => {
  releaseUrls(); copyValue.value = ''; help.value = false; launchSequence++; launching.value = false; warming = null; model.reset()
  if (value) void warm()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { disposed = true; launchSequence++; copyValue.value = ''; releaseUrls(); model.dispose() })
defineExpose({ begin, busy: computed(() => state.busy || launching.value) })
</script>

<template>
  <div class="calendar-import-action calendar-import-compact">
    <button type="button" class="calendar-import-primary" :disabled="disabled||state.busy||launching" @click="begin">{{state.busy?'准备中…':'导入日历'}}</button>
    <p v-if="state.error" class="calendar-import-error" role="alert">{{state.error}} <button type="button" :disabled="state.busy||disabled" @click="warm">重试</button><RouterLink v-if="/钟点|作息/.test(state.error)" to="/timetable?tool=personal-manage">修改时间</RouterLink><button type="button" @click="help=true">导入帮助</button></p>
    <p v-if="state.notice" class="calendar-import-status" role="status">{{state.notice}}</p>
    <ElDialog v-model="help" title="导入日历" width="min(440px, calc(100vw - 24px))" append-to-body>
      <div class="calendar-import-guide">
        <button v-if="device.embedded" type="button" :disabled="state.busy||disabled" @click="copySite">复制网址到浏览器</button>
        <button type="button" :disabled="state.busy||disabled" @click="compatibleDownload">保存日历文件</button>
        <button v-if="device.platform==='apple'" type="button" :disabled="state.busy||disabled" @click="copySubscription">复制私人订阅</button>
        <button type="button" :disabled="state.busy||disabled" @click="emit('fallback',minutes)">其他导入方式</button>
        <button v-if="state.hasLink" type="button" :disabled="state.busy||disabled" @click="revoke">停用订阅</button>
        <input v-if="copyValue" :value="copyValue" readonly aria-label="私人日历订阅地址" @focus="$event.target.select()"/>
        <details><summary>操作方法</summary><div class="calendar-import-platforms" role="group" aria-label="选择日历系统"><button v-for="(name,key) in labels" :key="key" type="button" :aria-pressed="guide===key" @click="guide=key">{{name}}</button></div><ol><li v-for="step in steps" :key="step">{{step}}</li></ol></details>
      </div>
    </ElDialog>
  </div>
</template>

<style scoped>
.calendar-import-action{min-width:0;flex-basis:100%;padding:12px 0 4px;color:var(--assistant-ink,#29323c)}
.calendar-import-main{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px}.calendar-import-action button{min-height:44px;max-width:100%;padding:9px 14px;border:0;border-radius:10px;background:#e8f0fd;color:#245b9e;font:inherit;font-size:14px;cursor:pointer;transition:background-color 160ms ease,scale 180ms cubic-bezier(.22,.8,.24,1)}
.calendar-import-address{box-sizing:border-box;width:100%;min-width:0;min-height:44px;margin-top:10px;padding:8px;border:1px solid #dbe3ec;border-radius:8px;font-size:16px;color:#29323c;background:#fff}
.calendar-import-action button.calendar-import-primary{background:#0b62db;color:#fff;font-weight:500}.calendar-import-action button:disabled{opacity:.55;cursor:not-allowed}.calendar-import-action button:focus-visible{outline:2px solid #0b62db;outline-offset:2px}.calendar-import-action button:active:not(:disabled){scale:.98}.calendar-import-scope{font-size:12px;color:#5d6876}.calendar-import-short,.calendar-import-status{margin:8px 0;color:#5d6876;font-size:12px;line-height:1.6}.calendar-import-error{color:#a43434;font-size:13px;line-height:1.6}.calendar-import-action button.calendar-import-help{padding:0;background:transparent;font-size:12px;color:#526984}.calendar-import-guide{padding:12px 0;font-size:12px;line-height:1.65;color:#526174}.calendar-import-guide p{margin:8px 0}.calendar-import-platforms,.calendar-import-secondary{display:flex;flex-wrap:wrap;gap:6px}.calendar-import-platforms button{font-size:13px;background:#f1f4f8;color:#526174}.calendar-import-platforms button[aria-pressed=true]{background:#e8f0fd;color:#245b9e}.calendar-import-guide ol{margin:12px 0;padding-left:20px}.calendar-import-guide li{padding:4px 0}.calendar-import-secondary button{font-size:12px}
@media(prefers-reduced-motion:reduce){.calendar-import-action button{transition:none}.calendar-import-action button:active:not(:disabled){scale:1}}
</style>

<style scoped>
.calendar-import-compact{position:relative;display:inline-flex;flex-direction:column;align-items:flex-start}.calendar-import-compact>.calendar-import-primary{white-space:nowrap;min-height:44px;padding:10px 16px;background:var(--assistant-accent,#087f7b);color:#fff;border:0;border-radius:12px;font-size:14px;font-weight:500}.calendar-import-compact>.calendar-import-status,.calendar-import-compact>.calendar-import-error{max-width:32ch;margin:8px 0 0;font-size:12px}.calendar-import-guide{display:flex;gap:10px;flex-wrap:wrap}.calendar-import-guide>button{min-height:44px;border-radius:10px;font-size:14px}.calendar-import-guide details{flex-basis:100%;font-size:13px}.calendar-import-guide summary{min-height:44px;align-content:center;cursor:pointer}.calendar-import-guide>input{font-size:16px;min-height:44px;width:100%;box-sizing:border-box}
</style>
