<script setup>
import { reactive, ref, watch, onBeforeUnmount } from 'vue'
import { submitContactMessage } from '@/api/contact'
import { useAuthStore } from '@/stores/auth'
import { createDraftCheckpoint } from '@/utils/draftCheckpoint'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import FormDraftRecovery from '@/components/FormDraftRecovery.vue'
import { feedbackFormRecovery } from '@/utils/formDraftRecovery'
import { useFormDraftRecovery } from '@/utils/useFormDraftRecovery'
import { feedbackPayload } from '@/utils/feedbackForm'

const auth = useAuthStore()
const busy = ref(false), error = ref(''), status = ref(''), conflict = ref(false)
const form = reactive({ name: auth.user?.nickname || auth.user?.username || '', contact: '', subject: '', message: '' })
const checkpoint = createDraftCheckpoint(() => form)
const requestId = ref(crypto.randomUUID())
const initialName = form.name
const drafts = useFormDraftRecovery(feedbackFormRecovery, () => form.subject || form.message
  ? [{id:requestId.value,subject:form.subject,message:form.message}] : [])
const {state:draftState,pending:draftPending,notice:draftNotice} = drafts
useUnsavedChanges(checkpoint.isDirty, () => busy.value,
  () => form.name === initialName && !form.contact && drafts.hasCurrent())
watch(() => [form.subject,form.message], () => drafts.save(), {flush:'sync'})
let disposed = false
const lifetime = new AbortController()
onBeforeUnmount(() => { disposed = true; lifetime.abort() })
function startSupplement() {
  if(busy.value || !conflict.value)return
  requestId.value=crypto.randomUUID();conflict.value=false;error.value='';drafts.save()
  status.value='已按新反馈准备，尚未提交；原反馈保持不变'
}
function restoreDraft() {
  if (busy.value) return
  if (form.subject || form.message) { draftNotice.value = '当前已填写内容，请先自行保留或清空，恢复不会覆盖你的输入'; return }
  const value = drafts.peek()
  if (!value) return
  requestId.value = value.id; form.subject = value.subject; form.message = value.message
  drafts.restored()
  draftNotice.value = '已恢复主题和正文；称呼、联系方式需要重新确认，不会自动提交'
}

async function submit() {
  if (busy.value) return
  status.value = ''; error.value = ''
  const payload = feedbackPayload(form, auth.user?.nickname || auth.user?.username)
  if (Object.values(payload).some(value => !value)) {
    error.value = payload.name ? '请填写联系方式和具体意见' : '请在更多选项补充称呼'
    return
  }
  busy.value = true
  try {
    await submitContactMessage({...payload,requestId:requestId.value},{signal:lifetime.signal})
    if (disposed) return
    form.subject = ''; form.message = ''
    requestId.value = crypto.randomUUID()
    drafts.save()
    checkpoint.accept()
    status.value = '意见已送达管理员，谢谢你的反馈'
  } catch (e) {
    if (!disposed) {
      conflict.value=e.response?.status===409
      error.value = e.response?.data?.message || (e.code==='COMPAT_REQUIRED'?e.message:'未能确认提交成功，内容已保留，请稍后重试')
    }
  } finally { if (!disposed) busy.value = false }
}
</script>

<template>
  <div class="work-page feedback-page">
    <header class="work-heading"><h1>意见反馈</h1></header>
    <form class="feedback-work" :aria-busy="busy" @submit.prevent="submit" @input="status = ''; error = ''">
      <fieldset class="feedback-fields" :disabled="busy">
        <legend class="sr-only">意见反馈</legend>
        <label>具体意见<textarea v-model="form.message" required maxlength="5000" rows="5" placeholder="遇到了什么问题？"></textarea></label>
        <label>回复方式<input v-model="form.contact" required maxlength="120" placeholder="邮箱或其他联系方式" /></label>
        <details class="feedback-options" :open="Boolean(draftPending)">
          <summary>更多选项</summary>
          <label>称呼<input v-model="form.name" maxlength="80" autocomplete="name" /></label>
          <label>主题<input v-model="form.subject" maxlength="120" placeholder="默认使用正文第一行" /></label>
          <FormDraftRecovery :state="draftState" :pending="Boolean(draftPending)" :busy="busy" :enabled-allowed="Boolean(auth.user?.id)"
            scope="反馈" :notice="draftNotice" storage-description="保留主题、正文和提交编号，不保存称呼和联系方式；正文内自行填写的个人信息也会暂存"
            @toggle="drafts.toggle" @restore="restoreDraft" @discard="drafts.discard" />
        </details>
        <small>仅管理员可见 · <a href="mailto:contact@campthinkhub.cn">联系邮箱</a></small>
        <p v-if="status" class="work-status" role="status">{{ status }}</p>
        <p v-if="error" class="work-error" role="alert">{{ error }}</p>
        <p v-if="conflict" class="work-status">原反馈已经收到，当前修改没有覆盖它。确需补充时，可<button type="button" class="work-button" @click="startSupplement">把修改作为新反馈</button></p>
        <div><button class="work-button primary" :disabled="busy||conflict">{{ busy ? '正在提交…' : '提交意见' }}</button></div>
      </fieldset>
    </form>
  </div>
</template>

<style scoped>
.feedback-work { max-width: 680px; }
.feedback-fields { display: grid; gap: 22px; border: 0; padding: 0; margin: 0; min-width: 0; }
.feedback-fields label { display: grid; gap: 8px; font-size: 14px; font-weight: 500; }
.feedback-fields input, .feedback-fields textarea { box-sizing: border-box; width: 100%; padding: 12px 14px; border: 1px solid var(--assistant-line); border-radius: 12px; background: var(--assistant-surface, #fff); color: var(--assistant-ink); font: inherit; font-size: 16px; }
.feedback-fields textarea { min-height: 160px; resize: vertical; line-height: 1.6; }
.feedback-fields :is(input,textarea):focus-visible { outline: 2px solid var(--assistant-accent); outline-offset: 2px; }
.feedback-fields small { color: var(--assistant-muted); font-size: 13px; }
.feedback-fields a { color: var(--assistant-accent-hover); text-underline-offset: 3px; }
.feedback-options summary { min-height: 44px; align-content: center; cursor: pointer; font-size: 14px; }
.feedback-options label { margin-block: 14px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
