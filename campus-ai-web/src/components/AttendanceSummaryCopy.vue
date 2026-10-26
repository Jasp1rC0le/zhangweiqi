<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { attendanceSummaryText, createAttendanceSummaryCopy } from '@/utils/attendanceSummaryCopy'
const props = defineProps({ context: { type: Object, required: true }, counts: { type: Object, required: true }, planned: { type: Number, default: undefined }, absentStudents: { type: Number, default: undefined }, from: { type: String, required: true }, to: { type: String, required: true }, disabled: Boolean })
const id = useId(), field = ref(), state = reactive({ busy: false, notice: '', manualText: '' })
const text = computed(() => attendanceSummaryText({ counts: props.counts, planned: props.planned, absentStudents: props.absentStudents, from: props.from, to: props.to, view: props.context.view, scopeLabel: props.context.scopeLabel, summaryScope: props.context.summaryScope }))
const key = computed(() => JSON.stringify([props.context.owner, props.context.queryKey, text.value]))
const available = () => !props.disabled && !props.context.disabled && !!props.context.owner && !!text.value
const resource = createAttendanceSummaryCopy({ key: () => key.value, available, text: () => text.value, state, write: value => {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('Clipboard unavailable'))
  return navigator.clipboard.writeText(value)
} })
watch([key, () => props.disabled || props.context.disabled], () => resource.reset(), { flush: 'sync' })
async function copy() { const captured = key.value; await resource.copy(); await nextTick(); if (captured === key.value && available() && state.manualText) field.value?.focus({ preventScroll: true }) }
function selectSummary() {
  if (available() && state.manualText && field.value) {
    field.value.focus(); field.value.select()
    // Keep the date and scope visible after selecting all, not only the end of the long text.
    field.value.scrollTop = 0
  }
}
onBeforeUnmount(() => resource.dispose())
</script>

<template>
  <div class="attendance-summary-copy">
    <div class="summary-copy-row"><p>{{ context.scopeLabel }}</p><button type="button" :disabled="!text || disabled || context.disabled || state.busy" @click="copy">{{ state.busy ? '正在复制…' : '复制考勤摘要' }}</button></div>
    <p class="summary-copy-note">仅复制汇总数字与范围，不含学生姓名或学号。系统剪贴板由你管理。</p>
    <p v-if="state.notice" class="summary-copy-notice" role="status">{{ state.notice }}</p>
    <div v-if="state.manualText && !disabled && !context.disabled" class="summary-copy-manual"><label :for="`${id}-summary`">待复制的考勤摘要</label><textarea :id="`${id}-summary`" ref="field" :value="state.manualText" readonly rows="8" spellcheck="false"></textarea><button type="button" @click="selectSummary">选中全部摘要</button></div>
  </div>
</template>

<style scoped>
.attendance-summary-copy { margin-block: 12px 18px; min-width: 0; }
.summary-copy-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px; }
.summary-copy-row p { margin: 0; font-size: 14px; line-height: 1.7; color: var(--assistant-muted, #5d6876); overflow-wrap: anywhere; }
button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 8px 14px; border: 1px solid var(--assistant-line, #e2e7ec); border-radius: 10px; background: transparent; color: var(--assistant-accent-hover, #084db0); font: inherit; font-size: 14px; cursor: pointer; }
button:hover:not(:disabled) { background: var(--assistant-soft, #eaf2ff); }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--assistant-accent, #0b62db); outline-offset: 3px; }
.summary-copy-note, .summary-copy-notice { margin: 6px 0 0; font-size: 14px; line-height: 1.7; color: var(--assistant-muted, #5d6876); }
.summary-copy-manual { display: grid; gap: 8px; margin-top: 12px; }
.summary-copy-manual label { color: var(--assistant-ink, #29323c); font-size: 14px; line-height: 1.6; }
textarea { display: block; width: 100%; min-width: 0; max-width: 100%; padding: 12px; border: 1px solid var(--assistant-line, #e2e7ec); border-radius: 12px; background: var(--assistant-surface, #fff); color: var(--assistant-ink, #29323c); font: inherit; font-size: 16px; line-height: 1.7; resize: vertical; caret-color: var(--assistant-accent, #0b62db); }
textarea::selection { background: var(--assistant-soft, #eaf2ff); color: var(--assistant-ink, #29323c); }
.summary-copy-manual > button { justify-self: start; }
@media (max-width: 560px) { .summary-copy-row { align-items: flex-start; flex-direction: column; gap: 8px; } }
</style>
