<script setup>
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Location, User } from '@element-plus/icons-vue'
import { scheduleAnswerHeading, scheduleDateLabel, scheduleTimingNote } from '@/utils/scheduleDisplay.js'
import ScheduleCourseChoices from './ScheduleCourseChoices.vue'
import { scheduleScopeLabel, ownScheduleDestination } from '@/utils/schedulePerspective.js'

const props = defineProps({ result: { type: Object, required: true }, active: Boolean })
const emit = defineEmits(['select-course'])
const limit = ref(12)
const expanded = ref(false)
const display = computed(() => props.result.display)
const heading = computed(() => scheduleAnswerHeading(props.result))
const timingNote=computed(()=>scheduleTimingNote(props.result))
const summaryOnly = computed(() =>
  ['COUNT', 'COURSES', 'PERIODS', 'FREE'].includes(props.result.detail),
)
const range = computed(() => {
  const result = props.result
  const value =
    result.from === result.to
      ? scheduleDateLabel(result.from)
      : `${scheduleDateLabel(result.from, false)}—${result.from.slice(0, 4) !== result.to.slice(0, 4) ? result.to.slice(0, 4) + '年' : ''}${scheduleDateLabel(result.to, false)}`
  return `${result.from.slice(0, 4)}年${value}${{ AM: ' · 上午', PM: ' · 下午', EVENING: ' · 晚上' }[result.period] || ''}`
})
const groups = computed(() => {
  const dates = new Map()
  for (const row of display.value.entries.slice(0, limit.value)) {
    if (!dates.has(row.date)) dates.set(row.date, [])
    dates.get(row.date).push(row)
  }
  return [...dates].map(([date, entries]) => ({ date, entries }))
})
const remaining = computed(() => Math.max(0, props.result.count - limit.value))
const clock = (value) => value?.slice(0, 5)
</script>

<template>
  <section class="schedule-answer" :aria-label="heading">
    <header class="schedule-answer-heading">
      <h3>{{ heading }}</h3>
      <p>{{ range }}</p>
      <p v-if="result.queryScope" class="schedule-answer-scope">{{ scheduleScopeLabel(result.queryScope) }}</p>
    </header>
    <p class="schedule-answer-summary" :class="{ 'needs-review': display.state === 'UNRESOLVED' }">
      {{ display.summary }}
    </p>
    <ScheduleCourseChoices
      v-if="result.refinement"
      :refinement="result.refinement"
      :active="active"
      @select-course="emit('select-course', $event)"
    />
    <template v-if="result.detail === 'FREE' && display.state !== 'UNRESOLVED'">
      <ul
        v-if="display.freeDates.length"
        class="free-date-list"
        aria-label="未匹配到已保存安排的日期"
      >
        <li v-for="date in display.freeDates" :key="date">{{ scheduleDateLabel(date) }}</li>
      </ul>
      <p v-else>该范围每天都有匹配的已保存安排。</p>
      <p class="schedule-answer-context">未匹配不代表学校停课，也不是实时空闲保证。</p>
    </template>
    <template v-if="display.entries.length">
      <button
        v-if="summaryOnly"
        type="button"
        class="schedule-answer-disclosure"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : '展开' }}{{ result.count }}项安排
      </button>
      <div v-if="!summaryOnly || expanded" class="schedule-answer-agenda">
        <section
          v-for="group in groups"
          :key="group.date"
          class="schedule-answer-day"
          :aria-label="scheduleDateLabel(group.date)"
        >
          <h4 v-if="result.from !== result.to">{{ scheduleDateLabel(group.date) }}</h4>
          <ol>
            <li v-for="row in group.entries" :key="row.id" class="schedule-answer-row">
              <div class="schedule-answer-time">
                <template v-if="row.startTime">
                  <time :datetime="`${row.date}T${row.startTime}`">{{ clock(row.startTime) }}</time>
                  <span>至 {{ clock(row.endTime) }}</span>
                </template>
                <template v-else
                  ><span>钟点待配置</span><span>{{ row.timeLabel }}</span></template
                >
              </div>
              <div class="schedule-answer-course">
                <strong>{{ row.name }}</strong>
                <p>
                  <Location aria-hidden="true" /><span>{{ row.room || '教室未填写' }}</span>
                </p>
                <p>
                  <User aria-hidden="true" /><span>{{ row.teacher || '任课教师未录入' }}</span>
                </p>
                <span v-if="row.conflict" class="schedule-answer-conflict">时间重叠 · 请核对</span>
              </div>
            </li>
          </ol>
        </section>
        <button v-if="remaining" type="button" class="schedule-answer-more" @click="limit += 12">
          再显示{{ Math.min(12, remaining) }}项 · 还剩{{ remaining }}项
        </button>
      </div>
    </template>
    <ul v-if="display.notices.length" class="schedule-answer-notices" aria-label="查询说明">
      <li v-for="notice in display.notices" :key="notice">{{ notice }}</li>
    </ul>
    <p v-if="timingNote" class="schedule-answer-context">{{ timingNote }}</p>
    <footer class="schedule-answer-footer">
      <RouterLink :to="ownScheduleDestination(result)">打开完整课表</RouterLink>
      <span>{{ result.queryScope?.requested === 'TEACHER' ? '已授权授课安排' : '本人保存与授权安排' }} · 非实时教务同步</span>
    </footer>
    <p v-if="display.state === 'EMPTY' && result.detail !== 'FREE'" class="schedule-answer-context">
      {{ result.queryScope?.requested === 'TEACHER' ? '没有安排不代表学校停课；请核对任课绑定与调课通知，个人导入不会建立授课权限。' : '没有已保存安排不代表学校停课；可在课表中导入或核对来源。' }}
    </p>
  </section>
</template>

<style scoped>
.schedule-answer {
  width: min(100%, 70ch);
  color: var(--assistant-ink, #29323c);
  font-size: 16px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.schedule-answer-heading h3 {
  margin: 0;
  font-size: 22px;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.schedule-answer-heading p {
  margin: 7px 0 0;
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
}
.schedule-answer-summary {
  margin: 16px 0;
}
.schedule-answer-agenda {
  margin-top: 18px;
}
.schedule-answer-day + .schedule-answer-day {
  margin-top: 26px;
}
.schedule-answer-day h4 {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
}
.schedule-answer-day ol {
  padding: 0;
  margin: 0;
  list-style: none;
}
.schedule-answer-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 18px;
  padding: 18px 0;
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.schedule-answer-time {
  font-variant-numeric: tabular-nums;
}
.schedule-answer-time time {
  display: block;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
}
.schedule-answer-time span {
  display: block;
  margin-top: 5px;
  font-size: 13px;
  color: var(--assistant-muted, #5d6876);
}
.schedule-answer-course strong {
  display: block;
  font-size: 17px;
  font-weight: 600;
  line-height: 1.5;
}
.schedule-answer-course p {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 8px 0 0;
  font-size: 14px;
}
.schedule-answer-course svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
  margin-top: 3px;
  color: var(--assistant-muted, #5d6876);
}
.schedule-answer-conflict {
  display: inline-block;
  margin-top: 10px;
  color: var(--assistant-warning, #9a5400);
  font-size: 14px;
}
.schedule-answer-notices,
.needs-review {
  color: var(--assistant-warning, #9a5400);
}
.schedule-answer-notices {
  padding-left: 20px;
  margin: 18px 0;
  font-size: 14px;
}
.schedule-answer-notices li + li {
  margin-top: 6px;
}
.free-date-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  padding-left: 20px;
}
.schedule-answer-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 18px;
  margin-top: 14px;
}
.schedule-answer-footer a,
.schedule-answer button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  max-width: 100%;
  color: var(--assistant-accent, #0b62db);
  text-decoration: underline;
  text-underline-offset: 5px;
  font: inherit;
}
.schedule-answer button {
  cursor: pointer;
  border: 0;
  padding: 8px 0;
  background: transparent;
  text-align: left;
}
.schedule-answer :is(a, button):hover {
  color: var(--assistant-accent-hover, #084db0);
}
.schedule-answer :is(a, button):focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
  border-radius: 4px;
}
.schedule-answer-footer span,
.schedule-answer-context {
  color: var(--assistant-muted, #5d6876);
  font-size: 13px;
}
.schedule-answer-context {
  margin: 8px 0 0;
}
.schedule-answer ::selection {
  background: var(--assistant-soft, #eaf2ff);
}
@media (max-width: 600px) {
  .schedule-answer-heading h3 {
    font-size: 20px;
  }
  .schedule-answer-row {
    grid-template-columns: 70px minmax(0, 1fr);
    gap: 12px;
    padding: 16px 0;
  }
  .schedule-answer-time time {
    font-size: 18px;
  }
  .schedule-answer-course strong {
    font-size: 16px;
  }
  .schedule-answer-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
