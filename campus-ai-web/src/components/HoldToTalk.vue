<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Microphone } from '@element-plus/icons-vue'
import { createHoldToTalk, voiceCapability } from '@/utils/holdToTalk'
import { voiceConsentOwner, readVoiceConsent, storeVoiceConsent } from '@/utils/voiceConsent'
const props = defineProps({ scope: String, disabled: Boolean, compactEntry: Boolean })
const emit = defineEmits(['question', 'mode', 'keyboard'])
const enabled = ref(false),
  consent = ref(false),
  showSetup = ref(false),
  state = reactive({ phase: 'idle', text: '', message: '' })
let consentStorage
try { consentStorage = window.localStorage } catch { /* A blocked store never means consent. */ }
const consentOwner = computed(() => voiceConsentOwner(props.scope))
const previewElement = ref()
const active = computed(() => ['starting', 'listening', 'ready', 'cancel', 'finishing'].includes(state.phase))
function currentCapability(){
  try{
    const policy=document.permissionsPolicy||document.featurePolicy
    return voiceCapability({secureContext:window.isSecureContext,recognition:window.SpeechRecognition||window.webkitSpeechRecognition,microphoneAllowed:typeof policy?.allowsFeature==='function'?policy.allowsFeature('microphone'):true})
  }catch{return voiceCapability({})}
}
const capability=ref(currentCapability())
let pointer = null
const resource = createHoldToTalk({
  engine: () => window.SpeechRecognition || window.webkitSpeechRecognition,
  owner: () => (!props.disabled ? props.scope : ''),
  update: (value) => Object.assign(state, value),
  availability:()=>enabled.value&&consent.value?currentCapability():{available:false,message:'请先阅读语音处理说明并明确同意；没有开启麦克风。'},
  submit: (text, scope) => {
    if (scope === props.scope && !props.disabled) emit('question', text)
  },
})
function down(event) {
  if (event.button !== 0 || props.disabled) return
  event.preventDefault()
  if (resource.start(event.clientY)) {
    pointer = event.pointerId
    try { event.currentTarget.setPointerCapture?.(pointer) } catch { /* Window release/cancel listeners remain the fallback. */ }
  }
}
function up(event) {
  if (pointer !== event.pointerId) return
  pointer = null
  resource.release()
}
function move(event) { if (pointer === event.pointerId) resource.move(event.clientY) }
function pointerCancel(event) { if (pointer === event.pointerId) cancel() }
function cancel() {
  pointer = null
  resource.cancel()
}
function enableVoice() {
  capability.value=currentCapability()
  if(props.disabled||!consent.value||!capability.value.available)return
  const saved = storeVoiceConsent(consentStorage, consentOwner.value, true)
  enabled.value = true
  showSetup.value = false
  if (!saved) state.message = '当前浏览器未保存此选择，下次仍会询问。'
}
function toggleSetup(){
  capability.value=currentCapability()
  if (consent.value && capability.value.available) { enableVoice(); return }
  showSetup.value=!showSetup.value
}
function voiceSettings() { cancel(); enabled.value=false; showSetup.value=true; capability.value=currentCapability() }
function forgetConsent() { if (!consent.value) storeVoiceConsent(consentStorage, consentOwner.value, false) }
function keyboard() {
  enabled.value = false
  showSetup.value=false
  cancel()
  emit('keyboard')
}
watch(enabled, (value) => emit('mode', value))
function keydown(event) {
  if ([' ', 'Enter'].includes(event.key) && !event.repeat) {
    event.preventDefault()
    resource.start(0)
  }
}
function keyup(event) {
  if ([' ', 'Enter'].includes(event.key)) {
    event.preventDefault()
    resource.release()
  }
}
function visibility() {
  if (document.hidden) cancel()
}
watch(
  () => props.scope,
  () => {
    cancel()
    enabled.value = showSetup.value = false
    consent.value = readVoiceConsent(consentStorage, consentOwner.value)
  },
  { flush: 'sync', immediate: true },
)
watch(
  () => props.disabled,
  (value) => {
    if (value) cancel()
  },
)
watch(() => state.text, () => { if (active.value) nextTick(() => { if (previewElement.value) previewElement.value.scrollTop=previewElement.value.scrollHeight }) })
window.addEventListener('pointerup', up)
window.addEventListener('pointermove', move, { passive: true })
window.addEventListener('pointercancel', pointerCancel)
window.addEventListener('blur', cancel)
document.addEventListener('visibilitychange', visibility)
onBeforeUnmount(() => {
  emit('mode', false)
  window.removeEventListener('pointerup', up)
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointercancel', pointerCancel)
  window.removeEventListener('blur', cancel)
  document.removeEventListener('visibilitychange', visibility)
  resource.dispose()
})
</script>
<template>
  <div class="hold-talk" :class="{ 'compact-entry': compactEntry && !enabled && !showSetup && !state.message && !state.text }">
    <button
      v-if="!enabled"
      type="button"
      class="voice-entry"
      :disabled="disabled"
      :aria-expanded="showSetup"
      @click="toggleSetup"
    >
      <el-icon><Microphone /></el-icon>语音输入
    </button>
    <div v-if="showSetup && !enabled" class="voice-setup">
      <p v-if="!capability.available" role="status">{{ capability.message }}</p>
      <template v-else><p>
        使用浏览器的语音转写服务，可能把音频交给浏览器提供商处理。本站不保存录音。不要朗读私人名册或考勤。
      </p>
      <label><input v-model="consent" type="checkbox" @change="forgetConsent" />我同意使用浏览器语音服务</label
      ><button type="button" :disabled="disabled || !consent" @click="enableVoice">
        启用按住说话
      </button></template>
      <button v-if="!capability.available" type="button" @click="keyboard">返回键盘输入</button>
    </div>
    <template v-if="enabled"
      ><button
        type="button"
        class="hold-button"
        :class="{ recording: active, cancel: state.phase === 'cancel' }"
        :disabled="disabled || state.phase === 'finishing'"
        aria-label="按住说话，松开发送，上滑取消"
        @pointerdown="down"
        @pointerup="up"
        @pointercancel="pointerCancel"
        @keydown="keydown"
        @keyup="keyup"
        @contextmenu.prevent
      >
        <el-icon><Microphone /></el-icon
        >{{
          state.phase === 'cancel'
            ? '松开取消'
            : state.phase === 'starting'
              ? '正在请求麦克风…'
              : state.phase === 'finishing'
              ? '完成识别中…'
              : active
                ? '松开发送 · 上滑取消'
                : '按住说话'
        }}</button
      ><div class="voice-readout" :aria-live="active ? 'off' : 'polite'">
        <p ref="previewElement" class="transcript">{{ state.text || (active ? '等待浏览器返回文字…' : '识别文字会显示在这里') }}</p>
        <p v-if="state.message" class="voice-message" :class="{ error: state.phase === 'error' }" :role="state.phase === 'error' ? 'alert' : 'status'">{{ state.message }}</p>
      </div><div class="voice-actions"><button type="button" class="voice-keyboard" :disabled="active" @click="keyboard">键盘输入</button><button type="button" class="voice-settings" :disabled="active" @click="voiceSettings">语音设置</button></div></template
    >
    <p
      v-if="state.message && !enabled"
      :role="state.phase === 'error' ? 'alert' : 'status'"
      :class="{ error: state.phase === 'error' }"
    >
      {{ state.message }}
    </p>

  </div>
</template>
<style scoped>
.hold-talk {
  width: min(760px, 100%);
  margin-inline: auto;
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
  line-height: 1.6;
  min-width: 0;
  margin: 8px auto;
}
.hold-talk button {
  min-height: 44px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 12px;
  padding: 10px 16px;
  font: inherit;
  font-size: 16px;
  background: var(--assistant-surface, #fff);
  color: var(--assistant-ink, #29323c);
  cursor: pointer;
}
.hold-talk.compact-entry {
  width: auto;
  margin: 0;
  flex: none;
}
.voice-entry {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.hold-button {
  width: 100%;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.hold-talk .recording {
  background: var(--assistant-accent, #0b62db);
  color: #fff;
  border-color: transparent;
}
.hold-talk .cancel {
  background: var(--assistant-danger, #bf303d);
}
.voice-setup {
  max-width: 60ch;
  padding: 12px 0;
}
.voice-setup label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  font-size: 16px;
}
.voice-setup input {
  width: 20px;
  height: 20px;
  accent-color: var(--assistant-accent, #0b62db);
}
.hold-talk .voice-keyboard, .hold-talk .voice-settings {
  border: 0;
  margin-top: 4px;
  background: transparent;
  padding-inline: 4px;
  font-size: 14px;
}
.hold-talk :disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.hold-talk :focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
}
.hold-talk p {
  margin: 8px 0;
}
.voice-readout { height: 112px; box-sizing: border-box; margin-top: 8px; padding: 12px; border-radius: 12px; background: var(--assistant-panel, #f2f5fa); overflow: auto; }
.voice-actions { display: flex; gap: 16px; min-height: 48px; align-items: center; }
.hold-talk .voice-readout p { margin: 0; }
.hold-talk .voice-message { margin-top: 6px; font-size: 12px; }
.hold-talk .hold-button:is(:hover, :active) { transform: none; translate: none; scale: 1; }
.transcript {
  max-height: 52px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--assistant-ink, #29323c);
}
.error {
  color: var(--assistant-danger, #bf303d);
}
</style>
