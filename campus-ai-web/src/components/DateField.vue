<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, useId, watch } from 'vue'
import NavigationIcon from './NavigationIcon.vue'
import { chinaDate } from '@/utils/timetable'
import { pickerDateAllowed, pickerInputValue, pickerKeyDate, pickerMonthDays, shiftPickerMonth, validPickerDate } from '@/utils/datePicker'

defineOptions({ inheritAttrs: false })
const props = defineProps({ modelValue: { type: String, default: '' }, disabled: Boolean, required: Boolean,
  min: { type: String, default: '' }, max: { type: String, default: '' }, mondayOnly: Boolean })
const emit = defineEmits(['update:modelValue', 'input', 'change'])
const attrs = useAttrs(), id = useId(), root = ref(), input = ref(), popup = ref(), trigger = ref()
const draft = ref(props.modelValue)
let emittedValue
const open = ref(false), year = ref(2026), month = ref(1), cursor = ref(''), position = ref({})
const today = computed(() => chinaDate())
const days = computed(() => pickerMonthDays(year.value, month.value))
const weeks = computed(() => Array.from({ length: 6 }, (_, i) => days.value.slice(i * 7, i * 7 + 7)))
const years = computed(() => {
  const first = Math.max(1, validPickerDate(props.min) ? Number(props.min.slice(0, 4)) : year.value - 60)
  const last = Math.min(9999, validPickerDate(props.max) ? Number(props.max.slice(0, 4)) : year.value + 60)
  return Array.from({ length: Math.max(0, Math.min(201, last - first + 1)) }, (_, i) => first + i)
})
const allowed = value => pickerDateAllowed(value, props)
function monthAllowed(valueYear, valueMonth) {
  const value = `${String(valueYear).padStart(4, '0')}-${String(valueMonth).padStart(2, '0')}`
  return (!validPickerDate(props.min) || value >= props.min.slice(0, 7)) && (!validPickerDate(props.max) || value <= props.max.slice(0, 7))
}
function canMoveMonth(delta) {
  const first = `${String(year.value).padStart(4, '0')}-${String(month.value).padStart(2, '0')}-01`
  const next = shiftPickerMonth(first, delta)
  return next !== first && monthAllowed(Number(next.slice(0, 4)), Number(next.slice(5, 7)))
}
const blocked = () => props.disabled || input.value?.matches(':disabled')
function validate() {
  input.value?.setCustomValidity(draft.value && !allowed(draft.value)
    ? props.mondayOnly ? '请选择有效的周一日期' : '请填写有效日期，并遵守所示日期范围' : '')
}
function close(restore = false) {
  open.value = false
  if (restore) trigger.value?.focus({ preventScroll: true })
}
function view(value) { year.value = Number(value.slice(0, 4)); month.value = Number(value.slice(5, 7)) }
function reconcileCursor() {
  const prefix = `${String(year.value).padStart(4, '0')}-${String(month.value).padStart(2, '0')}`
  if (!cursor.value.startsWith(prefix) || !allowed(cursor.value))
    cursor.value = days.value.find(day => !day.outside && allowed(day.value))?.value || days.value.find(day => allowed(day.value))?.value || ''
}
async function focusDay() {
  await nextTick()
  const target = popup.value?.querySelector(`[data-date="${cursor.value}"]:not(:disabled)`) || popup.value?.querySelector('button:not(:disabled)')
  target?.focus({ preventScroll: true })
}
async function show() {
  if (blocked()) return
  if (open.value) { close(); return }
  cursor.value = validPickerDate(props.modelValue) ? props.modelValue : today.value
  if (validPickerDate(props.min) && cursor.value < props.min) cursor.value = props.min
  if (validPickerDate(props.max) && cursor.value > props.max) cursor.value = props.max
  view(cursor.value)
  if (!allowed(cursor.value)) reconcileCursor()
  const rect = root.value.getBoundingClientRect(), width = Math.min(352, window.innerWidth - 24)
  position.value = { width: `${width}px`, left: `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`,
    top: '12px', maxHeight: `${Math.max(160, window.innerHeight - 24)}px` }
  open.value = true
  await nextTick()
  const height = popup.value?.getBoundingClientRect().height || 440
  const below = rect.bottom + 8
  const top = below + height <= window.innerHeight - 12 ? below : rect.top - height - 8
  position.value = { ...position.value, top: `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px` }
  await focusDay()
}
function choose(value) {
  if (blocked() || (value && !allowed(value))) return
  draft.value = value; emittedValue = value
  emit('update:modelValue', value); emit('input', value); emit('change', value)
  void nextTick(() => { emittedValue = undefined; validate() })
  close(); input.value?.focus({ preventScroll: true })
}
function type(event) {
  draft.value = event.target.value
  emittedValue = pickerInputValue(draft.value)
  emit('update:modelValue', emittedValue); emit('input', event)
  void nextTick(() => { emittedValue = undefined; validate() })
}
function moveMonth(delta) {
  if (!canMoveMonth(delta)) return
  const first = `${String(year.value).padStart(4, '0')}-${String(month.value).padStart(2, '0')}-01`
  const next = shiftPickerMonth(first, delta)
  view(next); cursor.value = next
}
function keyboard(event) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
  if (!event.target.dataset.date) return
  const key = props.mondayOnly && event.key === 'ArrowRight' ? 'ArrowDown' : props.mondayOnly && event.key === 'ArrowLeft' ? 'ArrowUp' : event.key
  const next = pickerKeyDate(event.target.dataset.date, key, event.shiftKey)
  if (next === event.target.dataset.date) return
  event.preventDefault()
  if (!allowed(next)) return
  cursor.value = next; view(next); void focusDay()
}
function outside(event) {
  if (open.value && !root.value?.contains(event.target) && !popup.value?.contains(event.target)) close()
}
function focusOutside(event) { outside(event) }
function reposition() { if (open.value) close() }
function scrollOutside(event) { if (open.value && !popup.value?.contains(event.target)) close() }
watch([year, month], reconcileCursor)
watch(() => props.modelValue, value => { if (value !== emittedValue) draft.value = value; void nextTick(validate) })
watch(() => [props.min, props.max, props.mondayOnly], () => { void nextTick(validate) })
watch(() => props.disabled, disabled => { if (disabled) close() })
onMounted(() => { validate(); document.addEventListener('pointerdown', outside); document.addEventListener('focusin', focusOutside); window.addEventListener('resize', reposition); window.addEventListener('scroll', scrollOutside, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusOutside); window.removeEventListener('resize', reposition); window.removeEventListener('scroll', scrollOutside, true) })
</script>

<template>
  <span ref="root" class="date-field" :class="{ 'date-field-open': open }">
    <input ref="input" v-bind="attrs" type="text" :value="draft" :required="required" :disabled="disabled"
      inputmode="numeric" autocomplete="off" placeholder="年-月-日" maxlength="10" pattern="\d{4}-\d{2}-\d{2}"
      @input="type" @blur="validate" @keydown.alt.down.prevent="show" />
    <button ref="trigger" type="button" class="date-trigger" :disabled="disabled" :aria-expanded="open"
      :aria-controls="`${id}-calendar`" :aria-label="attrs['aria-label'] ? `选择${attrs['aria-label']}` : '打开日期选择器'" @click.prevent="show"><NavigationIcon name="timetable" /></button>
    <Teleport to="body">
      <section v-if="open" :id="`${id}-calendar`" ref="popup" class="campthink-calendar" :style="position" role="dialog" aria-label="选择日期" @keydown="keyboard">
        <header class="picker-heading">
          <button type="button" aria-label="上个月" :disabled="!canMoveMonth(-1)" @click="moveMonth(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
          <div><select v-model.number="year" aria-label="年份"><option v-for="n in years" :key="n" :value="n">{{ n }}年</option></select><select v-model.number="month" aria-label="月份"><option v-for="n in 12" :key="n" :value="n" :disabled="!monthAllowed(year,n)">{{ n }}月</option></select></div>
          <button type="button" aria-label="下个月" :disabled="!canMoveMonth(1)" @click="moveMonth(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6" /></svg></button>
        </header>
        <p v-if="mondayOnly" class="picker-note">请选择开学第一周的周一</p>
        <div role="grid" :aria-label="`${year}年${month}月`">
          <div class="picker-week" role="row"><span v-for="d in ['一','二','三','四','五','六','日']" :key="d" role="columnheader">{{ d }}</span></div>
          <div v-for="(week,index) in weeks" :key="index" class="picker-week" role="row">
            <button v-for="day in week" :key="day.value" type="button" role="gridcell" :data-date="day.value"
              :aria-label="day.value" :aria-selected="day.value === modelValue" :aria-current="day.value === today ? 'date' : undefined"
              :disabled="!allowed(day.value)" :tabindex="day.value === cursor ? 0 : -1"
              :class="{ 'picker-other': day.outside, 'picker-today': day.value === today, 'picker-selected': day.value === modelValue }" @click="choose(day.value)">{{ day.day }}</button>
          </div>
        </div>
        <footer><button type="button" :disabled="!allowed(today)" @click="choose(today)">今天</button><button v-if="!required && modelValue" type="button" @click="choose('')">清除</button><button type="button" @click="close(true)">收起</button></footer>
      </section>
    </Teleport>
  </span>
</template>

<style scoped>
.date-field{display:flex;align-items:center;position:relative;min-width:0;max-width:100%;border:1px solid var(--assistant-line,#e2e7ec);border-radius:12px;background:#fff;color:var(--assistant-ink,#29323c)}
.date-field:focus-within{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:2px}
.date-field input{width:100%;min-width:0;min-height:44px;padding:10px 8px 10px 12px!important;border:0!important;background:transparent!important;outline:0!important;box-shadow:none!important;border-radius:12px;font:inherit;font-size:16px;font-variant-numeric:tabular-nums;color:inherit;margin:0!important}
.date-trigger{width:44px;height:44px;min-width:44px;border:0;border-radius:10px;background:transparent;color:var(--assistant-accent,#0b62db);display:grid;place-items:center;cursor:pointer;padding:11px;flex:none}
.date-trigger:hover{background:var(--assistant-soft,#eaf2ff)}.date-trigger:disabled{opacity:.45;cursor:default}.date-trigger svg{width:21px;height:21px}
.campthink-calendar{position:fixed;z-index:4000;box-sizing:border-box;padding:12px;background:#fff;color:#29323c;border-radius:16px;box-shadow:0 8px 36px #1b2a3c29;overflow:auto;font:16px/1.4 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;overscroll-behavior:contain}
.picker-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:4px}.picker-heading>div{display:flex;justify-content:center;min-width:0;gap:4px}.picker-heading select{font:inherit;font-size:16px;font-weight:600;border:0;background:#fff;color:inherit;padding:8px 2px;min-height:40px;max-width:120px;cursor:pointer;border-radius:8px}
.campthink-calendar button{font:inherit;border:0;background:transparent;color:inherit;cursor:pointer;min-height:40px;border-radius:10px;padding:6px}.picker-heading>button{width:40px;height:40px;display:grid;place-items:center;flex:none}.picker-heading svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.picker-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}.picker-week>span{font-size:13px;text-align:center;padding:8px 0;color:#5d6876}.picker-week button{font-size:15px;font-variant-numeric:tabular-nums;aspect-ratio:1;min-width:0}.picker-week .picker-other{color:#66717e}.picker-week .picker-today{font-weight:700;color:#0b62db}.picker-week .picker-selected{background:#0b62db;color:#fff;font-weight:600}
.campthink-calendar button:hover:not(:disabled):not(.picker-selected){background:#eaf2ff;color:#084db0}.campthink-calendar button:disabled{color:#a0a7b0;cursor:default}.campthink-calendar :focus-visible{outline:2px solid #0b62db;outline-offset:-2px}.campthink-calendar footer{border-top:1px solid #e2e7ec;margin-top:8px;padding-top:4px;display:flex;gap:8px}.campthink-calendar footer button{color:#0b62db;padding-inline:10px}.campthink-calendar footer button:last-child{margin-left:auto}.picker-note{font-size:13px;line-height:1.5;color:#5d6876;margin:0 4px 8px}
@media(max-width:420px){.campthink-calendar{padding:10px}.picker-week button{min-height:38px}}
</style>
