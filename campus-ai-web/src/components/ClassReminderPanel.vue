<script setup>
import { computed, nextTick, ref } from 'vue'
import { Bell } from '@element-plus/icons-vue'
import { useClassReminderStore } from '@/stores/classReminders'
import { CLASS_REMINDER_MINUTES } from '@/utils/classReminders'
import CalendarImportAction from '@/components/CalendarImportAction.vue'
const props = defineProps({ disabled: Boolean, owner: { type: String, default: '' } })
const emit = defineEmits(['calendar'])
const reminders = useClassReminderStore(), root = ref(), expanded = ref(false), calendarAction = ref()
const state = reminders.state
const label = computed(() => !state.enabled ? '未开启网页提醒' : state.loading ? '核对中' : state.error ? '待重试'
  : state.result?.unknownTimes ? '部分钟点待核对' : `提前 ${state.minutes} 分钟`)
async function importCalendar() {
  const principal = props.owner
  if (!principal || props.disabled) return
  if (root.value) root.value.open = true
  expanded.value = true
  await nextTick()
  if (props.owner === principal && !props.disabled) await calendarAction.value?.begin()
}
defineExpose({ importCalendar, importBusy: computed(() => Boolean(calendarAction.value?.busy)), open() { if (root.value) { root.value.open = true; root.value.scrollIntoView({ block: 'nearest', behavior: 'auto' }) } } })
</script>

<template>
  <details id="class-reminders" ref="root" class="class-reminder-settings" @toggle.self="expanded = $event.target.open">
    <summary><Bell aria-hidden="true" /><strong>上课提醒</strong><span>{{ label }}</span></summary>
    <div class="class-reminder-options">
      <label class="class-reminder-toggle"><input type="checkbox" :checked="state.enabled" :disabled="disabled" @change="reminders.configure($event.target.checked)" />网页内提醒</label>
      <label class="class-reminder-lead">提前<select :value="state.minutes" :disabled="disabled" aria-label="课前提醒时间" @change="reminders.configure(state.enabled, Number($event.target.value))"><option v-for="minutes in CLASS_REMINDER_MINUTES" :key="minutes" :value="minutes">{{ minutes }} 分钟</option></select></label>
      <CalendarImportAction ref="calendarAction" :minutes="state.minutes" :active="expanded" :disabled="disabled" @fallback="emit('calendar', state.minutes)" />
    </div>
    <p class="class-reminder-hint">网页提醒需保持页面打开，手机提醒按系统日历设置生效。</p>
    <p v-if="state.storageUnavailable" class="class-reminder-hint" role="status">浏览器未允许保存设置，本次仅在当前页面生效。</p>
    <p v-if="state.error" class="class-reminder-error" role="alert">{{ state.error }}<button type="button" :disabled="disabled || state.loading" @click="reminders.refresh">重试</button></p>
    <p v-else-if="state.enabled && state.result?.unknownTimes" class="class-reminder-hint">{{ state.result.unknownTimes }} 项课程缺少钟点，<RouterLink to="/timetable?tool=personal-manage">核对课表</RouterLink>。</p>
    <p v-else-if="state.enabled && state.result && !state.result.count" class="class-reminder-hint">今天暂无已保存课程。</p>
  </details>
</template>

<style scoped>
.class-reminder-settings{margin:0 0 20px;padding:0 0 8px;border-bottom:1px solid var(--assistant-line,#e2e7ec);color:var(--assistant-ink,#29323c);font-size:14px}
.class-reminder-settings summary{display:flex;align-items:center;gap:8px;min-height:48px;cursor:pointer;list-style:none}.class-reminder-settings summary::-webkit-details-marker{display:none}.class-reminder-settings summary>svg{width:19px;height:19px;color:#245b9e}.class-reminder-settings summary strong{font-weight:500}.class-reminder-settings summary>span{margin-left:auto;color:#5d6876;font-size:12px}.class-reminder-settings summary:focus-visible{outline:2px solid #0b62db;outline-offset:2px;border-radius:6px}
.class-reminder-options{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;padding-top:8px}.class-reminder-options label{display:flex;align-items:center;gap:8px;min-height:44px}.class-reminder-toggle input{width:18px;height:18px;accent-color:#0b62db}.class-reminder-options select{box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#29323c;font:inherit;font-size:16px}.class-reminder-settings button{min-height:44px;padding:8px 12px;border:0;border-radius:10px;background:#e8f0fd;color:#245b9e;font:inherit;cursor:pointer}.class-reminder-settings :is(select,button,input):focus-visible{outline:2px solid #0b62db;outline-offset:2px}.class-reminder-settings :disabled{opacity:.55;cursor:not-allowed}.class-reminder-hint{margin:8px 0;color:#5d6876;font-size:12px;line-height:1.6}.class-reminder-hint a{color:#245b9e;text-underline-offset:3px}.class-reminder-error{margin:8px 0;color:#a43434;font-size:13px;line-height:1.6}.class-reminder-error button{margin-left:8px}
</style>
