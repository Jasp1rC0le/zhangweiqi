<script setup>
import { computed, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { animateContentChange, stopContentMotion } from '@/utils/interactionMotion'
import { ElDialog } from 'element-plus'
import { addDays } from '@/utils/timetable'
import { timetableGrid, courseTone } from '@/utils/timetableGrid'
import { courseLocation } from '@/utils/courseLocation'
const props = defineProps({ entries: { type: Array, default: () => [] }, bells: { type: Array, default: () => [] }, monday: String, today: String, selectedDay: String, owner: String, view: String, disabled: Boolean, recordDisabled: Boolean })
const emit = defineEmits(['day', 'open', 'associate', 'import'])
const model = computed(() => timetableGrid(props.entries, props.bells)), selected = ref([]), details = ref(false)
const board = ref()
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const detailTitle = computed(() => selected.value.length === 1 ? selected.value[0].name : `${selected.value.length}项安排`)
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
          <span v-if="group.entries.length === 1" class="visual-room" :title="courseLocation(group.entries[0].room).full">{{ courseLocation(group.entries[0].room).short }}</span>
          <small v-if="group.entries.length > 1" class="visual-stack">{{ group.entries.length }}项</small>
          <small v-else-if="group.entries[0].cancelled">已取消</small>
          <small v-else-if="group.entries[0].conflict">冲突</small>
        </button>
      </div>
      <div v-if="model.extras.length" class="visual-extras" aria-label="按钟点安排的课程">
        <button v-for="entry in model.extras" :key="entry.id" type="button" :data-tone="courseTone(entry.name)" :disabled="disabled" @click="show([entry])"><time>周{{ weekdays[entry.weekday-1] }} · {{ entry.timeLabel }}</time><strong>{{ entry.name }}</strong><span>{{ entry.room }}</span></button>
      </div>
    </template>
    <ElDialog v-model="details" :title="detailTitle" class="course-detail-dialog" modal-class="course-detail-overlay" width="min(480px, calc(100vw - 32px))" align-center :show-close="false" append-to-body destroy-on-close>
      <template #header="{ titleId }">
        <div class="course-detail-heading">
          <h2 :id="titleId">{{ detailTitle }}</h2>
          <button type="button" class="course-detail-close" aria-label="关闭课程详情" @click="details=false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        </div>
      </template>
      <div class="course-detail-content">
        <article v-for="entry in selected" :key="entry.id" class="course-detail-entry">
          <h3 v-if="selected.length > 1">{{ entry.name }}</h3>
          <div class="course-detail-meta">
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/></svg><time :datetime="entry.date">{{ entry.date.replaceAll('-', '/') }} 周{{ weekdays[entry.weekday-1] }}</time></span>
            <span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>{{ entry.timeLabel }}</span>
          </div>
          <div class="course-detail-location">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
            <div><span>上课地点</span><p>{{ courseLocation(entry.room).full || '地点未填写' }}</p></div>
          </div>
          <p v-if="entry.teacher" class="course-detail-teacher"><span>教师</span>{{ entry.teacher }}</p>
          <span v-if="entry.cancelled" class="course-detail-status">已取消</span>
          <span v-else-if="entry.conflict" class="course-detail-status">安排冲突</span>
          <div class="course-detail-actions">
            <slot name="actions" :entry="entry" />
            <button v-if="entry.lessonId && !entry.cancelled" type="button" class="course-detail-primary" :disabled="recordDisabled" @click="record(entry)">{{ view === 'TEACHER' && entry.canMark ? '点名' : '查看记录' }}</button>
            <button v-else-if="!entry.teacher && entry.sources?.includes('PERSONAL')" type="button" :disabled="disabled" @click="details=false;emit('associate')">关联教师</button>
          </div>
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
.visual-course strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;font-size:13px;font-weight:600;line-height:1.4;overflow-wrap:anywhere}.visual-course>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:10px;line-height:1.45;overflow-wrap:anywhere}.visual-course>.visual-room{font-weight:600;font-variant-numeric:tabular-nums}.visual-course>small{font-size:10px;margin-top:auto;line-height:1.4}.visual-course:hover{filter:brightness(.97)}.visual-course:active{transform:scale(.98)}.visual-course.cancelled{opacity:.6}.visual-course.cancelled strong{text-decoration:line-through}.visual-course.conflict{outline:1px dashed var(--assistant-warning,#9a5400);outline-offset:-2px}
.visual-extras{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:12px}.visual-extras button{display:flex;flex-direction:column;gap:6px;min-height:80px;padding:14px;border-radius:12px}.visual-extras time,.visual-extras span{font-size:12px}.visual-extras strong{font-size:15px;font-weight:500}
.visual-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;min-height:240px}.visual-empty svg{width:42px;height:42px;stroke:var(--assistant-accent,#087f7b);stroke-width:2;fill:none;stroke-linecap:round}.visual-empty p{margin:0;font-size:16px;color:var(--assistant-muted)}
.visual-empty button{min-height:44px;border:0;border-radius:10px;background:var(--assistant-soft,#e3f3ef);color:var(--assistant-accent,#087f7b);padding:10px 16px;font:inherit;font-size:14px;cursor:pointer}
.visual-timetable button:focus-visible{outline:2px solid var(--assistant-accent,#087f7b);outline-offset:2px}.visual-timetable button:disabled{cursor:default;opacity:.6}
@media(max-width:600px){.visual-timetable{--rail:29px;--row-height:59px}.visual-days button{font-size:10px}.visual-days button b{font-size:11px}.visual-course{padding:7px 3px;gap:6px;margin:2px 1px;border-radius:7px}.visual-course strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;font-size:11px;line-height:1.4}.visual-course>span{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;font-size:9px;line-height:1.4}.visual-time span{font-size:8px}.visual-time strong{font-size:11px}}
@media(prefers-reduced-motion:reduce){.visual-course{transition:none}.visual-course:active{transform:none}}
</style>

<style scoped>
.visual-course>.visual-room{white-space:pre-line}.visual-course.single{gap:3px;padding-block:5px}.visual-course.single strong{-webkit-line-clamp:1;line-height:1.3}.visual-course.single>.visual-room{-webkit-line-clamp:2}
</style>

<style>
.course-detail-dialog.el-dialog{box-sizing:border-box;max-height:85vh;max-height:85dvh;display:flex;flex-direction:column;padding:0;border-radius:20px;background:#fff;color:var(--assistant-ink,#29323c);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;box-shadow:0 18px 70px rgb(20 31 48 / .2)}
.course-detail-dialog .el-dialog__header{padding:24px 24px 0;margin:0;flex:none}.course-detail-dialog .el-dialog__body{min-height:0;padding:20px 24px 24px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#cad3df transparent}
.course-detail-heading{display:flex;align-items:flex-start;gap:16px}.course-detail-heading h2{flex:1;min-width:0;white-space:normal;overflow-wrap:anywhere;font-size:24px;font-weight:650;line-height:1.35;letter-spacing:-.025em;margin:4px 0 0;color:#29323c}
.course-detail-close{flex:none;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:#f1f4f8;color:#536175;cursor:pointer}.course-detail-close svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.course-detail-content{min-width:0}.course-detail-entry{min-width:0}.course-detail-entry+.course-detail-entry{margin-top:24px;padding-top:24px;border-top:1px solid #e2e7ec}.course-detail-entry h3{margin:0 0 16px;font-size:20px;line-height:1.4;font-weight:600;white-space:normal;overflow-wrap:anywhere}
.course-detail-meta{display:flex;flex-wrap:wrap;gap:10px 18px;color:#5d6876;font-size:14px;line-height:1.5;font-variant-numeric:tabular-nums}.course-detail-meta>span{display:flex;align-items:center;gap:7px;min-width:0;overflow-wrap:anywhere}.course-detail-meta svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.course-detail-location{display:flex;align-items:flex-start;gap:12px;padding:18px;margin-top:22px;background:#f3f6fa;border-radius:14px}.course-detail-location>svg{width:21px;height:21px;flex:none;margin-top:2px;fill:none;stroke:#0b62db;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.course-detail-location>div{min-width:0;flex:1}.course-detail-location span{font-size:14px;line-height:1.5;color:#5d6876}.course-detail-location p{margin:6px 0 0;font-size:18px;font-weight:600;line-height:1.6;color:#29323c;white-space:normal;overflow:visible;overflow-wrap:anywhere;word-break:normal}
.course-detail-teacher{display:flex;gap:14px;margin:18px 0 0;font-size:16px;line-height:1.6;white-space:normal;overflow-wrap:anywhere}.course-detail-teacher>span{flex:none;font-size:14px;color:#5d6876}.course-detail-status{display:inline-block;margin-top:16px;font-size:14px;color:#92501b}
.course-detail-actions{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px;margin-top:24px}.course-detail-actions>button,.course-detail-actions .course-copy-action{box-sizing:border-box;min-height:44px;padding:11px 16px;margin:0;border:1px solid #dce3ed;border-radius:12px;background:#fff;color:#0b62db;font:inherit;font-size:16px;line-height:1.4;cursor:pointer}.course-detail-actions .course-entry-copy{min-width:0;flex:1 1 150px;margin:0}.course-detail-actions .course-copy-action{width:100%}.course-detail-actions>button{flex:1 1 140px}.course-detail-actions>.course-detail-primary{border-color:transparent;background:#0b62db;color:#fff}.course-detail-actions .course-copy-feedback{font-size:14px;line-height:1.6;overflow-wrap:anywhere}
.course-detail-dialog button:hover:not(:disabled){filter:brightness(.96)}.course-detail-dialog button:active:not(:disabled){transform:scale(.98)}.course-detail-dialog button:disabled{opacity:.5;cursor:default}.course-detail-dialog button:focus-visible{outline:2px solid #0b62db;outline-offset:3px}.course-detail-dialog ::selection{background:#dfebfc;color:#183e6c}
@media(max-width:600px){.course-detail-overlay .el-overlay-dialog{display:flex;align-items:flex-end;justify-content:center}.course-detail-dialog.el-dialog{width:100%!important;margin:0!important;border-radius:24px 24px 0 0;box-shadow:0 -12px 45px rgb(20 31 48 / .16)}.course-detail-dialog .el-dialog__header{padding:22px 20px 0}.course-detail-dialog .el-dialog__body{padding:18px 20px calc(24px + env(safe-area-inset-bottom))}.course-detail-heading h2{font-size:22px}.course-detail-overlay.dialog-fade-enter-active .course-detail-dialog{animation:course-sheet-in 260ms cubic-bezier(.16,1,.3,1)}.course-detail-overlay.dialog-fade-leave-active .course-detail-dialog{animation:course-sheet-out 160ms ease-in}}
@keyframes course-sheet-in{from{transform:translateY(24px);opacity:.7}to{transform:translateY(0);opacity:1}}@keyframes course-sheet-out{to{transform:translateY(16px);opacity:0}}
@media(prefers-reduced-motion:reduce){.course-detail-overlay,.course-detail-overlay .course-detail-dialog{animation:none!important;transition:none!important}.course-detail-dialog button:active:not(:disabled){transform:none}}
</style>
