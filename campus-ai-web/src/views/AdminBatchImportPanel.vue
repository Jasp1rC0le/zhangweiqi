<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DocumentAdd, Link, OfficeBuilding } from '@element-plus/icons-vue'
import {
  importKnowledgeBatch, previewKnowledgeFiles, previewKnowledgeSite, previewKnowledgeUrl,
  reviseKnowledgeBatch,
} from '@/api/admin'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { createBatchImportScope } from '@/utils/batchImportScope'

const props = defineProps({ schoolId: { type: Number, required: true } })
const emit = defineEmits(['published'])
const drafts = ref([])
const url = ref('')
const urlMode = ref('page')
const siteMaxPages = ref(10)
const siteMaxDepth = ref(2)
const restrictToPath = ref(true)
const crawlSummary = ref(null)
const parsing = ref(false)
const publishing = ref(false)
const error = ref('')
const errorBox = ref(null)
const readyCount = computed(() => drafts.value.filter((item) => !item.duplicateDocumentId).length)
const auth = useAdminAuthStore()
const owner = computed(() => auth.user?.schoolId === props.schoolId
  ? `${auth.user.id}:${props.schoolId}` : '')
const scope = createBatchImportScope(() => owner.value)
const { confirming, confirm } = useScopedConfirmation(scope.key, () => Boolean(owner.value))
const busy = computed(() => parsing.value || publishing.value || confirming.value)
const dirty = computed(() => drafts.value.length > 0 || Boolean(url.value.trim()))
let draftGeneration = 0
watch(() => [drafts.value, url.value], () => { draftGeneration++ }, { deep: true, flush: 'sync' })
const draftKey = () => scope.key() ? `${scope.key()}:${draftGeneration}` : null
defineExpose({ busy, dirty, draftKey })
watch(owner, () => {
  scope.invalidate()
  drafts.value = []
  url.value = ''
  crawlSummary.value = null
  error.value = ''
  parsing.value = false
  publishing.value = false
}, { flush: 'sync' })
onBeforeUnmount(scope.dispose)
let nextKey = 0

async function reportError(message, current = () => true) {
  if (!current()) return
  error.value = message
  await nextTick()
  if (current()) errorBox.value?.focus()
}

function addPreviews(previews) {
  for (const preview of previews) {
    drafts.value.push({
      key: ++nextKey,
      title: preview.title || '',
      category: '校园事务',
      sourceDepartment: '',
      sourceUrl: preview.sourceUrl || '',
      publishedAt: '',
      effectiveAt: '',
      expiresAt: '',
      content: preview.content || '',
      sourceType: preview.sourceType,
      duplicateDocumentId: preview.duplicateDocumentId,
      conflictingDocumentIds: preview.conflictingDocumentIds || [],
      warnings: preview.warnings || [],
      revisionOf: preview.conflictingDocumentIds?.[0] || '',
    })
  }
}

async function addFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length || busy.value || !owner.value) return
  const current = scope.capture()
  if (drafts.value.length + files.length > 20) {
    await reportError('每批最多保留 20 份资料，请先发布或移除部分草稿', current)
    return
  }
  if (files.some((file) => file.size > 8 * 1024 * 1024)
      || files.reduce((total, file) => total + file.size, 0) > 39 * 1024 * 1024) {
    await reportError('单个文件不能超过 8MB，同次上传总量不能超过 39MB', current)
    return
  }
  parsing.value = true
  error.value = ''
  try {
    const previews = await previewKnowledgeFiles(files)
    if (!current()) return
    addPreviews(previews)
    ElMessage.success(`已解析 ${files.length} 份资料，请逐项核对`)
  } catch (cause) {
    await reportError(cause.response?.data?.message || '文件解析失败，原草稿仍保留；请检查格式与大小后重试', current)
  } finally {
    if (current()) parsing.value = false
  }
}

async function addUrl() {
  if (busy.value || !owner.value || !url.value.trim()) return
  const current = scope.capture()
  if (drafts.value.length >= 20) {
    await reportError('每批最多保留 20 份资料，请先发布或移除部分草稿', current)
    return
  }
  parsing.value = true
  error.value = ''
  crawlSummary.value = null
  try {
    if (urlMode.value === 'site') {
      const remaining = 20 - drafts.value.length
      const result = await previewKnowledgeSite({
        url: url.value.trim(),
        maxPages: Math.min(Number(siteMaxPages.value), remaining),
        maxDepth: Number(siteMaxDepth.value),
        restrictToPath: restrictToPath.value,
      })
      if (!current()) return
      addPreviews(result.pages)
      crawlSummary.value = result
      ElMessage.success(`已解析 ${result.pages.length} 个页面，请逐项核对`)
    } else {
      const preview = await previewKnowledgeUrl(url.value.trim())
      if (!current()) return
      addPreviews([preview])
    }
    url.value = ''
  } catch (cause) {
    await reportError(cause.response?.data?.message || '链接解析失败，链接和原草稿仍保留；请检查官网地址后重试', current)
  } finally {
    if (current()) parsing.value = false
  }
}

function documentPayload(item) {
  return {
    schoolId: props.schoolId,
    title: item.title.trim(),
    category: item.category.trim(),
    sourceDepartment: item.sourceDepartment.trim() || null,
    sourceUrl: item.sourceUrl.trim() || null,
    publishedAt: item.publishedAt || null,
    effectiveAt: item.effectiveAt || null,
    expiresAt: item.expiresAt || null,
    content: item.content.trim(),
  }
}

async function publish() {
  if (busy.value || !owner.value) return
  const current = scope.capture()
  error.value = ''
  const items = drafts.value.filter((item) => !item.duplicateDocumentId)
  if (!items.length) { error.value = '没有可发布的资料'; return }
  const invalid = items.find((item) => !item.title.trim() || !item.category.trim() || !item.content.trim()
    || (item.conflictingDocumentIds.length && !item.revisionOf)
    || (item.revisionOf && !item.conflictingDocumentIds.map(Number).includes(Number(item.revisionOf))))
  if (invalid) {
    error.value = '请补全标题、分类、正文，并为冲突资料选择要修订的旧版本'
    await nextTick(); errorBox.value?.focus()
    return
  }
  if (items.some((item) => item.effectiveAt && item.expiresAt && item.expiresAt <= item.effectiveAt)) {
    error.value = '资料失效时间必须晚于生效时间'
    await nextTick(); errorBox.value?.focus()
    return
  }
  const titles = new Set()
  const sourceUrls = new Set()
  const revisionTargets = new Set()
  for (const item of items) {
    const title = item.title.trim()
    const sourceUrl = item.sourceUrl.trim()
    if (titles.has(title) || (sourceUrl && sourceUrls.has(sourceUrl))
        || (item.revisionOf && revisionTargets.has(Number(item.revisionOf)))) {
      error.value = '这批资料有重复标题、重复来源或多份修订指向同一旧版，请先合并或分批处理'
      await nextTick(); errorBox.value?.focus()
      return
    }
    titles.add(title)
    if (sourceUrl) sourceUrls.add(sourceUrl)
    if (item.revisionOf) revisionTargets.add(Number(item.revisionOf))
  }
  const additions = items.filter((item) => !item.revisionOf)
  const revisions = items.filter((item) => item.revisionOf)
  if (additions.length && revisions.length) {
    if (!await confirm('新资料和修订资料会分成两批提交；第一批成功后，第二批失败不会回滚第一批。',
      { title: '确认分批发布？', confirmText: '继续发布', cancelText: '返回核对' })) return
  }
  if (!current()) return
  publishing.value = true
  let completed = 0
  try {
    if (additions.length) {
      await importKnowledgeBatch(additions.map(documentPayload))
      if (!current()) return
      completed += additions.length
      const keys = new Set(additions.map((item) => item.key))
      drafts.value = drafts.value.filter((item) => !keys.has(item.key))
      emit('published')
    }
    if (revisions.length) {
      await reviseKnowledgeBatch(revisions.map((item) => ({
        documentId: Number(item.revisionOf), document: documentPayload(item),
      })))
      if (!current()) return
      const keys = new Set(revisions.map((item) => item.key))
      drafts.value = drafts.value.filter((item) => !keys.has(item.key))
      emit('published')
    }
    ElMessage.success('批量发布完成')
  } catch (cause) {
    const detail = cause.response?.data?.message || '提交结果未确认，请先查看资料列表再决定是否重试'
    await reportError(`${completed ? `${completed}份新资料已发布，不要重复提交；其余草稿仍保留。` : '草稿仍保留。'}${detail}`, current)
  } finally {
    if (current()) publishing.value = false
  }
}
</script>

<template>
  <section class="batch-panel" aria-labelledby="batch-title">
    <div class="batch-heading"><h2 id="batch-title">批量导入与更新</h2><small>每批最多 20 份 · 单份不超过 8MB</small></div>
    <p class="batch-intro">先解析、逐项修改，再一次发布。相同正文不会重复创建；同标题或来源冲突时必须选择旧版修订。</p>
    <p v-if="parsing" role="status">正在解析资料，已填写的草稿保持不变；请等待结果再核对</p>
    <div class="batch-sources" :aria-busy="busy">
      <label class="batch-file">
        <span class="source-title"><el-icon aria-hidden="true"><DocumentAdd /></el-icon>PDF / Word 文件</span>
        <small>一次选择多份资料，解析后逐项确认。</small>
        <input type="file" multiple accept=".pdf,.doc,.docx" :disabled="busy || drafts.length >= 20" @change="addFiles" />
      </label>
      <form @submit.prevent="addUrl">
        <div class="source-heading">
          <span class="source-title"><el-icon aria-hidden="true"><Link /></el-icon>学校官网</span>
          <div class="source-mode" role="group" aria-label="网页解析范围">
            <button type="button" :class="{ active: urlMode === 'page' }" :aria-pressed="urlMode === 'page'" :disabled="busy" @click="urlMode = 'page'">单个页面</button>
            <button type="button" :class="{ active: urlMode === 'site' }" :aria-pressed="urlMode === 'site'" :disabled="busy" @click="urlMode = 'site'">整站栏目</button>
          </div>
        </div>
        <label for="batch-url">入口链接</label>
        <div class="url-row"><input id="batch-url" v-model="url" type="url" placeholder="https://www.tsguas.edu.cn/…" :disabled="busy || drafts.length >= 20" /><button type="submit" :disabled="busy || drafts.length >= 20 || !url.trim()">{{ parsing ? '解析中…' : (urlMode === 'site' ? '扫描栏目' : '解析链接') }}</button></div>
        <div v-if="urlMode === 'site'" class="crawl-options">
          <div><label for="batch-max-pages">最多页面</label><select id="batch-max-pages" v-model.number="siteMaxPages" :disabled="busy"><option :value="5">5 页</option><option :value="10">10 页</option><option :value="20">20 页</option></select></div>
          <div><label for="batch-max-depth">链接深度</label><select id="batch-max-depth" v-model.number="siteMaxDepth" :disabled="busy"><option :value="1">1 层</option><option :value="2">2 层</option><option :value="3">3 层</option></select></div>
          <label class="path-limit"><input v-model="restrictToPath" type="checkbox" :disabled="busy" />只扫描入口所在栏目</label>
        </div>
        <p v-if="urlMode === 'site'" class="source-help"><el-icon aria-hidden="true"><OfficeBuilding /></el-icon>仅访问已配置学校域名的 HTTPS 页面，扫描结果不会自动发布。</p>
      </form>
    </div>
    <div v-if="crawlSummary" class="crawl-summary" role="status">
      <strong>扫描完成：{{ crawlSummary.pages.length }} 个页面进入草稿</strong>
      <span>访问 {{ crawlSummary.visitedCount }} 个链接，跳过 {{ crawlSummary.skippedCount }} 个</span>
      <details v-if="crawlSummary.warnings?.length"><summary>查看 {{ crawlSummary.warnings.length }} 条提示</summary><ul><li v-for="warning in crawlSummary.warnings" :key="warning">{{ warning }}</li></ul></details>
    </div>
    <p v-if="error" ref="errorBox" class="batch-error" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="!drafts.length" class="batch-empty">还没有待处理资料。选择文件或输入学校官网链接开始。</p>
    <p v-if="dirty" class="batch-intro">未发布内容仅保留在当前页面；切换后台栏目不会清空，刷新或离开网站前请保留原文件和正文</p>
    <div v-for="(item, index) in drafts" :key="item.key" class="batch-draft">
      <div class="batch-draft-head"><strong>{{ index + 1 }} · {{ item.title || '待命名资料' }}</strong><button type="button" :disabled="busy" @click="drafts.splice(index, 1)">移除</button></div>
      <p v-for="warning in item.warnings" :key="warning" class="batch-warning" role="status">{{ warning }}</p>
      <p v-if="item.duplicateDocumentId" class="batch-warning">正文与资料 #{{ item.duplicateDocumentId }} 相同；此项不会发布。</p>
      <label v-else-if="item.conflictingDocumentIds.length" class="batch-warning">标题或来源与旧资料冲突，选择要修订的版本
        <select v-model="item.revisionOf" :disabled="busy"><option value="">请选择</option><option v-for="id in item.conflictingDocumentIds" :key="id" :value="id">资料 #{{ id }}</option></select>
      </label>
      <div class="batch-fields">
        <label>标题<input v-model="item.title" maxlength="200" :disabled="busy" /></label>
        <label>分类<input v-model="item.category" maxlength="50" :disabled="busy" /></label>
        <label>发布部门<input v-model="item.sourceDepartment" maxlength="100" :disabled="busy" /></label>
        <label>原始链接<input v-model="item.sourceUrl" maxlength="1000" :disabled="busy" /></label>
        <label>发布时间<input v-model="item.publishedAt" type="datetime-local" :disabled="busy" /></label>
        <label>生效时间<input v-model="item.effectiveAt" type="datetime-local" :disabled="busy" /></label>
        <label>失效时间<input v-model="item.expiresAt" type="datetime-local" :disabled="busy" /></label>
      </div>
      <label class="batch-content">解析正文 · {{ item.content.length.toLocaleString('zh-CN') }} 字<textarea v-model="item.content" rows="7" maxlength="100000" :disabled="busy" /></label>
    </div>
    <div v-if="drafts.length" class="batch-footer"><span>{{ readyCount }} 份可提交；请核对来源和有效期</span><button type="button" :disabled="busy || !readyCount" @click="publish">{{ publishing ? '正在发布…' : '确认批量发布' }}</button></div>
  </section>
</template>

<style scoped>
.batch-panel { margin-top: 24px; padding: 30px; background: #fff; border: 1px solid #e6e8ed; border-radius: 24px; }
.batch-heading,.batch-draft-head,.batch-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.batch-heading h2 { margin: 0; font-size: 27px; letter-spacing: -.04em; }
.batch-heading small,.batch-intro,.batch-empty,.batch-footer span { color: #6e6e73; font-size: 14px; line-height: 1.7; }
.batch-intro { margin: 16px 0 24px; }
.batch-sources { display: grid; grid-template-columns: 1fr 1.3fr; gap: 14px; margin-bottom: 20px; }
.batch-sources label { display: block; color: #44464d; font-size: 14px; font-weight: 600; }
.batch-file { padding: 17px; background: #f5f7fa; border-radius: 14px; }
.batch-file small { display: block; margin-top: 7px; color: #6e6e73; font-weight: 400; line-height: 1.5; }
.batch-file input { display: block; width: 100%; margin-top: 12px; color: #666; font-size: 14px; }
.batch-sources form { padding: 17px; background: #f5f7fa; border-radius: 14px; }
.source-heading,.source-title,.url-row { display: flex; align-items: center; }
.source-heading { justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.source-title { gap: 7px; color: #25262a; font-weight: 700; }
.source-title .el-icon { color: #0071e3; font-size: 18px; }
.source-mode { display: flex; gap: 3px; padding: 3px; background: #e8ebf0; border-radius: 10px; }
.source-mode button { min-height: 32px; padding: 0 10px; color: #666b74; background: transparent; }
.source-mode button.active { color: #074b8f; background: #fff; box-shadow: 0 1px 3px rgb(30 45 70 / 10%); }
.url-row { gap: 8px; margin-top: 9px; }
.batch-sources form input { min-width: 0; flex: 1; }
.crawl-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 10px; margin-top: 12px; }
.crawl-options > div { min-width: 0; }
.crawl-options select { margin-top: 6px; }
.crawl-options .path-limit { display: flex; align-items: center; grid-column: 1 / -1; min-height: 44px; gap: 8px; font-weight: 500; }
.crawl-options .path-limit input { width: 18px; height: 18px; flex: 0 0 auto; }
.source-help { display: flex; align-items: flex-start; gap: 6px; margin: 12px 0 0; color: #6e6e73; font-size: 14px; line-height: 1.55; }
.source-help .el-icon { margin-top: 2px; flex: 0 0 auto; color: #0071e3; }
.crawl-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin: -4px 0 18px; padding: 13px 15px; color: #245b3b; background: #eff8f2; border: 1px solid #d8eddf; border-radius: 12px; font-size: 13px; line-height: 1.6; }
.crawl-summary span { color: #50725c; }
.crawl-summary details { flex-basis: 100%; }
.crawl-summary summary { cursor: pointer; font-weight: 650; }
.crawl-summary ul { margin: 8px 0 0; padding-left: 20px; color: #5f6d63; overflow-wrap: anywhere; }
.batch-panel input:not([type=file]):not([type=checkbox]),.batch-panel textarea,.batch-panel select { box-sizing: border-box; width: 100%; min-height: 46px; padding: 10px 12px; color: #1d1d1f; font: inherit; font-size: 16px; background: #fff; border: 1px solid #dcdfe5; border-radius: 10px; }
.batch-panel button { min-height: 44px; padding: 0 15px; color: #0069d4; font-size: 14px; font-weight: 650; background: #edf4ff; border: 0; border-radius: 10px; cursor: pointer; }
.batch-panel button:disabled { cursor: not-allowed; opacity: .5; }
.batch-panel button:focus-visible,.batch-panel input:focus-visible,.batch-panel textarea:focus-visible,.batch-panel select:focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }
.batch-error,.batch-warning { padding: 12px 14px; color: #8a3f10; background: #fff5e8; border-radius: 10px; font-size: 13px; line-height: 1.6; }
.batch-error { margin: 12px 0; }
.batch-draft { margin-top: 14px; padding: 20px; border: 1px solid #e8e9ed; border-radius: 16px; }
.batch-draft-head strong { font-size: 16px; }
.batch-draft-head button { background: transparent; color: #777; }
.batch-warning select { display: block; max-width: 260px; margin-top: 8px; }
.batch-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 13px; margin-top: 15px; }
.batch-fields label,.batch-content { display: block; color: #555860; font-size: 14px; font-weight: 600; }
.batch-fields input,.batch-content textarea { margin-top: 7px; }
.batch-content { margin-top: 15px; }
.batch-content textarea { display: block; width: 100%; resize: vertical; line-height: 1.6; }
.batch-footer { margin-top: 20px; }
.batch-footer button { color: #fff; background: #0071e3; }
@media (max-width: 700px) { .batch-panel { padding: 20px; }.batch-sources,.batch-fields { grid-template-columns: 1fr; }.source-heading { align-items: stretch; flex-direction: column; }.source-mode button { flex: 1; }.crawl-options { grid-template-columns: 1fr 1fr; }.crawl-options .path-limit { grid-column: 1 / -1; }.url-row { align-items: stretch; flex-direction: column; }.url-row button { width: 100%; }.batch-footer { align-items: stretch; flex-direction: column; }.batch-footer button { width: 100%; }.batch-panel input:not([type=file]),.batch-panel textarea,.batch-panel select { font-size: 16px; } }
</style>
