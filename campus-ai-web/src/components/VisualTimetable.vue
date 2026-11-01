<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { animateContentChange, stopContentMotion } from '@/utils/interactionMotion'
import { ElDialog } from 'element-plus'
import { addDays } from '@/utils/timetable'
import { timetableGrid, courseTone } from '@/utils/timetableGrid'
const props = defineProps({ entries: { type: Array, default: () => [] }, bells: { type: Array, default: () => [] }, monday: String, today: String, selectedDay: String, owner: String, view: String, disabled: Boolean, recordDisabled: Boolean })
const emit = defineEmits(['day', 'open', 'associate', 'import'])
const model = computed(() => timetableGrid(props.entries, props.bells)), selected = ref([]), details = ref(false)
const board = ref()
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
function show(entries) { if (props.disabled) return; selected.value = entries; emit('day',entries[0].date); details.value = true }
watch(() => props.owner, () => { details.value = false; selected.value = [] }, { flush: 'sync' })
watch(() => props.entries, async () => { details.value=false;selected.value=[];await nextTick();if(!props.disabled)animateContentChange(board.value,window,{duration:220,distance:4,opacity:.8}) }, {flush:'post'})
onBeforeUnmount(()=>stopContentMotion(board.value))
watch(() => props.monday, () => { details.value = false; selected.value = [] })
function record(entry) { if (props.recordDisabled || entry.cancelled) return; details.value = false; emit('open', entry) }
</script>
<template>
  <section ref="board" class="visual-timetable" aria-label="一周课表" :aria-busy="disabled">
    <div v-if="!entries.length" class="visual-empty">
      <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="11" width="32" height="30" rx="6"/><path d="M15 7v9m18-9v9M8 22h32m-24 8h6m4 0h6"/></svg>
      <p>本周暂无安排</p><button type="button" :disabled="disabled" @click="emit('import')">导入</button>
    </div>
    <template v-else>
      <div class="visual-days">
        <span class="visual-corner" aria-hidden="true"></span>
        <button v-for="(label, index) in weekdays" :key="label" type="button" :disabled="disabled" :class="{ today: addDays(monday,index) === today, chosen: addDays(monday,index) === selectedDay }" :aria-pressed="addDays(monday,index) === selectedDay" :aria-label="`${addDays(monday,index)} 周${label}`" @click="emit('day',addDays(monday,index))"><b>周{{ label }}</b><span>{{ addDays(monday,index).slice(5).replace('-','/') }}</span></button>
      </div>
      <div v-if="model.rows.length" class="visual-grid" :style="{ '--period-count': model.rows.length }">
        <template v-for="row in model.rows" :key="row.period">
          <div class="visual-time" :style="{ gridColumn:1, gridRow:row.period }"><strong>{{ row.period }}</strong><span v-if="row.start">{{ row.start }}</span></div>
          <span v-for="day in 7" :key="day" class="visual-cell" :class="{ 'visual-cell-today': addDays(monday,day-1) === today }" :style="{ gridColumn:day+1, gridRow:row.period }" aria-hidden="true"></span>
        </template>
        <button v-for="group in model.groups" :key="group.key" class="visual-course" :data-tone="group.tone" :class="{ cancelled: group.entries.every(entry=>entry.cancelled), conflict: group.entries.some(entry=>entry.conflict), single: group.start===group.end }" type="button" :disabled="disabled" :style="{ gridColumn:group.weekday+1, gridRow:`${group.start} / span ${group.end-group.start+1}` }" :aria-label="group.entries.map(entry=>`${entry.date} ${entry.name} ${entry.timeLabel} ${entry.room || ''}`).join('；')" @click="show(group.entries)">
          <strong>{{ group.entries.length>1?`${group.entries.length}项安排`:group.entries[0].name }}</strong><span v-if="group.entries.length>1">{{group.entries.slice(0,2).map(entry=>entry.name).join('、')}}</span>
          <span v-if="group.entries.length === 1">{{ group.entries[0].room }}</span>
          <small v-if="group.entries.length > 1" class="visual-stack">{{ group.entries.length }}项</small>
          <small v-else-if="group.entries[0].cancelled">已取消</small>
          <small v-else-if="group.entries[0].conflict">冲突</small>
        </button>
      </div>
      <div v-if="model.extras.length" class="visual-extras" aria-label="按钟点安排的课程">
        <button v-for="entry in model.extras" :key="entry.id" type="button" :data-tone="courseTone(entry.name)" :disabled="disabled" @click="show([entry])"><time>周{{ weekdays[entry.weekday-1] }} · {{ entry.timeLabel }}</time><strong>{{ entry.name }}</strong><span>{{ entry.room }}</span></button>
      </div>
    </template>
    <ElDialog v-model="details" title="课程详情" width="min(460px, calc(100vw - 24px))" append-to-body destroy-on-close>
      <div class="visual-details">
        <article v-for="entry in selected" :key="entry.id">
          <h3>{{ entry.name }}</h3><p>{{ entry.date }} · {{ entry.timeLabel }}</p><p v-if="entry.room">{{ entry.room }}</p><p v-if="entry.teacher">{{ entry.teacher }}</p>
          <span v-if="entry.cancelled" class="visual-cancelled-label">已取消</span><slot name="actions" :entry="entry" />
          <button v-if="entry.lessonId && !entry.cancelled" type="button" :disabled="recordDisabled" @click="record(entry)">{{ view === 'TEACHER' && entry.canMark ? '点名' : '查看记录' }}</button>
          <button v-else-if="!entry.teacher && entry.sources?.includes('PERSONAL')" type="button" :disabled="disabled" @click="details=false;emit('associate')">关联教师</button>
        </article>
      </div>
    </ElDialog>
  </section>
</template>
<style scoped>
.visual-timetable{--rail:36px;--row-height:62px;min-width:0;color:var(--assistant-ink,#29323c)}
.visual-days,.visual-grid{display:grid;grid-template-columns:var(--rail) repeat(7,minmax(0,1fr))}
.visual-days{position:sticky;top:0;z-index:1;background:var(--assistant-surface,#fff);padding-block:8px}
.visual-days button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:48px;padding:4px 0;border:0;border-radius:10px;background:transparent;color:var(--assistant-muted,#5d6876);font:inherit;font-size:12px;cursor:pointer;font-variant-numeric:tabular-nums}
.visual-days button b{font-weight:500;color:var(--assistant-ink,#29323c)}
.visual-days button.today{color:var(--assistant-accent,#087f7b)}.visual-days button.today b{color:inherit}.visual-days button.chosen{background:var(--assistant-soft,#e3f3ef)}
.visual-grid{grid-template-rows:repeat(var(--period-count),var(--row-height));background:var(--assistant-surface,#fff);border-radius:0 0 14px 14px;overflow:hidden;gap:1px 0}
.visual-time{display:flex;flex-direction:column;align-items:center;padding-top:11px;gap:5px;min-width:0;font-variant-numeric:tabular-nums}.visual-time strong{font-size:12px;font-weight:500}.visual-time span{font-size:9px;color:var(--assistant-muted,#5d6876)}
.visual-cell{border-top:1px solid var(--assistant-line,#e2e7ec);border-inline-start:1px solid var(--assistant-line,#e2e7ec)}.visual-cell-today{background:var(--assistant-panel,#f5f8fb)}
.visual-course,.visual-extras button{--course-bg:#e4eefc;--course-ink:#183e6c;background:var(--course-bg);color:var(--course-ink);border:0;text-align:left;font:inherit;cursor:pointer}
[data-tone="1"]{--course-bg:#e1f1eb;--course-ink:#20564a}[data-tone="2"]{--course-bg:#f8ecd7;--course-ink:#704f20}[data-tone="3"]{--course-bg:#f5e4e7;--course-ink:#783c4c}[data-tone="4"]{--course-bg:#ece7f6;--course-ink:#51426d}
.visual-course{position:relative;align-self:stretch;min-width:0;min-height:0;margin:2px;padding:9px 5px;border-radius:9px;display:flex;flex-direction:column;gap:8px;overflow:hidden;transition:filter 160ms ease,transform 160ms ease}
.visual-course strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;font-size:13px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}.visual-course>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:10px;line-height:1.45;overflow-wrap:anywhere}.visual-course>small{font-size:10px;margin-top:auto;line-height:1.4}.visual-course:hover{filter:brightness(.97)}.visual-course:active{transform:scale(.98)}.visual-course.cancelled{opacity:.6}.visual-course.cancelled strong{text-decoration:line-through}.visual-course.conflict{outline:1px dashed var(--assistant-warning,#9a5400);outline-offset:-2px}
.visual-extras{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:12px}.visual-extras button{display:flex;flex-direction:column;gap:6px;min-height:80px;padding:14px;border-radius:12px}.visual-extras time,.visual-extras span{font-size:12px}.visual-extras strong{font-size:15px;font-weight:500}
.visual-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:240px}.visual-empty svg{width:42px;height:42px;stroke:var(--assistant-accent,#087f7b);stroke-width:2;fill:none;stroke-linecap:round}.visual-empty p{margin:0;font-size:16px;color:var(--assistant-muted)}
.visual-empty button,.visual-details button{min-height:44px;border:0;border-radius:10px;background:var(--assistant-soft,#e3f3ef);color:var(--assistant-accent,#087f7b);padding:10px 16px;font:inherit;font-size:14px;cursor:pointer}
.visual-details article+article{padding-top:18px;margin-top:18px;border-top:1px solid var(--assistant-line,#e2e7ec)}.visual-details h3{font-size:20px;font-weight:600;margin:0 0 12px}.visual-details p{font-size:14px;line-height:1.6;margin:6px 0}.visual-details button{margin-top:12px}.visual-cancelled-label{font-size:13px;color:var(--assistant-muted)}
.visual-timetable button:focus-visible{outline:2px solid var(--assistant-accent,#087f7b);outline-offset:2px}.visual-timetable button:disabled{cursor:default;opacity:.6}
@media(max-width:600px){.visual-timetable{--rail:29px;--row-height:59px}.visual-days button{font-size:10px}.visual-days button b{font-size:11px}.visual-course{padding:7px 3px;gap:6px;margin:2px 1px;border-radius:7px}.visual-course strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;font-size:11px;line-height:1.4}.visual-course>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:9px;line-height:1.4}.visual-time span{font-size:8px}.visual-time strong{font-size:11px}}
@media(prefers-reduced-motion:reduce){.visual-course{transition:none}.visual-course:active{transform:none}}
</style>

<style scoped>
.visual-course.single{gap:3px}.visual-course.single strong{-webkit-line-clamp:2}.visual-course.single>span{-webkit-line-clamp:1}
</style>
