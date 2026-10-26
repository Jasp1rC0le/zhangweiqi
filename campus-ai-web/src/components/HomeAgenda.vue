<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { userSessionGeneration } from '@/api/http'
import { queryOwnTimetable } from '@/api/unifiedTimetable'
import { chinaDate } from '@/utils/timetable'
import { useTimetableClock } from '@/utils/useTimetableClock'
import { createHomeAgenda, homeAgendaDestination, homeAgendaNeedsRefresh } from '@/utils/homeAgenda'
import { scheduleDateLabel } from '@/utils/scheduleDisplay'
import { scheduleScopeLabel } from '@/utils/schedulePerspective'
const props = defineProps({ disabled: Boolean, active: { type: Boolean, default: true } })
const emit = defineEmits(['activate'])
const auth = useAuthStore(), clock = useTimetableClock(), mode = ref('TODAY'), headingId = useId()
const owner = computed(() => auth.user ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const day = computed(() => chinaDate(clock.value))
const state = reactive({ result: null, loading: false, error: '' })
let disposed = false
const scope = () => !disposed && props.active && !props.disabled ? owner.value : ''
const resource = createHomeAgenda({ owner: scope, state, read: queryOwnTimetable, today: () => day.value })
const rows = computed(() => state.result?.display.entries.slice(0, 2) || [])
const checkedTime = computed(() => state.result ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(state.result.asOf)) : '')
async function refresh() { if (scope() && !state.loading && document.visibilityState === 'visible') await resource.load(mode.value) }
function foreground() { if (document.visibilityState === 'visible') refresh(); else resource.reset() }
function openDay() { if (scope() && state.result && !state.loading) emit('activate', { route: homeAgendaDestination(state.result) }) }
watch([owner, mode, day, () => props.active, () => props.disabled], () => { resource.reset(); refresh() }, { immediate: true, flush: 'sync' })
watch(clock, now => { if (homeAgendaNeedsRefresh(state.result, mode.value, now)) refresh() })
onMounted(() => { document.addEventListener('visibilitychange', foreground); window.addEventListener('focus', refresh) })
onBeforeUnmount(() => { disposed = true; resource.dispose(); document.removeEventListener('visibilitychange', foreground); window.removeEventListener('focus', refresh) })
</script>
<template>
  <section class="home-agenda" :aria-labelledby="headingId" :aria-busy="state.loading">
    <header class="home-agenda-heading">
      <h2 :id="headingId">日程速览</h2>
      <div class="home-agenda-controls" role="group" aria-label="日程查看方式">
        <button type="button" :aria-pressed="mode === 'TODAY'" :disabled="disabled" @click="mode = 'TODAY'">今天</button>
        <button type="button" :aria-pressed="mode === 'NEXT'" :disabled="disabled" @click="mode = 'NEXT'">下一节</button>
        <button type="button" class="home-agenda-refresh" :disabled="disabled || state.loading" @click="refresh">刷新日程</button>
      </div>
    </header>
    <div class="home-agenda-body" aria-live="polite">
      <p v-if="state.loading" class="home-agenda-message" role="status">正在读取本人{{ mode === 'NEXT' ? '接下来14天的课程定位' : '当天日程' }}…</p>
      <p v-else-if="state.error" class="home-agenda-error" role="alert">{{ state.error }}<button type="button" :disabled="disabled" @click="refresh">重试日程</button></p>
      <template v-else-if="state.result">
        <p class="home-agenda-range">{{ mode === 'TODAY' ? scheduleDateLabel(state.result.from) : `${scheduleDateLabel(state.result.from, false)}起14天内` }} · {{ scheduleScopeLabel(state.result.queryScope) }}</p>
        <p v-if="state.result.display.state === 'UNRESOLVED'" class="home-agenda-warning">{{ state.result.display.summary }}</p>
        <p v-else-if="!state.result.count" class="home-agenda-message">{{ mode === 'NEXT' ? '未来14天内未匹配到接下来的已保存课程。' : '今天未匹配到已保存的课程。' }}没有匹配记录不代表学校停课。</p>
        <template v-else>
          <p class="home-agenda-count">{{ mode === 'NEXT' ? '同一开始时间' : '当天' }}共 {{ state.result.count }} 项安排<span v-if="state.result.count > rows.length">，先显示 {{ rows.length }} 项；其余请打开当天课表核对</span>。</p>
          <ol class="home-agenda-rows">
            <li v-for="row in rows" :key="row.id">
              <div class="home-agenda-time"><small v-if="mode === 'NEXT'">{{ scheduleDateLabel(row.date, false) }}</small><template v-if="row.startTime"><time :datetime="`${row.date}T${row.startTime}`">{{ row.startTime.slice(0, 5) }}</time><span>至 {{ row.endTime.slice(0, 5) }}</span></template><template v-else><strong>钟点待核对</strong><span>{{ row.timeLabel }}</span></template></div>
              <div class="home-agenda-course"><strong>{{ row.name }}</strong><p>{{ row.room || '教室未填写' }} · {{ row.teacher || '任课教师未录入' }}</p><span v-if="row.conflict" class="home-agenda-warning">时间重叠 · 请核对</span></div>
            </li>
          </ol>
        </template>
        <details v-if="state.result.display.notices.length" class="home-agenda-notices"><summary>来源与待核对事项 · {{ state.result.display.notices.length }}</summary><ul><li v-for="notice in state.result.display.notices" :key="notice">{{ notice }}</li></ul></details>
        <footer class="home-agenda-footer"><button type="button" :disabled="disabled" @click="openDay">{{ rows.length ? `打开${scheduleDateLabel(rows[0].date, false)}课表` : '打开课表核对来源' }}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m7 5 5 5-5 5" /></svg></button><small>{{ checkedTime }} 核对 · 已保存与授权安排，非实时教务同步</small></footer>
      </template>
    </div>
  </section>
</template>
<style scoped>
.home-agenda{min-width:0;padding-top:4px;color:var(--assistant-ink);font-size:16px;line-height:1.65}
.home-agenda-heading{display:flex;align-items:center;justify-content:space-between;gap:8px 16px;flex-wrap:wrap}.home-agenda-heading h2{margin:0;font-size:16px;font-weight:600;line-height:1.6}.home-agenda-controls{display:flex;gap:4px;flex-wrap:wrap}
button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:44px;max-width:100%;border:0;border-radius:12px;padding:8px 12px;font:inherit;font-size:16px;line-height:1.6;background:transparent;color:var(--assistant-muted);cursor:pointer;text-underline-offset:4px}button[aria-pressed='true']{color:var(--assistant-accent-hover);background:var(--assistant-soft)}button:hover:not(:disabled){background:var(--assistant-hover)}button:active:not(:disabled){background:var(--assistant-soft)}button:focus-visible,summary:focus-visible{outline:2px solid var(--assistant-accent);outline-offset:3px}button:disabled{opacity:.5;cursor:not-allowed}button svg{width:16px;height:16px;flex:none}.home-agenda-refresh{color:var(--assistant-accent-hover)}
.home-agenda-body{min-height:80px}.home-agenda-range,.home-agenda-count{margin:8px 0;font-size:14px;color:var(--assistant-muted);overflow-wrap:anywhere}.home-agenda-message{margin:12px 0;font-size:16px;max-width:68ch}.home-agenda-error{margin:12px 0;color:var(--assistant-danger);overflow-wrap:anywhere}.home-agenda-error button{margin-left:8px;color:var(--assistant-danger);text-decoration:underline}.home-agenda-warning{color:var(--assistant-warning);font-size:14px;overflow-wrap:anywhere}.home-agenda-body>p.home-agenda-warning{font-size:16px}
.home-agenda-rows{list-style:none;padding:0;margin:12px 0 0}.home-agenda-rows>li{display:grid;grid-template-columns:88px minmax(0,1fr);gap:16px;padding:12px 0;border-top:1px solid var(--assistant-line)}.home-agenda-time{display:flex;flex-direction:column;font-variant-numeric:tabular-nums}.home-agenda-time time,.home-agenda-time strong{font-size:16px;font-weight:500}.home-agenda-time span,.home-agenda-time small{font-size:14px;color:var(--assistant-muted);overflow-wrap:anywhere}.home-agenda-course{min-width:0;overflow-wrap:anywhere}.home-agenda-course>strong{font-size:16px;line-height:1.65;font-weight:500}.home-agenda-course p{margin:4px 0 0;color:var(--assistant-muted);font-size:14px;line-height:1.7}
.home-agenda-footer{display:flex;align-items:center;justify-content:space-between;gap:4px 12px;flex-wrap:wrap;padding-bottom:12px}.home-agenda-footer button{justify-content:flex-start;padding-inline:0;color:var(--assistant-accent-hover)}.home-agenda-footer small{color:var(--assistant-muted);font-size:14px;overflow-wrap:anywhere}.home-agenda-notices{font-size:14px;color:var(--assistant-muted)}summary{min-height:44px;align-content:center;cursor:pointer;color:var(--assistant-accent-hover)}.home-agenda-notices ul{padding-left:20px;margin:4px 0 12px}.home-agenda-notices li{overflow-wrap:anywhere}::selection{background:var(--assistant-soft)}
@media(max-width:560px){.home-agenda-heading{align-items:flex-start;flex-direction:column;gap:4px}.home-agenda-controls{gap:4px}.home-agenda-rows>li{grid-template-columns:80px minmax(0,1fr);gap:12px}.home-agenda-footer{align-items:flex-start;flex-direction:column}.home-agenda-footer small{padding-bottom:4px}}
</style>
