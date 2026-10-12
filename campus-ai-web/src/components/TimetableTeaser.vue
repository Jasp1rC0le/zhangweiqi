<script setup>
import { computed, onMounted } from 'vue'
import { useTimetableStore } from '@/stores/timetable'
import { useTimetableClock } from '@/utils/useTimetableClock'
import { timetableStatus } from '@/utils/timetable'
import NavigationIcon from './NavigationIcon.vue'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import { nextImportedCourse } from '@/utils/courseSchedule'
const timetable = useTimetableStore()
const courses = useCourseScheduleStore()
const clock = useTimetableClock()
const status = computed(() => timetableStatus(timetable.timetable, clock.value))
const nextCourse = computed(() => nextImportedCourse(courses.schedule, clock.value))
const label = computed(() => {
  if (courses.schedule) {
    const next = nextCourse.value
    return next
      ? `导入表格${next.current ? '正在上' : '下一节'}：${next.date} ${next.startTime} ${next.name} · ${next.room || '教室未填'}，临时调课需核对`
      : '已导入课程没有后续安排，请核对或更新表格'
  }
  if (timetable.timetable) return status.value.label
  if (timetable.loading || courses.loading) return '正在读取…'
  if (timetable.error || courses.error) return '课表暂未读取，点此重试'
  return '保存截图或课程表格，下次不用再登录教务'
})
onMounted(() => {
  timetable.load()
  courses.load()
})
</script>
<template>
  <RouterLink class="timetable-teaser" to="/timetable">
    <NavigationIcon name="timetable" />
    <span
      ><strong>我的课表</strong><small>{{ label }}</small></span
    >
    <span class="teaser-action"
      >{{ timetable.timetable || courses.schedule ? '查看课表' : '导入课表' }}
      <span aria-hidden="true">→</span></span
    >
  </RouterLink>
</template>
<style scoped>
.timetable-teaser {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  margin-top: 22px;
  border: 1px solid #d7dce5;
  border-radius: 20px;
  background: #f0f3fb;
  color: #273449;
  text-decoration: none;
  text-align: left;
  min-width: 0;
  transition: background 180ms;
}
.timetable-teaser:hover {
  background: #e5ebfc;
}
.timetable-teaser:focus-visible {
  outline: 2px solid #334bdb;
  outline-offset: 3px;
}
.timetable-teaser > svg {
  width: 24px;
  height: 24px;
  color: #334bdb;
  flex: none;
}
.timetable-teaser > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.timetable-teaser strong {
  display: block;
  font-size: 16px;
}
.timetable-teaser small {
  display: block;
  font-size: 14px;
  line-height: 1.7;
  color: #4f6075;
  margin-top: 4px;
}
.teaser-action {
  font-size: 14px;
  flex: none;
}
@media (max-width: 600px) {
  .timetable-teaser {
    flex-wrap: wrap;
    padding: 16px;
  }
  .teaser-action {
    margin-left: 38px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .timetable-teaser {
    transition: none;
  }
}
</style>
