<script setup>
import { computed, watch } from 'vue'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import { homeCourseStatus, courseCheckedDate } from '@/utils/homeCourseStatus'
const props = defineProps({ disabled: Boolean, active: { type: Boolean, default: true } })
const emit = defineEmits(['activate'])
const course = useCourseScheduleStore()
const status = computed(() => homeCourseStatus(course))
// Revalidate on each arrival and account change. The store owns cancellation and response leases.
watch([() => course.principal, () => props.active], ([principal, active]) => { if (principal && active) course.load(true) }, { immediate: true })
function retry() { if (props.active && !props.disabled && !course.loading) course.load(true) }
</script>

<template>
  <section class="home-course-cue" aria-label="本人课表准备情况" :aria-busy="status.kind === 'loading'">
    <div class="home-course-copy" aria-live="polite">
      <template v-if="status.kind === 'loading'"><h2>正在核对已保存课表…</h2><p>只读取当前账号的课程，不会调用模型。</p></template>
      <template v-else-if="status.kind === 'error'"><h2>暂时没能读取课表</h2><p>连接失败不代表没有课程。已保存的数据不会因此删除。</p></template>
      <template v-else-if="status.kind === 'empty'"><h2>把课表准备好，下次直接问</h2><p>导入表格或图片，核对保存后，就能问日期、教室和任课教师。</p></template>
      <template v-else-if="status.kind === 'confirmed-empty'"><h2>已保存一份空课表</h2><p>这是你确认过的个人记录，不代表学校没有开课。</p></template>
      <template v-else><h2>已保存 {{ status.count }} 项课程安排</h2><p v-if="status.missingTeachers">其中 {{ status.missingTeachers }} 项未填写任课教师，可到课表页补充。</p><p v-else>任课教师姓名已填齐，账号任课关系仍以教学端绑定为准。</p></template>
      <small v-if="status.checkedAt">{{ status.semester }} · 上次核对 {{ courseCheckedDate(status.checkedAt) }}</small>
    </div>
    <button v-if="status.kind === 'error'" type="button" :disabled="disabled" @click="retry">重新读取课表</button>
    <button v-else-if="status.kind !== 'loading'" type="button" :disabled="disabled" @click="emit('activate', { route: '/timetable' })">{{ status.kind === 'empty' ? '准备我的课表' : '打开我的课表' }}<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m7 5 5 5-5 5" /></svg></button>
  </section>
</template>

<style scoped>
.home-course-cue { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; border-block: 1px solid var(--assistant-line); color: var(--assistant-ink); }
.home-course-copy { min-width: 0; }
.home-course-copy h2 { margin: 0; font-size: 16px; line-height: 1.6; font-weight: 500; }
.home-course-copy p { margin: 4px 0 0; font-size: 14px; line-height: 1.7; color: var(--assistant-muted); }
.home-course-copy small { display: block; margin-top: 6px; font-size: 14px; line-height: 1.6; color: var(--assistant-muted); overflow-wrap: anywhere; }
button { display: inline-flex; align-items: center; gap: 6px; flex: none; min-height: 44px; padding: 8px 0 8px 12px; border: 0; background: transparent; color: var(--assistant-accent-hover); font: inherit; font-size: 14px; cursor: pointer; text-align: left; text-underline-offset: 4px; }
button svg { width: 16px; height: 16px; }
button:hover:not(:disabled) { text-decoration: underline; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 3px; border-radius: 4px; }
@media (max-width: 560px) { .home-course-cue { align-items: flex-start; flex-direction: column; gap: 4px; padding: 16px 0 8px; } button { padding-left: 0; } }
</style>
