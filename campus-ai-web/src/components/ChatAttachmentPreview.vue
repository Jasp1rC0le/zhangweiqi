<script setup>
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { startMediaRecognition } from '@/utils/mediaRecognition.js'
import { selectAttachmentExcerpts } from '@/utils/attachmentRetrieval.js'
import { privateMaterialReason } from '@/utils/materialIntake.js'
import { privateOriginalIssue, canRetryAttachment } from '@/utils/attachmentRecovery.js'
import {
  privateMaterialCapabilities,
  savePrivateMaterial,
  listPrivateMaterials,
  readPrivateMaterialText,
  downloadPrivateMaterial,
} from '@/api/privateMaterials'

const props = defineProps({
  scope: String,
  disabled: Boolean,
  limit: Number,
  destinations: { type: Boolean, default: true },
  applyLabel: { type: String, default: '' },
})
const emit = defineEmits(['apply'])
const input = ref(),
  filename = ref(''),
  text = ref(''),
  result = ref(null),
  choice = ref(0),
  purpose = ref('question')
const original = shallowRef(null),
  progress = ref(''),
  question = ref(''),
  fullText = ref(''),
  excerptNotice = ref(''),
  storeConsent = ref(false),
  storeBusy = ref(false),
  storeInfo = ref(null),
  storeNotice = ref(''),
  library = ref(null),
  libraryOpen = ref(false),
  libraryPage = ref(0)
const busy = ref(false),
  error = ref(''),
  recognitionError = ref('')
let task,
  sequence = 0
let storageController,
  uploadRequestId = null,
  uploadText = null
const opened = computed(() => busy.value || !!filename.value || !!error.value)
const originalIssue = computed(() => privateOriginalIssue(original.value))
const retryAllowed = computed(() => canRetryAttachment({
  file: original.value, failed: recognitionError.value, busy: busy.value,
  storeBusy: storeBusy.value, disabled: props.disabled,
  requestId: uploadRequestId, receipt: storeInfo.value,
}))
function reset() {
  sequence++
  task?.cancel()
  task = null
  storageController?.abort()
  original.value = null
  progress.value = question.value = fullText.value = excerptNotice.value = storeNotice.value = ''
  storeConsent.value = storeBusy.value = false
  storeInfo.value = null
  library.value = null
  libraryOpen.value = false
  uploadRequestId = uploadText = null
  busy.value = false
  filename.value = ''
  text.value = ''
  result.value = null
  error.value = ''
  recognitionError.value = ''
  purpose.value = 'question'
  if (input.value) input.value.value = ''
}
watch(() => props.scope, reset, { flush: 'sync' })
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) reset()
  },
)
watch(choice, () => {
  text.value = result.value?.choices?.[choice.value]?.text || ''
  fullText.value = text.value
  excerptNotice.value = ''
})
async function select(event) {
  const file = event.target.files?.[0]
  if (!file || props.disabled) return
  reset()
  filename.value = file.name
  original.value = file
  await recognizeOriginal()
}
async function recognizeOriginal() {
  if(!original.value||props.disabled||busy.value||storeBusy.value||
    uploadRequestId&&!storeInfo.value)return
  const current=++sequence,file=original.value
  recognitionError.value=error.value=progress.value=''
  result.value=null
  text.value=fullText.value=excerptNotice.value=''
  busy.value = true
  try {
    task = startMediaRecognition(file, (message) => {
      if (current === sequence) progress.value = message
    })
    const parsed = await task.promise
    if (current !== sequence) return
    result.value = parsed
    choice.value = 0
    text.value = parsed.choices?.[0]?.text || parsed.text || ''
    fullText.value = text.value
    if(storeInfo.value)storeNotice.value='原件已经私有保存；这次重新识别的文字仅在本页，未覆盖存档。'
  } catch (e) {
    if (current === sequence) recognitionError.value = e.message || '无法解析文件，请换成文字版文件'
  } finally {
    if (current === sequence) {
      busy.value = false
      task = null
    }
  }
}
function excerpts() {
  try {
    const selected = selectAttachmentExcerpts(
      fullText.value,
      question.value,
      Math.min(props.limit || 9000, 9000),
    )
    text.value = selected.text
    excerptNotice.value = `已选${selected.chunks.length}/${selected.total}段。原文保留，可恢复；没有发送模型。`
    error.value = ''
  } catch (e) {
    error.value = e.message
  }
}
function fullDocument() {
  text.value = fullText.value
  excerptNotice.value = ''
}
async function storageTask(work) {
  if (props.disabled || storeBusy.value || busy.value) return
  storageController?.abort()
  storageController = new AbortController()
  const current = sequence,
    scope = props.scope,
    signal = storageController.signal,
    valid = () => current === sequence && props.scope === scope && !props.disabled && !signal.aborted
  storeBusy.value = true
  error.value = ''
  try {
    await work(signal, valid)
  } catch (e) {
    if (valid())
      error.value = e.response?.data?.message || e.message || '原件操作失败，请重试核对。'
  } finally {
    if (valid()) storeBusy.value = false
  }
}
async function retain() {
  await storageTask(async (signal, valid) => {
    if (!original.value || !storeConsent.value || storeInfo.value) return
    if(originalIssue.value)throw new Error(originalIssue.value)
    const capability = await privateMaterialCapabilities(signal)
    if (!valid()) return
    if (!capability.privateOriginals)
      throw new Error('当前服务器尚未启用私有原件库；原件仍在你的设备上。')
    if (!uploadRequestId) {
      uploadRequestId = crypto.randomUUID()
      uploadText = fullText.value
    }
    const file = original.value,
      value = await savePrivateMaterial(file, uploadText, uploadRequestId, signal)
    if (!valid()) return
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
    ]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    if (!valid()) return
    if (value?.sha256 !== hash || value.bytes !== file.size || !value.id)
      throw new Error('原件回执校验失败，请重试同一请求核对；没有创建新上传编号。')
    storeInfo.value = value
    storeNotice.value = uploadText
      ? '原件与提取文字已私有保存并校验，仅当前账号可访问；未发送模型或提交公共资料。'
      : '原件已私有保存并校验，未包含识别文字；未发送模型或提交公共资料。'
  })
}
async function openLibrary(page = 0) {
  libraryOpen.value = true
  await storageTask(async (signal, valid) => {
    const value = await listPrivateMaterials(page, signal)
    if (!valid()) return
    if (!Array.isArray(value.items) || value.items.length > 25 || !Number.isInteger(value.total))
      throw new Error('原件清单响应异常。')
    library.value = value
    libraryPage.value = page
  })
}
async function download(info) {
  await storageTask(async (signal, valid) => {
    const blob = await downloadPrivateMaterial(info, signal)
    if (!valid()) return
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = info.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
}
async function useStored(info) {
  await storageTask(async (signal, valid) => {
    const value = await readPrivateMaterialText(info.id, signal)
    if (!valid()) return
    if (typeof value.text !== 'string' || value.text.length > 500000)
      throw new Error('原件文字响应异常。')
    filename.value = info.name
    recognitionError.value = ''
    original.value = null
    storeInfo.value = info
    fullText.value = text.value = value.text
    result.value = {
      choices: [{ label: '已保存文字', text: value.text }],
      warnings: ['这是保存时的提取文字，需对照原件；不是模型验证结果。'],
    }
    choice.value = 0
    libraryOpen.value = false
  })
}
function apply() {
  const limit = props.destinations && purpose.value !== 'question' ? 50000 : props.limit
  if (props.disabled || busy.value || !text.value.trim() || text.value.length > limit) return
  if (
    props.destinations &&
    (privateMaterialReason(text.value) ||
      /(?:^|\n)[^\n]{0,150}(?:学分|学号)[^\n]{0,100}(?:成绩|绩点)/.test(text.value))
  ) {
    error.value =
      '这是私人身份或学业记录，请只选择“保留原件”，再在聊天问“我的成绩/绩点”；不要加入模型问答或公共资料。'
    return
  }
  emit('apply', {
    name: filename.value,
    text: text.value,
    purpose: props.destinations ? purpose.value : 'local',
  })
  // Parent rejects over-limit combined drafts without losing the preview.
}
defineExpose({ open: () => input.value?.click(), openLibrary: () => openLibrary(), reset })
onBeforeUnmount(reset)
</script>

<template>
  <input
    ref="input"
    class="chat-file-input"
    type="file"
    accept=".pdf,.docx,.xlsx,.txt,.md,.csv,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
    :disabled="disabled"
    aria-label="选择聊天附件"
    @change="select"
  />
  <section
    v-if="opened || libraryOpen"
    class="chat-attachment material-file-preview"
    aria-label="附件文字预览"
  >
    <header>
      <strong>{{ filename || '附件解析' }}</strong
      ><button class="attachment-dismiss" type="button" @click="reset">{{ busy ? '取消解析' : '从本页移除' }}</button>
    </header>
    <p v-if="busy" role="status">{{ progress || '正在本机读取文件…' }}</p>
    <p v-if="storeBusy" role="status">正在核对本人原件…</p>
    <p v-if="error" class="attachment-storage-error" role="alert">{{ error }}</p>
    <div v-if="recognitionError" class="attachment-recovery">
      <p role="alert">识别未完成：{{ recognitionError }}</p>
      <p v-if="originalIssue">{{ originalIssue }}</p>
      <template v-else>
        <p>原文件仍在本页。可重试识别，或经你确认后只保留原件；不会猜测文字。</p>
        <button type="button" :disabled="!retryAllowed" @click="recognizeOriginal">重试识别</button>
        <p v-if="uploadRequestId && !storeInfo">先重试原上传请求核对，再重新识别。若移除本页内容，请到“我的原件”检查；上传可能已经保存。</p>
      </template>
      <button type="button" :disabled="storeBusy || disabled" @click="input?.click()">选择其他文件</button>
    </div>
    <section v-if="libraryOpen" aria-label="我的原件">
      <h3>我的原件</h3>
      <p>仅本人可读，不是公共知识库。每人最多100份；原件与提取文字合计100MiB。</p>
      <p v-if="library && !library.total">还没有保留原件。上传识别后，可选择“保留原件”。</p>
      <ul class="original-list">
        <li v-for="info in library?.items || []" :key="info.id">
          <strong>{{ info.name }}</strong
          ><span>{{ (info.bytes / 1024).toFixed(1) }} KB · {{ info.textLength }}字</span>
          <div>
            <button type="button" :disabled="storeBusy || disabled" @click="useStored(info)">
              读取文字</button
            ><button type="button" :disabled="storeBusy || disabled" @click="download(info)">
              下载原件
            </button>
          </div>
        </li>
      </ul>
      <nav v-if="library && library.total > 25">
        <button
          type="button"
          :disabled="storeBusy || libraryPage === 0"
          @click="openLibrary(libraryPage - 1)"
        >
          上一页</button
        ><span>{{ libraryPage + 1 }} / {{ Math.ceil(library.total / 25) }}</span
        ><button
          type="button"
          :disabled="storeBusy || (libraryPage + 1) * 25 >= library.total"
          @click="openLibrary(libraryPage + 1)"
        >
          下一页
        </button>
      </nav>
    </section>
    <template v-if="result">
      <label v-if="destinations" class="attachment-text-label"
        >这份文件用来做什么？
        <select v-model="purpose" aria-label="文件用途">
          <option value="question">只用于这次问答</option>
          <option value="knowledge">提交校园资料审核</option>
          <option value="merchant">整理商家资料</option>
        </select>
      </label>
      <label v-if="result.choices?.length > 1"
        >选择内容
        <select v-model="choice">
          <option v-for="(item, index) in result.choices" :key="index" :value="index">
            {{ item.label }}
          </option>
        </select></label
      >
      <label class="attachment-text-label"
        >确认文字，可删减敏感内容<textarea v-model="text" rows="4" aria-label="附件文字" />
      </label>
      <div v-if="fullText.length > 2000" class="excerpt-controls">
        <label
          >长文想问什么？<input
            v-model="question"
            maxlength="1000"
            placeholder="输入问题或关键词，按原文选段" /></label
        ><button type="button" :disabled="disabled || busy || storeBusy" @click="excerpts">
          选出相关原文段落</button
        ><button v-if="excerptNotice" type="button" @click="fullDocument">恢复全部文字</button>
        <p v-if="excerptNotice" role="status">{{ excerptNotice }}</p>
      </div>
      <p v-for="warning in result.warnings || []" :key="warning">{{ warning }}</p>
      <p v-if="destinations && purpose === 'question'">
        默认仅在本机读取。加入输入框后，点击发送才将选定文字交给所选模型；不进入公共知识库。不要加入私人名册、考勤或个人课表。
      </p>
      <p v-else>
        整理不会发送模型。之后仍需核对内容、预览并人工确认提交；保留原件与公开提交是两件事。
      </p>
      <p>
        单份10MB：文档、图片和扫描PDF识字；视频限3分钟，仅抽样画面文字。长文可按问题选段，原文不截断。
      </p>
    </template>
      <details v-if="destinations && (storeInfo || original && !originalIssue && !busy)" class="original-retention">
        <summary>保留原件，仅本人可见</summary>
        <p class="retention-copy">
          保存在网站私有资料库，不自动公开或发送模型。电脑换设备后仍可下载；这不是学校异地备份。
        </p>
        <p v-if="recognitionError && !storeInfo" class="retention-copy">本次只保留原文件，不附识别文字；保存不代表文件可解析或内容已核实。</p>
        <template v-if="original && !storeInfo"
          ><label class="retain-consent"
            ><input
              v-model="storeConsent"
              type="checkbox"
              :disabled="storeBusy"
            />{{ fullText ? '我确认将原件和提取文字保存到本人的资料库' : '我确认只将原文件保存到本人的资料库' }}</label
          ><button type="button" :disabled="!storeConsent || storeBusy || disabled" @click="retain">
            {{ uploadRequestId ? '重试原上传请求' : '私有保存原件' }}
          </button></template
        ><button
          v-if="storeInfo"
          type="button"
          :disabled="storeBusy || disabled"
          @click="download(storeInfo)"
        >
          下载已校验原件
        </button>
        <p v-if="storeNotice" class="retention-copy" role="status">{{ storeNotice }}</p>
      </details>
      <footer v-if="result">
        <span
          :class="{
            'over-limit': text.length > (destinations && purpose !== 'question' ? 50000 : limit),
          }"
          >{{ text.length.toLocaleString() }} /
          {{ (destinations && purpose !== 'question' ? 50000 : limit).toLocaleString() }} 字符</span
        ><button
          type="button"
          :disabled="
            disabled ||
            !text.trim() ||
            text.length > (destinations && purpose !== 'question' ? 50000 : limit)
          "
          @click="apply"
        >
          {{ applyLabel || (purpose === 'question' ? '将文字加入输入框' : '交给本地整理') }}
        </button>
      </footer>
  </section>
</template>

<style scoped>
.chat-file-input {
  display: none;
}
.chat-attachment.material-file-preview {
  box-sizing: border-box;
  max-width: 100%;
  padding: 16px;
  margin: 12px 0;
  background: var(--assistant-panel, #f2f5fa);
  color: var(--assistant-ink, #29323c);
  border-radius: 12px;
  overflow-wrap: anywhere;
}
.material-file-preview header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.material-file-preview header strong {
  min-width: 0;
  overflow-wrap: anywhere;
}
.material-file-preview label {
  display: grid;
  gap: 7px;
  margin: 12px 0;
}
.chat-attachment.material-file-preview :is(p, label) {
  font-size: 14px;
  line-height: 1.65;
}
.chat-attachment.material-file-preview :is(select, textarea, button, input:not([type='checkbox'])) {
  box-sizing: border-box;
  min-height: 44px;
  max-width: 100%;
  font: inherit;
  font-size: 16px;
  color: inherit;
  background: var(--assistant-surface, #fff);
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 10px;
  padding: 10px 12px;
}
.material-file-preview textarea {
  width: 100%;
  resize: vertical;
}
.material-file-preview summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  font-size: 16px;
}
.material-file-preview .retain-consent {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
}
.retain-consent input {
  width: 20px;
  height: 20px;
  flex: none;
  accent-color: var(--assistant-accent, #0b62db);
}
.original-list {
  list-style: none;
  padding: 0;
  max-height: 300px;
  overflow: auto;
}
.original-list li {
  padding: 14px 0;
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.original-list :is(strong, span) {
  display: block;
}
.original-list li > div,
.excerpt-controls,
.attachment-recovery {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.excerpt-controls label,
.excerpt-controls p,
.attachment-recovery p {
  width: 100%;
}
.chat-attachment.material-file-preview .attachment-recovery p:not([role]) {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
}
.chat-attachment.material-file-preview .attachment-recovery p[role='alert'] {
  margin: 0;
  font-size: 16px;
  line-height: 1.65;
  color: var(--assistant-warning, #9a5400);
}
.chat-attachment.material-file-preview p.attachment-storage-error[role='alert'] {
  font-size: 14px;
  line-height: 1.65;
  color: var(--assistant-warning, #9a5400);
}
.chat-attachment.material-file-preview .original-retention :is(.retention-copy, .retain-consent) {
  font-size: 14px;
  line-height: 1.65;
}
.chat-attachment.material-file-preview header button.attachment-dismiss[type='button'] {
  min-height: 44px;
}
.material-file-preview footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  position: sticky;
  bottom: -14px;
  z-index: 1;
  padding-block: 10px;
  background: var(--assistant-panel, #f2f5fa);
}
.material-file-preview footer button {
  color: #fff !important;
  background: var(--assistant-accent, #0b62db) !important;
  border-color: transparent !important;
}
.material-file-preview :focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
}
</style>
