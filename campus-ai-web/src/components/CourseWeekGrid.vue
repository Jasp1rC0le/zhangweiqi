<script setup>
import { computed } from 'vue'
import { addDays, chinaDate } from '@/utils/timetable'
import { courseKey, courseTimeLabel } from '@/utils/courseSchedule'
const props = defineProps({
  courses: { type: Array, required: true },
  monday: { type: String, required: true },
  today: { type: String, default: () => chinaDate() },
})
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const periods = computed(() => Math.max(8, ...props.courses.map((c) => c.endPeriod)))
const date = (i) => addDays(props.monday, i)
const tint = (name) => [...name].reduce((sum, character) => sum + character.codePointAt(0), 0) % 4
</script>
<template>
  <div
    class="period-scroll"
    tabindex="0"
    role="region"
    aria-label="按星期和节次排列的课表，可横向滚动"
  >
    <div class="period-grid" :style="{ '--periods': periods }">
      <div class="period-corner">节次</div>
      <div
        v-for="(day, i) in days"
        :key="day"
        class="period-day"
        :class="{ today: date(i) === today }"
        :style="{ gridColumn: i + 2, gridRow: 1 }"
      >
        <strong>{{ day }}</strong
        ><span
          >{{ date(i).slice(5).replace('-', '/') }}{{ date(i) === today ? ' · 今天' : '' }}</span
        >
      </div>
      <template v-for="period in periods" :key="period">
        <span class="period-number" :style="{ gridRow: period + 1, gridColumn: 1 }">{{
          period
        }}</span>
        <span
          v-for="day in 7"
          :key="day"
          class="period-cell"
          aria-hidden="true"
          :style="{ gridRow: period + 1, gridColumn: day + 1 }"
        />
      </template>
      <article
        v-for="course in courses"
        :key="courseKey(course)"
        class="period-course"
        :aria-label="`${days[course.weekday - 1]} ${date(course.weekday - 1)}，${course.name}，${courseTimeLabel(course)}，${course.room || '教室未填'}，任课教师${course.teacher || '未录入'}`"
        :class="`course-tint-${tint(course.name)}`"
        :style="{
          gridColumn: course.weekday + 1,
          gridRow: `${course.startPeriod + 1} / span ${course.endPeriod - course.startPeriod + 1}`,
        }"
      >
        <strong>{{ course.name }}</strong
        ><span>{{ course.room || '教室未填' }}</span
        ><span class="course-teacher">{{ course.teacher || '任课教师未录入' }}</span><small>{{ courseTimeLabel(course) }}</small>
      </article>
    </div>
  </div>
</template>
<style scoped>
.period-scroll {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--ct-line);
  border-radius: 18px;
  scrollbar-color: #aab4c7 var(--ct-paper);
}
.period-scroll:focus-visible {
  outline: 2px solid var(--ct-blue);
  outline-offset: 3px;
}
.period-grid {
  display: grid;
  grid-template-columns: 38px repeat(7, minmax(96px, 1fr));
  grid-template-rows: 64px repeat(var(--periods), minmax(72px, auto));
  min-width: 740px;
  background: var(--ct-white);
  font-variant-numeric: tabular-nums;
}
.period-corner,
.period-day,
.period-number {
  color: #4e5b6d;
  text-align: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.period-day strong {
  font-size: 15px;
}
.period-day span {
  font-size: 13px;
}
.period-day.today {
  color: #273bab;
  background: #e9edfc;
}
.period-corner,
.period-number {
  font-size: 13px;
  background: var(--ct-paper);
}
.period-cell {
  border-top: 1px solid #eaebe5;
  border-left: 1px solid #eaebe5;
}
.period-course {
  position: relative;
  align-self: stretch;
  margin: 4px;
  padding: 10px 8px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.period-course strong {
  font-size: 14px;
  font-weight: 650;
}
.period-course span {
  font-size: 13px;
}
.period-course small {
  font-size: 12px;
  margin-top: auto;
}
.period-course .course-teacher { font-size: 14px; }
.course-tint-0 {
  background: #e5ebfb;
  color: #293f6b;
}
.course-tint-1 {
  background: #e7efdf;
  color: #34502d;
}
.course-tint-2 {
  background: #fae8d5;
  color: #71421e;
}
.course-tint-3 {
  background: #efe6f6;
  color: #5a366e;
}
::selection {
  background: #334bdb;
  color: white;
}
</style>
