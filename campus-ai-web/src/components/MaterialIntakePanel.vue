<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getAdminCanteens, getAdminCanteenMerchants } from '@/api/admin'
import { getMyKnowledgeSubmissions } from '@/api/knowledgeSubmission'
import {
  materialCapabilities,
  executeMaterialAction,
  readMaterialReceipt,
} from '@/api/materialActions'
import { createMaterialReceiptStore } from '@/utils/materialReceiptStore'
import {
  createMaterialResource,
  MATERIAL_HELP,
  MATERIAL_TEXT_LIMIT,
  organizeMaterial,
} from '@/utils/materialIntake'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import ChatAttachmentPreview from './ChatAttachmentPreview.vue'

const props = defineProps({
  scope: { type: String, required: true },
  user: { type: Object, required: true },
  seed: { type: Object, default: () => ({}) },
  active: { type: Boolean, default: true },
  embedded: Boolean,
})
const emit = defineEmits(['state', 'done'])
const mode = props.seed.mode === 'merchant' ? 'merchant' : 'knowledge'
const help = MATERIAL_HELP[mode],
  source = ref(props.seed.text || ''),
  fileName = ref(props.seed.fileName || '')
if (/^(?:上传资料|提交校园资料|新增商家|整理商家资料|补充校园信息)[。！!\s]*$/.test(source.value))
  source.value = ''
const empty = () => ({
  mode,
  question: '',
  content: '',
  sourceUrl: '',
  name: '',
  canteenName: '',
  canteenId: '',
  location: '',
  description: '',
  contactName: '',
  contact: '',
  publicConsent: false,
})
const form = reactive(empty()),
  state = reactive({
    busy: false,
    phase: 'editing',
    preview: null,
    error: '',
    notice: '',
    verified: false,
  })
const attachment = ref(),
  confirmation = ref(),
  previewElement = ref(),
  sourceInput = ref(),
  organized = ref(false),
  canteens = ref([]),
  catalogError = ref(''),
  catalogLoading = ref(false)
let disposed = false,
  generation = 0,
  catalogController
const owner = () => (props.active ? props.scope : '')
const resource = createMaterialResource({
  owner,
  state,
  journal: createMaterialReceiptStore(
    {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    import.meta.env.DEV && window.location.pathname === '/design-review.html'
      ? 'campthink.material-pending.demo.v1'
      : undefined,
  ),
  receiptOwner: () => `${props.user.schoolId}:${props.user.id}`,
  api: {
    canteens: (signal) => getAdminCanteens({ signal }),
    merchants: (signal) => getAdminCanteenMerchants({ signal }),
    mine: (signal) => getMyKnowledgeSubmissions({ signal }),
    capabilities: materialCapabilities,
    execute: executeMaterialAction,
    receipt: readMaterialReceipt,
  },
})
const administrator = computed(() => props.user?.role === 'ADMIN')
const busy = computed(() => state.busy || catalogLoading.value)
const locked = computed(
  () =>
    busy.value ||
    !props.active ||
    ['sending', 'uncertain', 'saved', 'preview'].includes(state.phase),
)
const dirty = computed(
  () => Boolean(source.value.trim() || organized.value) && state.phase !== 'saved',
)
useUnsavedChanges(
  () => !props.embedded && props.active && dirty.value,
  () => !props.embedded && busy.value,
)
const finalAction = computed(() =>
  mode === 'knowledge'
    ? '确认提交审核'
    : administrator.value
      ? '确认保存商家草稿'
      : '确认提交商家申请',
)

async function loadCanteens() {
  if (mode !== 'merchant' || !administrator.value || !props.active || busy.value) return
  catalogController?.abort()
  catalogController = new AbortController()
  const epoch = ++generation,
    key = props.scope
  catalogLoading.value = true
  catalogError.value = ''
  try {
    const rows = await getAdminCanteens({ signal: catalogController.signal })
    if (disposed || epoch !== generation || !props.active || key !== props.scope) return
    if (
      !Array.isArray(rows) ||
      rows.length > 2000 ||
      rows.some(
        (r) =>
          !Number.isSafeInteger(r.id) ||
          r.id < 1 ||
          typeof r.name !== 'string' ||
          !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(r.status),
      ) ||
      new Set(rows.map((r) => r.id)).size !== rows.length
    )
      throw new Error('食堂列表响应异常，请重新读取。')
    canteens.value = rows.filter((r) => r.status !== 'ARCHIVED')
    matchCanteen()
  } catch (error) {
    if (!disposed && epoch === generation && key === props.scope)
      catalogError.value =
        error.response?.data?.message || error.message || '食堂尚未读取，请重试。'
  } finally {
    if (!disposed && epoch === generation && key === props.scope) catalogLoading.value = false
  }
}
function matchCanteen() {
  if (!administrator.value) return
  const matches = canteens.value.filter((r) => r.name === form.canteenName)
  form.canteenId = matches.length === 1 ? matches[0].id : ''
}
function organize() {
  if (locked.value) return false
  try {
    const result = organizeMaterial(source.value, mode, { fileName: fileName.value })
    Object.assign(form, empty(), result.draft)
    matchCanteen()
    organized.value = true
    state.notice = '已在本机整理为待核对草稿，没有发送模型或保存。请补齐下方缺项，再预览。'
    state.error = ''
    return true
  } catch (error) {
    state.error = error.message
    return false
  }
}
function applyFile(payload) {
  if (locked.value) return
  const next = source.value.trim() ? `${source.value}\n\n${payload.text}` : payload.text
  if (next.length > MATERIAL_TEXT_LIMIT) {
    state.error = '合并后超过5万字符，请删减或分次整理；原资料和文件预览保留。'
    return
  }
  source.value = next
  fileName.value = payload.name
  attachment.value?.reset()
  organize()
}
async function prepare() {
  if (locked.value || !organized.value) return false
  const ok = await resource.prepare(form, props.user)
  if (ok) state.notice = '预览已就绪。请核对内容并点击下方确认；尚未提交。'
  await nextTick()
  if (ok && props.active)
    previewElement.value?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  return ok
}
function close() {
  if (busy.value) return
  emit(
    'done',
    state.phase === 'saved'
      ? { message: state.notice, saved: true, verified: state.verified }
      : state.phase === 'uncertain'
        ? '本次资料面板已收起；此前提交结果仍未知，请先到原入口核对，不要重复提交。'
        : '本次资料整理已取消，没有提交或发布。',
  )
}
async function handleFollowup(text, requestScope) {
  if (
    !props.active ||
    requestScope !== props.scope ||
    busy.value ||
    ['uncertain', 'saved'].includes(state.phase)
  )
    return {
      accepted: false,
      preserveInput: true,
      message: '当前资料正在处理或已冻结，请先核对结果；没有保存或发送模型。',
    }
  if (/^(?:取消|算了|不提交|不保存)[。！!\s]*$/.test(text.trim())) {
    close()
    return { accepted: true, closed: true, message: '资料草稿已收起，没有新增提交。' }
  }
  if (/^(?:确认|确认保存|确认提交|提交|保存)[。！!\s]*$/.test(text.trim())) {
    await nextTick()
    confirmation.value?.focus()
    confirmation.value?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
    return {
      accepted: true,
      message: state.preview
        ? '请阅读预览，再点击资料面板中的确认按钮；这条消息没有执行提交。'
        : '请先整理资料、补齐缺项并预览；没有提交。',
    }
  }
  if (/^(?:预览|核对|看一下预览)[。！!\s]*$/.test(text.trim())) {
    if (!organized.value && !organize())
      return { accepted: false, preserveInput: true, message: state.error }
    const ok = await prepare()
    return {
      accepted: ok,
      preserveInput: !ok,
      message: ok
        ? '预览已生成，仍需点击人工确认按钮。'
        : state.error || '请在面板补齐缺项后再预览。',
    }
  }
  try {
    const patch = organizeMaterial(text, mode, { patch: true }).draft
    if (organized.value && Object.keys(patch).length) {
      resource.invalidate()
      Object.assign(form, patch, { publicConsent: false })
      matchCanteen()
      return {
        accepted: true,
        message: '明确字段已更新，原预览失效；请重新核对并勾选公开范围，没有提交。',
      }
    }
    if (source.value.length + text.length + 1 > MATERIAL_TEXT_LIMIT)
      throw new Error('合并后超过5万字符，请在资料面板删减后整理。')
    source.value = `${source.value}${source.value ? '\n' : ''}${text}`
    return {
      accepted: organize(),
      preserveInput: Boolean(state.error),
      message: state.error || '资料已合并并在本机整理，请核对缺项；没有提交。',
    }
  } catch (error) {
    return { accepted: false, preserveInput: true, message: error.message }
  }
}
defineExpose({ handleFollowup, dirty, busy })
watch(form, () => resource.invalidate(), { deep: true, flush: 'sync' })
watch(
  source,
  () => {
    resource.invalidate()
    organized.value = false
  },
  { flush: 'sync' },
)
watch(
  [busy, dirty, () => state.phase],
  () => emit('state', { busy: busy.value, pending: dirty.value, phase: state.phase }),
  { immediate: true },
)
watch(
  [() => props.scope, () => props.active, () => props.user?.role],
  () => {
    generation++
    catalogController?.abort()
    catalogLoading.value = false
    resource.reset()
    source.value = ''
    fileName.value = ''
    Object.assign(form, empty())
    organized.value = false
    canteens.value = []
    catalogError.value = ''
    attachment.value?.reset()
  },
  { flush: 'sync' },
)
onMounted(async () => {
  if (source.value.trim()) organize()
  await resource.resume()
  if (!disposed) void loadCanteens()
})
onBeforeUnmount(() => {
  disposed = true
  generation++
  catalogController?.abort()
  resource.dispose()
})
</script>

<template>
  <section class="material-intake" :aria-label="help.title" :aria-busy="busy">
    <header>
      <h2>{{ help.title }}</h2>
      <p>{{ help.required }}</p>
    </header>
    <p class="intake-boundary">{{ help.result }}</p>
    <details class="intake-help">
      <summary>可以发什么？还需要准备什么？</summary>
      <p>{{ help.optional }}</p>
      <p>
        文字可直接粘贴；支持PDF、DOCX、XLSX、TXT、MD、CSV，以及图片和扫描PDF识字，每份10
        MB内。视频限3分钟，只识别抽样画面中的文字，不识别声音或完整情节。旧DOC/XLS请先转换为新格式。
        此处在本机提取文字，不上传原文件，也不调用外部模型整理。
      </p>
    </details>
    <template v-if="state.phase === 'editing'">
      <label class="intake-source"
        >{{ mode === 'merchant' ? '把店铺信息发到这里' : '把原文、说明或链接发到这里' }}
        <textarea
          ref="sourceInput"
          v-model="source"
          :disabled="locked"
          :maxlength="MATERIAL_TEXT_LIMIT"
          rows="4"
          :placeholder="
            mode === 'merchant'
              ? '店名：示例面馆；所属食堂：第一食堂；位置：二楼08档口；主营：牛肉面。这里的内容由你提供，不会补造。'
              : '例如：图书馆借阅说明。粘贴正文，再附上官网原文链接；也可以添加文件。'
          "
        ></textarea>
      </label>
      <div class="intake-actions">
        <button type="button" :disabled="locked" @click="attachment.open()">添加资料文件</button
        ><button
          class="primary"
          type="button"
          :disabled="locked || !source.trim()"
          @click="organize"
        >
          {{ organized ? '重新整理草稿' : '整理成草稿' }}
        </button>
      </div>
      <ChatAttachmentPreview
        ref="attachment"
        :scope="scope"
        :disabled="locked"
        :limit="MATERIAL_TEXT_LIMIT"
        :destinations="false"
        apply-label="添加并整理"
        @apply="applyFile"
      />
      <form
        v-if="organized && state.phase !== 'preview'"
        class="intake-draft"
        @submit.prevent="prepare"
      >
        <h3>核对整理结果</h3>
        <template v-if="mode === 'knowledge'">
          <label
            >资料标题 / 对应问题<input
              v-model="form.question"
              :disabled="locked"
              maxlength="1000"
              required
          /></label>
          <label
            >来源链接（选填）<input
              v-model="form.sourceUrl"
              :disabled="locked"
              type="url"
              maxlength="1000"
              placeholder="没有链接也能提交，但不能当作已核实原文"
          /></label>
          <label
            >待审核正文<textarea
              v-model="form.content"
              :disabled="locked"
              rows="6"
              maxlength="100000"
              required
            ></textarea>
          </label>
        </template>
        <template v-else>
          <label
            >商家名称<input
              v-model="form.name"
              :disabled="locked"
              maxlength="120"
              required
              placeholder="还没有识别到店名，请补充"
          /></label>
          <label v-if="administrator"
            >所属食堂<select v-model="form.canteenId" :disabled="locked || catalogLoading" required>
              <option value="">
                {{ catalogLoading ? '正在读取本校食堂…' : '选择本校食堂，不会按相似名字猜测' }}
              </option>
              <option v-for="item in canteens" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select></label
          >
          <label v-else
            >所属食堂<input
              v-model="form.canteenName"
              :disabled="locked"
              maxlength="120"
              required
              placeholder="例如：第一食堂"
          /></label>
          <p v-if="catalogError" role="alert">
            {{ catalogError }}
            <button type="button" :disabled="busy" @click="loadCanteens">重新读取食堂</button>
          </p>
          <p v-if="administrator && !catalogLoading && !catalogError && !canteens.length">
            本校还没有食堂。请先在商家管理新增食堂，再回来保存商家草稿。
          </p>
          <label
            >楼层 / 档口（选填）<input v-model="form.location" :disabled="locked" maxlength="120"
          /></label>
          <label
            >卖什么 / 简介（选填）<textarea
              v-model="form.description"
              :disabled="locked"
              maxlength="1000"
              rows="3"
            ></textarea>
          </label>
          <template v-if="!administrator"
            ><p>你当前不是管理员。申请交给管理员核实，回复方式不会自动公开。</p>
            <label
              >申请人称呼<input
                v-model="form.contactName"
                :disabled="locked"
                required
                maxlength="80" /></label
            ><label
              >回复方式<input
                v-model="form.contact"
                :disabled="locked"
                required
                maxlength="120"
                placeholder="填写你愿意提供给管理员的邮箱或联系方式" /></label
          ></template>
        </template>
        <label class="intake-consent"
          ><input
            v-model="form.publicConsent"
            type="checkbox"
            :disabled="locked"
          />已核对资料可交管理员核实，不含私人名单、成绩、考勤或课表</label
        >
        <button class="primary" :disabled="locked || !form.publicConsent">
          {{ busy ? '正在核对…' : '预览提交内容' }}
        </button>
      </form>
    </template>
    <p v-if="state.notice" class="intake-notice" role="status">{{ state.notice }}</p>
    <p v-if="state.error" class="intake-error" role="alert">{{ state.error }}</p>
    <section
      v-if="state.preview"
      ref="previewElement"
      class="intake-preview"
      aria-label="资料提交预览"
    >
      <h3>{{ state.preview.title }}</h3>
      <ul>
        <li v-for="line in state.preview.lines" :key="line">{{ line }}</li>
      </ul>
      <details>
        <summary>展开核读完整内容</summary>
        <pre>{{ mode === 'knowledge' ? form.content : form.description || '未填写介绍' }}</pre>
      </details>
      <div class="intake-actions">
        <button
          ref="confirmation"
          class="primary"
          type="button"
          :disabled="busy"
          @click="resource.execute(form, user)"
        >
          {{ busy ? '正在提交…' : finalAction }}</button
        ><button type="button" :disabled="busy" @click="resource.invalidate">返回修改</button>
      </div>
    </section>
    <div v-if="['saved', 'uncertain'].includes(state.phase)" class="intake-actions">
      <button v-if="!state.verified" type="button" :disabled="busy" @click="resource.verify">
        核对原请求回执，不重发</button
      ><RouterLink v-if="mode === 'merchant' && administrator && !embedded" to="/admin"
        >到商家管理上传照片 / 核实发布</RouterLink
      ><button type="button" :disabled="busy" @click="close">完成本次整理</button>
    </div>
    <button v-else class="intake-cancel" type="button" :disabled="busy" @click="close">
      {{ state.phase === 'uncertain' ? '收起，先到原入口核对' : '取消，不提交' }}
    </button>
  </section>
</template>

<style scoped>
.material-intake {
  color: var(--assistant-ink, #29323c);
  font-size: 16px;
  line-height: 1.7;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
}
.material-intake header {
  margin-bottom: 14px;
}
.material-intake h2 {
  font-size: 22px;
  line-height: 1.4;
  letter-spacing: -0.02em;
  margin: 0 0 8px;
  font-weight: 600;
}
.material-intake h3 {
  font-size: 18px;
  line-height: 1.5;
  margin: 0 0 12px;
}
.material-intake p {
  margin: 10px 0;
  max-width: 72ch;
}
.intake-boundary {
  color: var(--assistant-accent-hover, #084db0);
}
.intake-help {
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
  margin: 16px 0;
}
.intake-help summary,
.intake-preview summary {
  cursor: pointer;
  min-height: 44px;
  display: flex;
  align-items: center;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.intake-source,
.intake-draft label {
  display: grid;
  gap: 8px;
  margin: 16px 0;
  font-size: 16px;
}
.material-intake input,
.material-intake select,
.material-intake textarea,
.material-intake button {
  box-sizing: border-box;
  font: inherit;
  font-size: 16px;
  min-height: 44px;
  max-width: 100%;
  min-width: 0;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 12px;
  padding: 10px 14px;
  color: inherit;
  background: var(--assistant-surface, #fff);
  caret-color: var(--assistant-accent, #0b62db);
}
.material-intake textarea {
  width: 100%;
  resize: vertical;
  line-height: 1.65;
}
.material-intake button {
  cursor: pointer;
}
.material-intake button.primary {
  background: var(--assistant-accent, #0b62db);
  border-color: transparent;
  color: #fff;
}
.material-intake button.primary:hover:not(:disabled) {
  background: var(--assistant-accent-hover, #084db0);
}
.material-intake button:hover:not(:disabled) {
  background: var(--assistant-soft, #eaf2ff);
}
.material-intake :disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.material-intake :focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
}
.intake-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 16px 0;
}
.intake-actions a {
  color: var(--assistant-accent-hover, #084db0);
  padding: 10px 0;
  min-height: 44px;
  box-sizing: border-box;
  text-underline-offset: 4px;
}
.intake-draft,
.intake-preview {
  margin-top: 24px;
  padding-top: 22px;
  border-top: 1px solid var(--assistant-line, #e2e7ec);
}
.intake-consent {
  display: flex !important;
  align-items: flex-start;
  gap: 10px;
  font-size: 14px !important;
}
.intake-consent input {
  width: 22px;
  height: 22px;
  min-height: 22px;
  flex: none;
  margin-top: 3px;
  accent-color: var(--assistant-accent, #0b62db);
}
.intake-error {
  color: var(--assistant-danger, #bf303d);
}
.intake-notice {
  color: var(--assistant-muted, #5d6876);
}
.intake-preview ul {
  padding-inline-start: 22px;
}
.intake-preview pre {
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  font: inherit;
}
.intake-cancel {
  margin-top: 12px;
}
.material-intake ::selection {
  background: var(--assistant-soft, #eaf2ff);
}
@media (max-width: 600px) {
  .material-intake h2 {
    font-size: 20px;
  }
  .intake-actions > button {
    flex: 1 1 135px;
  }
  .intake-preview ul {
    padding-inline-start: 18px;
  }
}
</style>
