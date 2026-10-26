<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { courseEntryText } from '@/utils/courseEntryCopy'
import { createScopedTextCopy } from '@/utils/scopedTextCopy'
const props = defineProps({ entry: { type: Object, required: true }, scope: { type: String, required: true }, asOf: { type: String, required: true } })
const id = useId(), field = ref(), state = reactive({ busy: false, notice: '', manualText: '' })
const text = computed(() => courseEntryText(props.entry, props.asOf))
const key = computed(() => JSON.stringify([props.scope, props.entry.id, text.value]))
const available = () => !!props.scope && !!text.value
const resource = createScopedTextCopy({ key: () => key.value, available, text: () => text.value, state,
  successNotice: '这节课已交给浏览器剪贴板，转发前请核对接收对象。',
  failureNotice: '浏览器未允许自动复制。可选中下方课程信息后手动复制。',
  write: value => navigator.clipboard?.writeText ? navigator.clipboard.writeText(value) : Promise.reject(new Error('Clipboard unavailable')),
})
watch(key, () => resource.reset(), { flush: 'sync' })
async function copy() {
  const captured = key.value
  await resource.copy(); await nextTick()
  if (captured === key.value && available() && state.manualText) field.value?.focus({ preventScroll: true })
}
function selectCourse() { if (available() && state.manualText && field.value) { field.value.focus(); field.value.select(); field.value.scrollTop = 0 } }
onBeforeUnmount(() => resource.dispose())
</script>
<template>
  <div class="course-entry-copy">
    <button type="button" class="course-copy-action" :disabled="!scope || !text || state.busy" :aria-label="`复制这节课：${entry.name}`" @click="copy">{{ state.busy ? '正在复制…' : '复制这节课' }}</button>
    <p v-if="state.notice" class="course-copy-feedback" role="status">{{ state.notice }}</p>
    <div v-if="state.manualText && scope" class="course-copy-manual">
      <label :for="`${id}-course`">待复制的单节课程</label>
      <textarea :id="`${id}-course`" ref="field" :value="state.manualText" readonly rows="8" spellcheck="false"></textarea>
      <button type="button" @click="selectCourse">选中全部课程信息</button>
    </div>
  </div>
</template>
<style scoped>
.course-entry-copy { margin-top: 8px; min-width: 0; }
button { min-height: 44px; padding: 8px 12px; border: 1px solid var(--assistant-line, #e2e7ec); border-radius: 10px; background: transparent; color: var(--assistant-accent-hover, #084db0); font: inherit; font-size: 16px; cursor: pointer; }
.course-copy-action { margin-inline-start: -12px; border-color: transparent; }
button:hover:not(:disabled) { background: var(--assistant-soft, #eaf2ff); }
button:active:not(:disabled) { background: var(--assistant-accent-soft, #dfecff); }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, textarea:focus-visible { outline: 2px solid var(--assistant-accent, #0b62db); outline-offset: 3px; }
.course-copy-feedback { margin: 4px 0 0; color: var(--assistant-muted, #5d6876); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.course-copy-manual { display: grid; gap: 8px; max-width: 650px; margin-top: 12px; }
label { color: var(--assistant-ink, #29323c); font-size: 14px; line-height: 1.7; }
textarea { display: block; width: 100%; min-width: 0; max-width: 100%; padding: 12px; border: 1px solid var(--assistant-line, #e2e7ec); border-radius: 12px; background: var(--assistant-surface, #fff); color: var(--assistant-ink, #29323c); font: inherit; font-size: 16px; line-height: 1.7; resize: vertical; caret-color: var(--assistant-accent, #0b62db); }
textarea::selection { background: var(--assistant-soft, #eaf2ff); color: var(--assistant-ink, #29323c); }
.course-copy-manual > button { justify-self: start; }
</style>
