<script setup>
import { reactive, ref, watch, onBeforeUnmount } from 'vue'
import { submitContactMessage } from '@/api/contact'
import { useAuthStore } from '@/stores/auth'
import { createDraftCheckpoint } from '@/utils/draftCheckpoint'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import FormDraftRecovery from '@/components/FormDraftRecovery.vue'
import { feedbackFormRecovery } from '@/utils/formDraftRecovery'
import { useFormDraftRecovery } from '@/utils/useFormDraftRecovery'

const auth = useAuthStore()
const busy = ref(false), error = ref(''), status = ref(''), conflict = ref(false)
const form = reactive({ name: auth.user?.nickname || '', contact: '', subject: '', message: '' })
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
  const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
  if (Object.values(payload).some(value => !value)) {
    error.value = '请完整填写称呼、联系方式、主题和具体意见，不能只填空格'
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
  <div class="work-page">
    <header class="work-heading"><div><h1>让它更好</h1><p>哪里不顺手，或哪一步还缺工具，直接告诉我们</p></div></header>
    <FormDraftRecovery :state="draftState" :pending="Boolean(draftPending)" :busy="busy" :enabled-allowed="Boolean(auth.user?.id)"
      scope="反馈" :notice="draftNotice" storage-description="保留最近一份反馈的主题、正文和提交编号，不保留称呼、联系方式字段；正文中自行填写的个人信息仍会暂存"
      @toggle="drafts.toggle" @restore="restoreDraft" @discard="drafts.discard" />
    <form class="feedback-work" :aria-busy="busy" @submit.prevent="submit" @input="status = ''; error = ''">
      <fieldset class="work-form" :disabled="busy">
        <legend class="sr-only">意见反馈</legend>
        <label>称呼<input v-model="form.name" required maxlength="80" autocomplete="name" placeholder="怎么称呼你" /></label>
        <label>联系方式<input v-model="form.contact" required maxlength="120" placeholder="用于回复你的反馈" /></label>
        <label>主题<input v-model="form.subject" required maxlength="120" placeholder="例如：实验数据导入失败" /></label>
        <label>具体意见<textarea v-model="form.message" required maxlength="5000" rows="7" placeholder="告诉我们你操作了什么、期待什么、实际发生了什么"></textarea></label>
        <small>仅管理员可见，不在校园墙公开。官方邮箱 contact@campthinkhub.cn</small>
        <p v-if="status" class="work-status" role="status">{{ status }}</p>
        <p v-if="error" class="work-error" role="alert">{{ error }}</p>
        <p v-if="conflict" class="work-status">原反馈已经收到，当前修改没有覆盖它。确需补充时，可<button type="button" class="work-button" @click="startSupplement">把修改作为新反馈</button></p>
        <div><button class="work-button primary" :disabled="busy||conflict">{{ busy ? '正在提交…' : '提交意见' }}</button></div>
      </fieldset>
    </form>
  </div>
</template>

<style scoped>
.feedback-work { max-width: 760px; }
fieldset { margin-inline: 0; min-width: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
