<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import CampMark from '@/components/CampMark.vue'
import { ElMessage } from 'element-plus'
import { isSessionExpired, userSessionGeneration } from '@/api/http'
import {
  ArrowLeft,
  Check,
  ChatDotRound,
  Collection,
  DataAnalysis,
  Food,
  Message,
  Upload,
} from '@element-plus/icons-vue'
import {
  approveKnowledgeSubmission,
  applyKnowledgeUpdate,
  addKnowledgeEvaluationCase,
  changeKnowledgeStatus,
  checkKnowledgeDocumentUpdate,
  deleteKnowledgeEvaluationCase,
  getContactMessages,
  getAdminOverview,
  getFailedBackgroundJobs,
  getKnowledgeDocuments,
  getKnowledgeUpdateCandidates,
  getKnowledgeDocument,
  getKnowledgeDocumentVersions,
  getKnowledgeEvaluationCases,
  getMessageFeedback,
  getModelUsage,
  getPendingKnowledgeSubmissions,
  dismissKnowledgeUpdate,
  importKnowledgeDocument,
  mergeKnowledgeSubmission,
  previewKnowledgeFile,
  previewKnowledgeUrl,
  indexNextKnowledgeBatch,
  markContactMessageHandled,
  rejectKnowledgeSubmission,
  resolveMessageFeedback,
  reviseKnowledgeDocument,
  runKnowledgeEvaluation,
  retryBackgroundJob,
} from '@/api/admin'
import { useAdminAuthStore } from '@/stores/adminAuth'
import AdminBatchImportPanel from '@/views/AdminBatchImportPanel.vue'
import AdminCareerPanel from '@/views/AdminCareerPanel.vue'
import AdminCanteenPanel from '@/views/AdminCanteenPanel.vue'
import AdminWallPanel from '@/views/AdminWallPanel.vue'
import AiBudgetPanel from '@/components/AiBudgetPanel.vue'
import { createDraftCheckpoint } from '@/utils/draftCheckpoint'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { filterAdminDocuments, knowledgeFormIssue, loadAdminSections } from '@/utils/adminWorkbench'
import { createAdminEditorScope, publishScopedKnowledge, snapshotKnowledgePublication } from '@/utils/adminEditorScope'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { createScopedAdminActions } from '@/utils/scopedAdminActions'
import { evaluationTargetLabel } from '@/utils/evaluationTarget'
import '@/styles/admin-workbench.css'

const router = useRouter()
const adminAuth = useAdminAuthStore()
const activeTab = ref('overview')
const loading = ref(true)
const identityError = ref('')
const sectionErrors = reactive({})
const documentQuery = ref(''), documentStatus = ref('ALL')
const editorLoading = ref(false), importError = ref(''), importSuccess = ref('')
let disposed = false, inboxSequence = 0, editorSequence = 0, mergeReadSequence = 0
const versionReads = new Map()
onBeforeUnmount(() => { disposed = true; inboxSequence++; editorSequence++ })
const processingKey = ref('')
const rejectionId = ref(null)
const mergeSubmissionId = ref(null)
const mergeDocumentId = ref('')
const mergeDraft = ref(null)
const submissions = ref([])
const contacts = ref([])
const feedback = ref([])
const modelUsage = ref([])
const overview = ref(null)
const overviewLoadFailed = ref(false)
const overviewUpdatedAt = ref(null)
const failedBackgroundJobs = ref([])
const documents = ref([])
const updateCandidates = ref([])
const evaluationCases = ref([])
const evaluationReport = ref(null)
const evaluationForm = reactive({ question: '', expectedDocumentId: '' })
const qualityBusy = ref(false)
const revisionOf = ref(null)
const versionHistories = reactive({})
const resolutionDrafts = reactive({})
const usageLoadFailed = ref(false)
const rejectionNotes = reactive({})
const importLoading = ref(false)
const previewLoading = ref(false)
const previewUrl = ref('')
const previewResult = ref(null)
const importFileInput = ref(null)
const importForm = reactive({
  title: '',
  category: '校园事务',
  sourceDepartment: '',
  sourceUrl: '',
  publishedAt: '',
  effectiveAt: '',
  expiresAt: '',
  content: '',
})
const importCheckpoint = createDraftCheckpoint(() => ({ ...importForm, revisionOf: revisionOf.value }))
const editorOwner = computed(() => adminAuth.isLoggedIn && adminAuth.user?.schoolId
  ? `${adminAuth.user.id}:${adminAuth.user.schoolId}:${userSessionGeneration.value}` : '')
const editorScope = createAdminEditorScope(() => editorOwner.value,
  () => ({ ...importForm, revisionOf: revisionOf.value, previewUrl: previewUrl.value }))
watch(() => ({ ...importForm, revisionOf: revisionOf.value, previewUrl: previewUrl.value }),
  editorScope.invalidateDraft, { flush: 'sync' })
const { confirming: importConfirming, confirm: confirmImport } = useScopedConfirmation(editorScope.key,
  () => !disposed && Boolean(editorOwner.value))
const actionRunning = ref(false)
const adminActions = createScopedAdminActions(() => editorOwner.value,
  () => !disposed && !loading.value && !processingKey.value && !qualityBusy.value && !importLoading.value && !previewLoading.value && !editorLoading.value && !importConfirming.value)
const { confirming: actionConfirming, confirm: confirmAction } = useScopedConfirmation(adminActions.key,
  () => !disposed && Boolean(editorOwner.value))
const actionBusy = computed(() => actionRunning.value || actionConfirming.value)
onBeforeUnmount(editorScope.dispose)
onBeforeUnmount(adminActions.dispose)
watch(editorOwner, () => {
  editorScope.invalidate(); inboxSequence++; editorSequence++
  adminActions.invalidate(); actionRunning.value = false; qualityBusy.value = false; processingKey.value = ''
  mergeReadSequence++; versionReads.clear()
  rejectionId.value = null; mergeSubmissionId.value = null; mergeDocumentId.value = ''; mergeDraft.value = null
  evaluationForm.question = ''; evaluationForm.expectedDocumentId = ''
  resetImportForm(); importSuccess.value = ''
  importLoading.value = false; previewLoading.value = false; editorLoading.value = false
  for (const target of [submissions, contacts, feedback, modelUsage, failedBackgroundJobs,
    documents, updateCandidates, evaluationCases]) target.value = []
  overview.value = null; evaluationReport.value = null; overviewUpdatedAt.value = null
  for (const state of [sectionErrors, versionHistories, resolutionDrafts, rejectionNotes]) {
    for (const key of Object.keys(state)) delete state[key]
  }
  loading.value = false
  identityError.value = '登录身份已变化，请刷新页面重新核验后加载后台'
}, { flush: 'sync' })
const batchImport = ref(null)
useUnsavedChanges(() => importCheckpoint.isDirty() || Boolean(batchImport.value?.dirty),
  () => actionBusy.value || importLoading.value || previewLoading.value || editorLoading.value || importConfirming.value || Boolean(batchImport.value?.busy))
const filteredDocuments = computed(() => filterAdminDocuments(documents.value, documentQuery.value, documentStatus.value))
const tabSectionKeys = {
  overview: ['jobs', 'usage'], knowledge: ['submissions'], contact: ['contacts'],
  feedback: ['feedback', 'documents'], documents: ['documents', 'updates'],
  evaluation: ['cases', 'documents'], import: ['documents'], usage: ['usage'],
}
const visibleLoadErrors = computed(() => (tabSectionKeys[activeTab.value] || [])
  .filter(key => sectionErrors[key]).map(key => sectionErrors[key]))

const pendingContactCount = computed(
  () => contacts.value.filter((item) => item.status === 'NEW').length,
)
const negativeFeedbackCount = computed(
  () => feedback.value.filter((item) => item.helpful === false && !item.resolutionNote).length,
)
const overviewActions = computed(() => overview.value ? [
  { label: '待审核资料', count: overview.value.pendingSubmissions, tab: 'knowledge', hint: '来自学生的资料补充' },
  { label: '待跟进差评', count: overview.value.unresolvedFeedback, tab: 'feedback', hint: '需要核实的回答' },
  { label: '未处理意见', count: overview.value.openContactMessages, tab: 'contact', hint: '全站意见收件箱' },
  { label: '待核验企业', count: overview.value.pendingEmployerCandidates, tab: 'career', hint: '联网发现的企业线索' },
] : [])
const maxProviderCalls = computed(() => Math.max(1, ...modelUsage.value.map((item) => Number(item.requestCount || 0))))

function resolveErrorMessage(error, fallback) {
  const response = error.response?.data
  const fieldError = response?.fieldErrors ? Object.values(response.fieldErrors)[0] : undefined
  return response?.message || fieldError || response?.error || fallback
}

function formatDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function providerName(provider) {
  return { deepseek: 'DeepSeek', kimi: 'Kimi', glm: 'GLM' }[provider] || provider
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('zh-CN')
}

function formatTokens(value) {
  return value === null || value === undefined ? '未返回' : formatCount(value)
}

function formatCost(value) {
  return value === null || value === undefined ? '暂无法估算' : `¥${Number(value).toFixed(4)}`
}

function safeExternalUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

async function loadInbox() {
  if (disposed || actionBusy.value) return
  const { current } = editorScope.capture()
  const sequence = ++inboxSequence
  loading.value = true
  const results = await loadAdminSections({
    submissions: getPendingKnowledgeSubmissions, contacts: getContactMessages,
    feedback: getMessageFeedback, usage: getModelUsage, documents: getKnowledgeDocuments,
    cases: getKnowledgeEvaluationCases, overview: getAdminOverview,
    jobs: getFailedBackgroundJobs, updates: getKnowledgeUpdateCandidates,
  })
  if (disposed || sequence !== inboxSequence || !current()) return
  const targets = { submissions, contacts, feedback, usage: modelUsage, documents,
    cases: evaluationCases, overview, jobs: failedBackgroundJobs, updates: updateCandidates }
  const labels = { submissions: '待审核资料', contacts: '意见收件箱', feedback: '回答反馈', usage: '模型用量',
    documents: '资料列表', cases: '检索题集', overview: '运营统计', jobs: '后台任务', updates: '官网更新' }
  for (const [key, result] of Object.entries(results)) {
    targets[key].value = result.data
    sectionErrors[key] = result.error ? `${labels[key]}读取失败，请重试；未将失败当作空数据` : ''
  }
  feedback.value.forEach(item => { resolutionDrafts[item.id] ||= { note: '', documentId: '' } })
  usageLoadFailed.value = Boolean(results.usage.error)
  overviewLoadFailed.value = Boolean(results.overview.error)
  if (!overviewLoadFailed.value) overviewUpdatedAt.value = new Date()
  loading.value = false
}

async function runInboxAction(key, execute, committed, { refresh = refreshOverview, targetCurrent = () => true, confirm, label = '操作' } = {}) {
  return adminActions.run({
    confirm, targetCurrent, execute, committed, refresh,
    outdated: () => ElMessage.warning('待处理记录已变化，请重新读取后核对'),
    failed: error => ElMessage.error(resolveErrorMessage(error, `${label}结果未确认，请重新读取核对后再操作`)),
    refreshFailed: () => ElMessage.warning(`${label}已提交，但列表或统计刷新失败；不要重复提交，请重新读取`),
    pending: value => { actionRunning.value = value; processingKey.value = value ? key : '' },
  })
}

async function retryJob(item) {
  const id = item.id
  await runInboxAction(`retry-job-${id}`, signal => retryBackgroundJob(id, { signal }), () => {
    failedBackgroundJobs.value = failedBackgroundJobs.value.filter(job => job.id !== id)
    ElMessage.success('任务已重新进入队列')
  }, { label: '任务重试', targetCurrent: () => failedBackgroundJobs.value.some(job => job.id === id) })
}

async function refreshOverview(current = editorScope.capture().current) {
  try {
    const latest = await getAdminOverview()
    if (!current()) return
    overview.value = latest
    overviewLoadFailed.value = false
    overviewUpdatedAt.value = new Date()
  } catch {
    if (current()) overviewLoadFailed.value = true
  }
}

async function refreshDocumentsAfterImport() {
  const { current } = editorScope.capture()
  try {
    const latest = await getKnowledgeDocuments()
    if (!Array.isArray(latest)) throw new Error('资料列表格式异常')
    if (!current()) return
    documents.value = latest; sectionErrors.documents = ''
  }
  catch { if (current()) { sectionErrors.documents = '资料已发布，但列表刷新失败，请重新读取'; ElMessage.warning(sectionErrors.documents) } }
  if (current()) await refreshOverview(current)
}

async function checkDocumentUpdate(item) {
  const id = item.id
  await runInboxAction(`check-update-${id}`, signal => checkKnowledgeDocumentUpdate(id, { signal }), () => {
    ElMessage.success('已加入更新检查队列，发现变化后会出现在本页顶部')
  }, { label: '更新检查', targetCurrent: () => documents.value.some(doc => doc.id === id && doc.status === 'PUBLISHED') })
}

async function applyDetectedUpdate(item) {
  const id = item.id, original = JSON.stringify(item)
  await adminActions.run({
    confirm: () => confirmAction(`确认后会发布「${item.detectedTitle || item.currentTitle}」的新版本，并保留旧版。请先核对新正文和官网来源。`, {
      title: '采用官网更新？', confirmText: '发布新版本', cancelText: '继续核对',
    }),
    targetCurrent: () => updateCandidates.value.some(entry => entry.id === id && JSON.stringify(entry) === original),
    outdated: () => ElMessage.warning('这项更新已变化，请重新读取并核对'),
    execute: signal => applyKnowledgeUpdate(id, { signal }),
    committed: () => {
      updateCandidates.value = updateCandidates.value.filter(entry => entry.id !== id)
      ElMessage.success('官网更新已发布为新版本')
    },
    refresh: async current => {
      const latest = await getKnowledgeDocuments()
      if (!Array.isArray(latest)) throw new Error('资料列表格式异常')
      if (!current()) return
      documents.value = latest; sectionErrors.documents = ''
      await refreshOverview(current)
    },
    refreshFailed: () => {
      sectionErrors.documents = '官网更新已发布，但列表刷新失败；无需再次发布，请重新读取'
      ElMessage.warning(sectionErrors.documents)
    },
    failed: error => ElMessage.error(resolveErrorMessage(error, '未能确认更新是否发布，请重新读取核对后再操作')),
    pending: value => { actionRunning.value = value },
  })
}

async function dismissDetectedUpdate(item) {
  const id = item.id
  await runInboxAction(`dismiss-update-${id}`, signal => dismissKnowledgeUpdate(id, { signal }), () => {
    updateCandidates.value = updateCandidates.value.filter(entry => entry.id !== id)
    ElMessage.success('已忽略本次变化')
  }, { label: '忽略更新', refresh: async () => {}, targetCurrent: () => updateCandidates.value.some(entry => entry.id === id) })
}

async function approve(item) {
  const id = item.id
  await runInboxAction(`approve-${id}`, signal => approveKnowledgeSubmission(id, { signal }), () => {
    submissions.value = submissions.value.filter(submission => submission.id !== id)
    ElMessage.success('资料已加入本校知识库')
  }, { label: '审核通过', targetCurrent: () => submissions.value.some(submission => submission.id === id) })
}

async function reject(item) {
  if (actionBusy.value) return
  const reviewNote = rejectionNotes[item.id]?.trim()
  if (!reviewNote) {
    ElMessage.warning('请填写拒绝原因')
    return
  }

  const id = item.id
  await runInboxAction(`reject-${id}`, signal => rejectKnowledgeSubmission(id, reviewNote, { signal }), () => {
    submissions.value = submissions.value.filter(submission => submission.id !== id)
    rejectionId.value = null
    ElMessage.success('已拒绝该条资料')
  }, { label: '拒绝审核', targetCurrent: () => submissions.value.some(submission => submission.id === id) })
}

async function prepareMerge(item) {
  if (!mergeDocumentId.value || actionBusy.value) return
  const ticket = editorScope.capture({ abortable: true }), sequence = ++mergeReadSequence
  const selectedId = mergeDocumentId.value, submissionId = item.id, schoolId = adminAuth.user?.schoolId
  const originalDraft = JSON.stringify(mergeDraft.value), question = item.question, content = item.content
  const current = () => ticket.current() && sequence === mergeReadSequence && selectedId === mergeDocumentId.value
    && submissionId === mergeSubmissionId.value && originalDraft === JSON.stringify(mergeDraft.value)
  try {
    const original = await getKnowledgeDocument(Number(selectedId), { signal: ticket.signal })
    if (!current()) return
    if (!original.rawContent) {
      ElMessage.warning('所选资料没有保存原文，无法安全合并')
      return
    }
    mergeDraft.value = {
      schoolId,
      title: original.title,
      category: original.category,
      sourceDepartment: original.sourceDepartment || null,
      sourceUrl: original.sourceUrl || null,
      publishedAt: original.publishedAt || null,
      effectiveAt: original.effectiveAt || null,
      expiresAt: original.expiresAt || null,
      content: `${original.rawContent.trim()}\n\n补充：${question}\n${content.trim()}`,
    }
  } catch (error) {
    if (current()) ElMessage.error(resolveErrorMessage(error, '读取旧资料失败'))
  } finally { ticket.release() }
}

async function confirmMerge(item) {
  if (!mergeDraft.value?.content?.trim()) return
  const id = item.id, targetId = Number(mergeDocumentId.value), payload = Object.freeze({ ...mergeDraft.value })
  const draft = JSON.stringify(mergeDraft.value)
  await runInboxAction(`merge-${id}`, signal => mergeKnowledgeSubmission(id, targetId, payload, { signal }), () => {
    submissions.value = submissions.value.filter(submission => submission.id !== id)
    mergeSubmissionId.value = null
    mergeDraft.value = null
    mergeDocumentId.value = ''
    ElMessage.success('投稿已合并为资料新版本，旧版保留')
  }, {
    label: '合并发布',
    confirm: () => confirmAction(`将投稿合并为「${payload.title}」的新版本；原 #${targetId} 将保留并下架。请确认已核读全文和来源。`, {
      title: '发布合并后的资料？', confirmText: '合并并发布', cancelText: '继续编辑',
    }),
    targetCurrent: () => submissions.value.some(submission => submission.id === id)
      && targetId === Number(mergeDocumentId.value) && draft === JSON.stringify(mergeDraft.value),
    refresh: async current => {
      const latest = await getKnowledgeDocuments()
      if (!Array.isArray(latest)) throw new Error('资料列表格式异常')
      if (!current()) return
      documents.value = latest; sectionErrors.documents = ''
      await refreshOverview(current)
    },
  })
}

async function markHandled(item) {
  if (item.status === 'HANDLED') return
  const id = item.id
  await runInboxAction(`contact-${id}`, signal => markContactMessageHandled(id, { signal }), updated => {
    contacts.value = contacts.value.map(contact => contact.id === id ? updated : contact)
    ElMessage.success('已标记为已处理')
  }, { label: '意见处理', targetCurrent: () => contacts.value.some(contact => contact.id === id && contact.status !== 'HANDLED') })
}

function resetImportForm() {
  revisionOf.value = null
  previewResult.value = null
  previewUrl.value = ''
  if (importFileInput.value) importFileInput.value.value = ''
  Object.assign(importForm, {
    title: '',
    category: '校园事务',
    sourceDepartment: '',
    sourceUrl: '',
    publishedAt: '',
    effectiveAt: '',
    expiresAt: '',
    content: '',
  })
  importError.value = ''
  importCheckpoint.accept()
}

async function mayReplaceImport(discard = false) {
  if (!editorOwner.value || disposed || actionBusy.value) return false
  if (!importCheckpoint.isDirty()) return true
  return confirmImport(discard ? '当前未发布的修改将被清空，已发布资料不会被删除。' : '当前未发布的编辑会被替换。可先返回编辑页保留或复制正文。', {
    title: discard ? '放弃未发布的修改？' : '替换未发布的内容？',
    confirmText: discard ? '放弃修改' : '替换内容', cancelText: '保留编辑',
  })
}

async function cancelImport() {
  if (importLoading.value || previewLoading.value || editorLoading.value || importConfirming.value) return
  const ticket = editorScope.capture()
  if (await mayReplaceImport(true) && ticket.unchanged()) { resetImportForm(); importSuccess.value = '' }
}

async function applyPreview(preview, ticket) {
  if (!ticket.unchanged() || revisionOf.value) return
  previewLoading.value = false
  if (!await mayReplaceImport()) return
  if (!ticket.unchanged() || revisionOf.value) return
  previewResult.value = preview
  Object.assign(importForm, {
    title: preview.title || '',
    category: '校园事务',
    sourceDepartment: '',
    sourceUrl: preview.sourceUrl || '',
    publishedAt: '',
    effectiveAt: '',
    expiresAt: '',
    content: preview.content || '',
  })
  ElMessage.success('解析完成，请核对正文和有效期后再发布')
}

async function previewFromUrl() {
  if (actionBusy.value) return
  const url = previewUrl.value.trim()
  if (!url || previewLoading.value || importLoading.value || editorLoading.value || importConfirming.value || !editorOwner.value) return
  const ticket = editorScope.capture({ abortable: true })
  previewLoading.value = true
  try {
    await applyPreview(await previewKnowledgeUrl(url, { signal: ticket.signal }), ticket)
  } catch (error) {
    if (ticket.unchanged()) ElMessage.error(resolveErrorMessage(error, '网页解析失败，请检查链接'))
  } finally {
    if (ticket.current()) previewLoading.value = false
    ticket.release()
  }
}

async function previewFromFile(event) {
  if (actionBusy.value) return
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || previewLoading.value || importLoading.value || editorLoading.value || importConfirming.value || !editorOwner.value) return
  const ticket = editorScope.capture({ abortable: true })
  previewLoading.value = true
  try {
    await applyPreview(await previewKnowledgeFile(file, { signal: ticket.signal }), ticket)
  } catch (error) {
    if (ticket.unchanged()) ElMessage.error(resolveErrorMessage(error, '文件解析失败，请检查格式'))
  } finally {
    if (ticket.current()) previewLoading.value = false
    ticket.release()
  }
}

async function submitImport() {
  if (actionBusy.value) return
  if (importLoading.value || previewLoading.value || editorLoading.value || importConfirming.value) return
  importError.value = knowledgeFormIssue(importForm)
  importSuccess.value = ''
  if (importError.value) return

  const schoolId = editorOwner.value && adminAuth.user?.schoolId
  if (!schoolId) {
    ElMessage.error('当前账户没有绑定学校，无法导入资料')
    return
  }

  const ticket = editorScope.capture({ abortable: true })
  const { payload, editingId } = snapshotKnowledgePublication(importForm, revisionOf.value, schoolId)
  await publishScopedKnowledge({
    ticket,
    confirm: () => confirmImport(
      editingId ? '正文变更会发布新版本并保留旧版；仅更正日期会更新原资料并记录审计，不重复入库。请核对来源、正文和有效期。'
        : '确认后资料会进入本校知识库并可能被用于回答，请确保可以公开使用。',
      { title: editingId ? '发布修订版本？' : '发布本校资料？', confirmText: '确认发布', cancelText: '继续编辑' },
    ),
    pending: value => { importLoading.value = value },
    publish: () => editingId ? reviseKnowledgeDocument(editingId, payload, { signal: ticket.signal })
      : importKnowledgeDocument(payload, { signal: ticket.signal }),
    committed: response => {
        resetImportForm()
        importSuccess.value = response.metadataUpdated ? `资料日期已更新 · 资料 #${response.documentId} · 未重复入库`
          : response.duplicate ? '这份资料已存在，没有重复发布'
          : `${editingId ? '新版本' : '资料'}已发布 · 资料 #${response.documentId} · ${response.chunkCount} 个检索片段`
        ElMessage.success(importSuccess.value)
    },
    refresh: async current => {
        const latest = await getKnowledgeDocuments()
        if (!Array.isArray(latest)) throw new Error('资料列表格式异常')
        if (current()) { documents.value = latest; sectionErrors.documents = '' }
    },
    refreshFailed: () => { sectionErrors.documents = '发布已成功，但列表刷新失败。无需再次发布，请重试读取' },
    failed: error => { importError.value = resolveErrorMessage(error, '未能确认发布成功，编辑内容已保留，请核对资料列表后重试') },
  })
}

async function editDocument(item) {
  if (actionBusy.value) return
  if (importLoading.value || previewLoading.value || editorLoading.value || importConfirming.value || !editorOwner.value) return
  const ticket = editorScope.capture({ abortable: true })
  if (!await mayReplaceImport() || !ticket.unchanged()) {
    ticket.release()
    return
  }
  editorLoading.value = true
  const sequence = ++editorSequence
  try {
    const original = await getKnowledgeDocument(item.id, { signal: ticket.signal })
    if (disposed || sequence !== editorSequence) return
    if (!ticket.unchanged()) return
    if (!original.rawContent) {
      ElMessage.warning('这份旧资料没有保存原文，暂时不能直接修订')
      return
    }
    revisionOf.value = item.id
    previewResult.value = null
    importError.value = ''; importSuccess.value = ''
    Object.assign(importForm, {
      title: original.title, category: original.category,
      sourceDepartment: original.sourceDepartment || '', sourceUrl: original.sourceUrl || '',
      publishedAt: original.publishedAt?.slice(0, 16) || '',
      effectiveAt: original.effectiveAt?.slice(0, 16) || '',
      expiresAt: original.expiresAt?.slice(0, 16) || '',
      content: original.rawContent,
    })
    importCheckpoint.accept()
    activeTab.value = 'import'
  } catch (error) {
    if (ticket.unchanged()) ElMessage.error(resolveErrorMessage(error, '读取资料失败'))
  } finally {
    if (ticket.current() && sequence === editorSequence) editorLoading.value = false
    ticket.release()
  }
}

async function showVersions(item) {
  if (versionHistories[item.id]) {
    delete versionHistories[item.id]
    return
  }
  const id = item.id
  if (versionReads.has(id)) return
  const ticket = editorScope.capture({ abortable: true }), operation = Symbol('versions')
  versionReads.set(id, operation)
  const current = () => ticket.current() && versionReads.get(id) === operation
  try {
    const versions = await getKnowledgeDocumentVersions(id, { signal: ticket.signal })
    if (current()) versionHistories[id] = versions
  } catch (error) {
    if (current()) ElMessage.error(resolveErrorMessage(error, '读取版本失败'))
  } finally {
    if (versionReads.get(id) === operation) versionReads.delete(id)
    ticket.release()
  }
}

async function toggleDocument(item) {
  const id = item.id, status = item.status, version = item.versionNumber, publishing = status !== 'PUBLISHED'
  await adminActions.run({
    confirm: () => confirmAction(`「${item.title}」${publishing ? '重新发布后会再次参与回答检索。' : '下架后，新回答将不再引用这份资料。'}`, {
      title: publishing ? '重新发布资料？' : '确认下架资料？',
      confirmText: publishing ? '重新发布' : '确认下架', cancelText: '取消，保持原状态',
    }),
    targetCurrent: () => documents.value.some(doc => doc.id === id && doc.status === status && doc.versionNumber === version && (doc.status === 'PUBLISHED' || !doc.hasSuccessor)),
    outdated: () => ElMessage.warning('资料版本或状态已变化，请重新读取后核对'),
    execute: signal => changeKnowledgeStatus(id, publishing, null, { signal }),
    committed: updated => {
      documents.value = documents.value.map(doc => doc.id === id ? { ...doc, ...updated } : doc)
      ElMessage.success(publishing ? '资料已发布' : '资料已下架')
    },
    refresh: refreshOverview,
    refreshFailed: () => ElMessage.warning('状态已更新，但统计刷新失败，请重新读取'),
    failed: error => ElMessage.error(resolveErrorMessage(error, '未能确认资料状态，请重新读取核对后再操作')),
    pending: value => { actionRunning.value = value },
  })
}

async function addEvaluation() {
  if (qualityBusy.value || actionBusy.value) return
  const question = evaluationForm.question.trim()
  if (!question || !evaluationForm.expectedDocumentId) {
    ElMessage.warning('请选择标准资料并填写问题')
    return
  }
  const expectedDocumentId = Number(evaluationForm.expectedDocumentId)
  await runInboxAction('add-evaluation', signal => addKnowledgeEvaluationCase(question, expectedDocumentId, { signal }), saved => {
    evaluationCases.value = [...evaluationCases.value, saved]
    if (evaluationForm.question.trim() === question && Number(evaluationForm.expectedDocumentId) === expectedDocumentId) {
      evaluationForm.question = ''; evaluationForm.expectedDocumentId = ''
    }
    evaluationReport.value = null
  }, { label: '题集保存', refresh: async () => {}, targetCurrent: () => documents.value.some(doc => doc.id === expectedDocumentId && doc.status === 'PUBLISHED') })
}

async function removeEvaluation(item) {
  const id = item.id
  await runInboxAction(`remove-evaluation-${id}`, signal => deleteKnowledgeEvaluationCase(id, { signal }), () => {
    evaluationCases.value = evaluationCases.value.filter(entry => entry.id !== id)
    evaluationReport.value = null
  }, { label: '题集移除', refresh: async () => {}, targetCurrent: () => evaluationCases.value.some(entry => entry.id === id) })
}

async function evaluateKnowledge() {
  if (!evaluationCases.value.length) return
  const original = JSON.stringify(evaluationCases.value)
  await adminActions.run({
    confirm: () => confirmAction(`运行当前 ${evaluationCases.value.length} 道固定题会逐题检索；启用语义检索时会调用 GLM API 并产生费用。`, {
      title: '运行检索评测？', confirmText: '开始评测', cancelText: '取消，不运行',
    }),
    targetCurrent: () => original === JSON.stringify(evaluationCases.value),
    outdated: () => ElMessage.warning('题集已变化，请重新核对后运行'),
    execute: signal => runKnowledgeEvaluation({ signal }),
    committed: result => { evaluationReport.value = result },
    failed: error => ElMessage.error(resolveErrorMessage(error, '未能确认评测结果，不代表未产生调用费用；请先核对用量')),
    refreshFailed: () => ElMessage.warning('评测已返回，但结果显示失败，请重新读取'),
    pending: value => { actionRunning.value = value },
  })
}

async function indexKnowledge() {
  await adminActions.run({
    confirm: () => confirmAction('这会处理下一批待索引片段；启用语义检索时会调用 GLM API 并产生费用。取消后不会提交本次索引。', {
      title: '建立下一批向量索引？', confirmText: '开始这一批', cancelText: '取消，不运行',
    }),
    execute: signal => indexNextKnowledgeBatch({ signal }),
    committed: result => ElMessage.success(result.indexedChunks
      ? `已建立 ${result.indexedChunks} 个片段的向量索引，可继续处理下一批`
      : '当前已无待建立索引的片段'),
    failed: error => ElMessage.error(resolveErrorMessage(error, '未能确认索引结果，请核对后端配置和用量；取消请求不等于服务端未处理')),
    refreshFailed: () => ElMessage.warning('索引已返回，但结果显示失败，请重新读取'),
    pending: value => { actionRunning.value = value },
  })
}

async function resolveFeedback(item) {
  if (qualityBusy.value || actionBusy.value) return
  const draft = resolutionDrafts[item.id]
  if (!draft?.note?.trim()) {
    ElMessage.warning('请填写核实与处理结果')
    return
  }
  const id = item.id, note = draft.note.trim(), documentId = draft.documentId
  await runInboxAction(`resolve-feedback-${id}`, signal => resolveMessageFeedback(id, note, documentId, { signal }), updated => {
    feedback.value = feedback.value.map((entry) => entry.id === id
      ? { ...entry, resolutionNote: updated.resolutionNote,
          resolvedDocumentId: updated.resolvedDocumentId, resolvedAt: updated.resolvedAt } : entry)
    ElMessage.success('纠错处理已记录')
  }, { label: '反馈处理', targetCurrent: () => feedback.value.some(entry => entry.id === id) })
}

async function initializeAdmin() {
  const generation = userSessionGeneration.value
  loading.value = true; identityError.value = ''
  try {
    await adminAuth.loadCurrentUser()
  } catch (error) {
    if (disposed || generation !== userSessionGeneration.value) return
    if (isSessionExpired(error)) await router.replace('/login?reauth=1')
    else identityError.value = '管理员身份核验未完成。权限来自服务器，重试不会修改账号角色'
    loading.value = false
    return
  }
  if (disposed || generation !== userSessionGeneration.value) return
  identityError.value = ''
  await loadInbox()
}
onMounted(initializeAdmin)

const logoutBusy = ref(false)
async function exitAdmin() {
  if (logoutBusy.value) return
  logoutBusy.value = true
  try {
    await adminAuth.logout()
    await router.replace('/login')
  } catch { ElMessage.error('未能确认退出成功，请检查网络后重试') }
  finally { logoutBusy.value = false }
}
</script>

<template>
  <div v-if="identityError" class="admin-identity-error" role="alert">
    <h1>暂时无法进入后台</h1><p>{{ identityError }}</p>
    <button type="button" @click="initializeAdmin">重新核验</button>
    <RouterLink to="/account">查看账号身份</RouterLink>
  </div>
  <div v-else class="admin-page">
    <aside class="admin-sidebar">
      <button class="back-button" type="button" @click="router.push('/chat')">
        <el-icon><ArrowLeft /></el-icon>
        返回校园助手
      </button>

      <div class="admin-brand">
        <CampMark />
        <div><strong>Campthink.</strong><small>THE CAMPUS DESK</small></div>
      </div>

      <label class="admin-mobile-section">工作区
        <select v-model="activeTab" aria-label="选择后台模块">
          <option value="overview">运营总览</option><option value="knowledge">知识审核</option>
          <option value="contact">意见收件箱</option><option value="feedback">回答反馈</option>
          <option value="import">导入资料</option><option value="documents">资料管理</option>
          <option value="evaluation">检索评测</option><option value="career">企业与招聘</option>
          <option value="canteens">食堂与商家</option><option value="wall">校园墙审核</option><option value="usage">模型用量</option>
        </select>
      </label>
      <nav aria-label="后台模块">
        <button type="button" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">
          <el-icon><DataAnalysis /></el-icon><span>运营总览</span><i>↗</i>
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'knowledge' }"
          @click="activeTab = 'knowledge'"
        >
          <el-icon><Collection /></el-icon><span>知识审核</span><i>{{ sectionErrors.submissions ? '—' : submissions.length }}</i>
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'contact' }"
          @click="activeTab = 'contact'"
        >
          <el-icon><Message /></el-icon><span>意见收件箱</span><i>{{ sectionErrors.contacts ? '—' : pendingContactCount }}</i>
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'feedback' }"
          @click="activeTab = 'feedback'"
        >
          <el-icon><ChatDotRound /></el-icon><span>回答反馈</span><i>{{ sectionErrors.feedback ? '—' : negativeFeedbackCount }}</i>
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'import' }"
          @click="activeTab = 'import'"
        >
          <el-icon><Upload /></el-icon><span>导入资料</span><i>+</i>
        </button>
        <button type="button" :class="{ active: activeTab === 'documents' }" @click="activeTab = 'documents'">
          <el-icon><Collection /></el-icon><span>资料管理</span><i>{{ sectionErrors.documents ? '—' : documents.length }}</i>
        </button>
        <button type="button" :class="{ active: activeTab === 'evaluation' }" @click="activeTab = 'evaluation'">
          <el-icon><DataAnalysis /></el-icon><span>检索评测</span><i>{{ sectionErrors.cases ? '—' : evaluationCases.length }}</i>
        </button>
        <button type="button" :class="{ active: activeTab === 'career' }" @click="activeTab = 'career'">
          <el-icon><Collection /></el-icon><span>企业与招聘</span><i>↗</i>
        </button>
        <button type="button" :class="{ active: activeTab === 'canteens' }" @click="activeTab = 'canteens'">
          <el-icon><Food /></el-icon><span>食堂与商家</span><i>↗</i>
        </button>
        <button type="button" :class="{ active: activeTab === 'wall' }" @click="activeTab = 'wall'"><el-icon><ChatDotRound /></el-icon><span>校园墙审核</span></button>
        <button
          type="button"
          :class="{ active: activeTab === 'usage' }"
          @click="activeTab = 'usage'"
        >
          <el-icon><DataAnalysis /></el-icon><span>模型用量</span><i>预算</i>
        </button>
      </nav>

      <div class="admin-user">
        <strong>{{ adminAuth.user?.nickname || adminAuth.user?.username }}</strong>
        <small>本窗口管理员会话</small>
        <button type="button" class="admin-exit" :disabled="logoutBusy" @click="exitAdmin">{{ logoutBusy ? '正在退出…' : '退出后台' }}</button>
      </div>
    </aside>

    <main>
      <header>
        <h1>
          {{
            activeTab === 'wall' ? '校园墙审核' : activeTab === 'overview'
              ? '运营总览'
              : activeTab === 'knowledge'
              ? '知识审核'
              : activeTab === 'contact'
                ? '意见收件箱'
                : activeTab === 'feedback'
                  ? '回答反馈'
                  : activeTab === 'documents'
                    ? '资料管理'
                  : activeTab === 'evaluation'
                      ? '检索评测'
                  : activeTab === 'career'
                    ? '企业与招聘'
                  : activeTab === 'canteens'
                    ? '食堂与商家'
                  : activeTab === 'usage'
                    ? '模型用量'
                  : '导入资料'
          }}
        </h1>
        <span>
          {{
            activeTab === 'wall' ? '发布前审核、举报处理与隐藏记录，仅管理本校内容' : activeTab === 'overview'
              ? '掌握待处理事项与最近 24 小时模型使用情况。所有数字都来自当前后台数据。'
              : activeTab === 'knowledge'
              ? '用户在聊天中补充的校园信息，通过审核后才会进入正式知识库。'
              : activeTab === 'contact'
                ? '用户从网站提交的问题、建议和功能诉求会集中在这里。'
                : activeTab === 'feedback'
                  ? '集中查看真实用户对回答的评价，优先修复差评问题和缺失资料。'
                  : activeTab === 'documents'
                    ? '查看本校资料，过期资料不会参与检索，下架后可随时重新发布。'
                    : activeTab === 'evaluation'
                      ? '维护固定校园问题与标准资料，运行检索评测并观察命中率。'
                  : activeTab === 'career'
                    ? '企业与岗位分别管理，核实后发布，不混入普通校园通知。'
                  : activeTab === 'canteens'
                    ? '核实食堂和商家后发布；评分由本校登录用户提交。'
                  : activeTab === 'usage'
                    ? '成本管理员查看全站日/月预算，下方保留本校最近 24 小时的已保存回答用量'
                  : '将经过确认的校园资料导入知识库，系统会自动去重并切分检索片段。'
          }}
        </span>
      </header>

      <div v-if="!loading && visibleLoadErrors.length" class="admin-load-error" role="alert">
        <div><p v-for="message in visibleLoadErrors" :key="message">{{ message }}</p></div>
        <button type="button" :disabled="actionBusy" @click="loadInbox">重新读取</button>
      </div>
      <p v-if="actionRunning" class="editor-return" role="status">正在处理本次操作，请勿重复提交。关闭页面或取消请求不保证撤销服务端已提交的处理。</p>
      <div v-if="activeTab !== 'import' && (importCheckpoint.isDirty() || batchImport?.dirty || batchImport?.busy)" class="editor-return" role="status">
        <span>{{ batchImport?.busy ? '批量资料仍在处理中，可返回查看结果' : '有未发布的资料填写，仅保留在当前页面' }}</span>
        <button type="button" @click="activeTab = 'import'">继续编辑</button>
      </div>

      <section v-if="loading" class="empty-state loading-state">
        <i></i><strong>正在读取审核任务</strong>
      </section>

      <section v-else-if="activeTab === 'overview'" class="overview-panel">
        <div class="overview-toolbar">
          <span>{{ overviewUpdatedAt ? `更新于 ${formatDate(overviewUpdatedAt)}` : '实时统计' }} · 本校数据，意见为全站</span>
          <button type="button" @click="loadInbox">刷新数据 ↻</button>
        </div>
        <div v-if="overviewLoadFailed || !overview" class="empty-state overview-unavailable">
          <strong>暂时无法读取统计数据</strong>
          <span>其他管理功能仍可使用。请确认服务已更新后重试。</span>
          <button type="button" @click="refreshOverview">重试</button>
        </div>
        <template v-else>
          <div class="overview-metrics">
            <button v-for="item in overviewActions" :key="item.tab" type="button"
              class="overview-metric overview-metric-action" @click="activeTab = item.tab">
              <span>{{ item.label }}</span>
              <strong>{{ formatCount(item.count) }}</strong>
              <small>{{ item.hint }} <span aria-hidden="true">↗</span></small>
            </button>
            <div class="overview-metric overview-metric-secondary">
              <span>当前可检索资料</span>
              <strong>{{ formatCount(overview.searchableDocuments) }}</strong>
              <small>本校已发布且在有效期内</small>
            </div>
            <div class="overview-metric overview-metric-secondary">
              <span>近 24 小时调用</span>
              <strong>{{ formatCount(overview.recentModelCalls) }}</strong>
              <small>本校已保存回答，不含失败与重试</small>
            </div>
            <div class="overview-metric overview-metric-secondary">
              <span>近 24 小时 Token</span>
              <strong>{{ formatTokens(overview.recentModelTokens) }}</strong>
              <small>仅统计服务商返回的用量</small>
            </div>
            <div class="overview-metric overview-metric-secondary">
              <span>后台任务</span>
              <strong>{{ formatCount(overview.pendingBackgroundJobs) }}</strong>
              <small v-if="overview.failedBackgroundJobs">另有 {{ formatCount(overview.failedBackgroundJobs) }} 项失败，需检查服务配置</small>
              <small v-else>索引任务运行正常</small>
            </div>
          </div>
          <div class="overview-bottom">
            <section class="overview-section" aria-labelledby="overview-actions-title">
              <div class="overview-section-heading">
                <div><span>WORK QUEUE</span><h2 id="overview-actions-title">待办事项</h2></div>
                <small>按处理环节查看</small>
              </div>
              <button v-for="item in overviewActions" :key="item.tab" type="button"
                class="overview-queue-row" @click="activeTab = item.tab">
                <span>{{ item.label }}</span><strong>{{ formatCount(item.count) }}</strong><i aria-hidden="true">→</i>
              </button>
            </section>
            <section class="overview-section" aria-labelledby="overview-models-title">
              <div class="overview-section-heading">
                <div><span>MODEL ACTIVITY</span><h2 id="overview-models-title">模型使用</h2></div>
                <button type="button" @click="activeTab = 'usage'">查看详情 →</button>
              </div>
              <p v-if="usageLoadFailed" class="overview-hint">模型明细暂不可用，请稍后刷新。</p>
              <p v-else-if="modelUsage.length === 0" class="overview-hint">最近 24 小时还没有模型调用。</p>
              <div v-for="item in modelUsage" v-else :key="`${item.provider}-${item.model}`" class="overview-provider">
                <div><span>{{ providerName(item.provider) }} · {{ item.model || '模型未知' }}</span><strong>{{ formatCount(item.requestCount) }} 次</strong></div>
                <div class="overview-provider-track"><span :style="{ width: `${Number(item.requestCount || 0) / maxProviderCalls * 100}%` }"></span></div>
              </div>
            </section>
          </div>
          <section v-if="failedBackgroundJobs.length" class="overview-section failed-jobs" aria-labelledby="failed-jobs-title">
            <div class="overview-section-heading">
              <div><span>RETRY QUEUE</span><h2 id="failed-jobs-title">失败任务</h2></div>
              <small>错误仅显示类型，不包含密钥或请求正文</small>
            </div>
            <div v-for="item in failedBackgroundJobs" :key="item.id" class="overview-queue-row failed-job-row">
              <span>{{ item.type }} · 资料 #{{ item.refId || '—' }} · {{ item.lastError || '未知错误' }}</span>
              <strong>{{ item.attemptCount }}/{{ item.maxAttempts }}</strong>
              <button type="button" :disabled="processingKey || actionBusy" @click="retryJob(item)">{{ processingKey === `retry-job-${item.id}` ? '重试中…' : '重新执行' }}</button>
            </div>
          </section>
        </template>
      </section>

      <section v-else-if="activeTab === 'knowledge'" class="review-list">
        <div v-if="sectionErrors.submissions" class="empty-state"><strong>待审核资料尚未读取成功</strong><span>这不表示审核队列为空，请重试</span></div>
        <div v-else-if="submissions.length === 0" class="empty-state">
          <el-icon><Check /></el-icon>
          <strong>待审核内容已经清空</strong>
          <span>新的用户补充会自动出现在这里</span>
        </div>

        <article v-for="item in submissions" v-else :key="item.id" class="review-card">
          <div class="card-meta">
            <span>待审核</span><time>{{ formatDate(item.createdAt) }}</time>
          </div>
          <h2>{{ item.question }}</h2>
          <p>{{ item.content }}</p>
          <a
            v-if="safeExternalUrl(item.sourceUrl)"
            :href="safeExternalUrl(item.sourceUrl)"
            target="_blank"
            rel="noopener noreferrer"
            >查看用户提供的来源 ↗</a
          >

          <div v-if="rejectionId === item.id" class="reject-panel">
            <textarea
              v-model="rejectionNotes[item.id]"
              :disabled="actionBusy"
              maxlength="500"
              rows="3"
              placeholder="填写拒绝原因，便于后续追踪"
            ></textarea>
            <div>
              <button type="button" :disabled="actionBusy" @click="rejectionId = null">取消</button>
              <button type="button" :disabled="Boolean(processingKey) || actionBusy" @click="reject(item)">
                {{ processingKey === `reject-${item.id}` ? '处理中…' : '确认拒绝' }}
              </button>
            </div>
          </div>
          <div v-else-if="mergeSubmissionId === item.id" class="reject-panel merge-panel">
            <label>选择本校已发布资料
              <select v-model="mergeDocumentId" :disabled="actionBusy" @change="mergeDraft = null">
                <option value="">请选择资料</option>
                <option v-for="doc in documents.filter((entry) => entry.status === 'PUBLISHED')"
                  :key="doc.id" :value="doc.id">#{{ doc.id }} {{ doc.title }}</option>
              </select>
            </label>
            <button type="button" :disabled="!mergeDocumentId || actionBusy" @click="prepareMerge(item)">读取并预览合并内容</button>
            <template v-if="mergeDraft">
              <p>请核对合并后的全文；确认后新版本发布，旧版本保留并下架。</p>
              <label>新版本标题<input v-model="mergeDraft.title" :disabled="actionBusy" maxlength="200" /></label>
              <label>新版本正文<textarea v-model="mergeDraft.content" :disabled="actionBusy" maxlength="100000" rows="9"></textarea></label>
            </template>
            <div>
              <button type="button" :disabled="actionBusy" @click="mergeSubmissionId = null; mergeDraft = null; mergeDocumentId = ''">取消</button>
              <button type="button" :disabled="!mergeDraft || Boolean(processingKey) || actionBusy" @click="confirmMerge(item)">
                {{ processingKey === `merge-${item.id}` ? '正在合并…' : '确认合并并发布' }}
              </button>
            </div>
          </div>
          <div v-else class="card-actions">
            <button type="button" :disabled="actionBusy" @click="rejectionId = item.id">拒绝</button>
            <button type="button" :disabled="actionBusy" @click="mergeSubmissionId = item.id; mergeDocumentId = ''; mergeDraft = null; mergeReadSequence++">合并到现有资料</button>
            <button type="button" :disabled="Boolean(processingKey) || actionBusy" @click="approve(item)">
              {{ processingKey === `approve-${item.id}` ? '正在写入…' : '通过并加入知识库' }}
            </button>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'contact'" class="review-list contact-list">
        <div v-if="sectionErrors.contacts" class="empty-state"><strong>意见收件箱尚未读取成功</strong><span>不会将读取失败当作没有意见，请重试</span></div>
        <div v-else-if="contacts.length === 0" class="empty-state">
          <el-icon><ChatDotRound /></el-icon>
          <strong>暂时没有新意见</strong>
          <span>用户提交的意见会直接汇总在这里</span>
        </div>

        <article
          v-for="item in contacts"
          v-else
          :key="item.id"
          class="review-card contact-card"
          :class="{ handled: item.status === 'HANDLED' }"
        >
          <div class="card-meta">
            <span>{{ item.status === 'HANDLED' ? '已处理' : '新消息' }}</span>
            <time>{{ formatDate(item.createdAt) }}</time>
          </div>
          <h2>{{ item.subject }}</h2>
          <p>{{ item.message }}</p>
          <dl>
            <div>
              <dt>称呼</dt>
              <dd>{{ item.name }}</dd>
            </div>
            <div>
              <dt>联系方式</dt>
              <dd>{{ item.contact }}</dd>
            </div>
          </dl>
          <div class="card-actions">
            <span v-if="item.status === 'HANDLED'">这条消息已完成跟进</span>
            <button
              v-else
              type="button"
              :disabled="Boolean(processingKey) || actionBusy"
              @click="markHandled(item)"
            >
              {{ processingKey === `contact-${item.id}` ? '正在更新…' : '标记已处理' }}
            </button>
          </div>
        </article>
      </section>

      <section v-else-if="activeTab === 'import'" class="import-panel">
        <form class="import-form" :aria-busy="importLoading || previewLoading || importConfirming" @submit.prevent="submitImport">
          <div class="import-form-heading">
            <div>
              <h2>{{ revisionOf ? `修订资料 #${revisionOf}` : '编辑本校资料' }}</h2>
            </div>
            <el-icon><Upload /></el-icon>
          </div>
          <p v-if="importError" class="editor-error" role="alert">{{ importError }}</p>
          <div v-if="importSuccess && !importCheckpoint.isDirty()" class="editor-success" role="status"><p>{{ importSuccess }}</p><button type="button" @click="activeTab = 'documents'">查看资料列表</button></div>
          <p class="import-notice">
            可从学校官网链接、PDF 或 Word 解析，也可直接填写。发布前请核对正文、来源和有效期。
          </p>

          <fieldset class="editor-fields" :disabled="importLoading || previewLoading || editorLoading || importConfirming">
          <legend class="visually-hidden">资料内容与来源</legend>
          <div v-if="!revisionOf" class="import-source" :aria-busy="previewLoading">
            <div class="import-source-heading">
              <strong>从已有资料开始</strong>
              <span>只解析，不会自动发布</span>
            </div>
            <div class="import-source-actions">
              <label class="import-source-url">
                <span>学校官网链接</span>
                <input
                  v-model="previewUrl"
                  type="url"
                  inputmode="url"
                  placeholder="https://www.tsguas.edu.cn/…"
                  @keydown.enter.prevent="previewFromUrl"
                />
              </label>
              <button type="button" :disabled="previewLoading || !previewUrl.trim()" @click="previewFromUrl">
                {{ previewLoading ? '解析中…' : '预览链接' }}
              </button>
              <label class="import-source-file">
                <span>上传 PDF / Word</span>
                <input
                  ref="importFileInput"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  :disabled="previewLoading"
                  @change="previewFromFile"
                />
              </label>
            </div>
            <p v-if="previewResult" class="import-preview-status" role="status">
              已解析 {{ previewResult.sourceType === 'URL' ? '网页' : '文件' }}，正文约
              {{ previewResult.content.length.toLocaleString('zh-CN') }} 字。
              <template v-if="previewResult.duplicateDocumentId">
                与资料 #{{ previewResult.duplicateDocumentId }} 正文相同，请勿重复发布。
              </template>
              <template v-else-if="previewResult.conflictingDocumentIds?.length">
                与资料 #{{ previewResult.conflictingDocumentIds.join('、#') }} 标题或来源冲突，请先核对并修订旧版。
                <button type="button" class="import-conflict-link" @click="activeTab = 'documents'">
                  查看资料管理
                </button>
              </template>
            </p>
          </div>

          <div class="import-grid">
            <label>
              <span>资料标题</span>
              <input v-model="importForm.title" maxlength="200" placeholder="例如：图书馆开放时间" />
            </label>
            <label>
              <span>资料分类</span>
              <input v-model="importForm.category" maxlength="50" placeholder="校园事务" />
            </label>
            <label>
              <span>发布部门</span>
              <input v-model="importForm.sourceDepartment" maxlength="100" placeholder="例如：图书馆" />
            </label>
            <label>
              <span>原始链接</span>
              <input v-model="importForm.sourceUrl" maxlength="1000" placeholder="https://…" />
            </label>
            <label>
              <span>发布时间</span>
              <input v-model="importForm.publishedAt" type="datetime-local" />
            </label>
            <label>
              <span>生效时间</span>
              <input v-model="importForm.effectiveAt" type="datetime-local" />
            </label>
            <label>
              <span>失效时间</span>
              <input v-model="importForm.expiresAt" type="datetime-local" />
            </label>
          </div>

          <label class="import-content-field">
            <span>资料正文</span>
            <textarea
              v-model="importForm.content"
              maxlength="100000"
              rows="14"
              placeholder="粘贴学校通知、办事流程或场馆规则正文…"
            ></textarea>
            <small class="editor-meta">{{ importForm.content.length.toLocaleString('zh-CN') }} / 100,000 字 · {{ importCheckpoint.isDirty() ? '有未发布修改' : '尚无未发布修改' }} · 不自动发布</small>
          </label>
          </fieldset>

          <div class="import-form-actions">
            <span>{{ revisionOf ? '请核实修改后的正文；旧版本将保留并下架' : '同一学校、相同正文不会重复写入' }}</span>
            <button v-if="revisionOf || importCheckpoint.isDirty()" type="button" :disabled="importLoading || previewLoading || editorLoading || importConfirming" @click="cancelImport">{{ revisionOf ? '取消修订' : '清空编辑' }}</button>
            <button type="submit" :disabled="importLoading || previewLoading || editorLoading || importConfirming">
              {{ importLoading ? '正在保存…' : revisionOf ? '发布新版本' : '确认发布' }}
            </button>
          </div>
        </form>
      </section>

      <section v-else-if="activeTab === 'usage'" class="usage-panel">
        <AiBudgetPanel />
        <p class="usage-estimate-note">管理员测试不设每日 Token 上限，实际用量照常记录；仍遵循已配置的限流、并发及全站日/月预算规则。普通账号继续使用现行额度。</p>
        <div v-if="usageLoadFailed" class="empty-state">
          <strong>模型用量暂时无法读取</strong>
          <span>请确认后端已重启并创建 ai_model_usage 表</span>
        </div>
        <div v-else-if="modelUsage.length === 0" class="empty-state">
          <el-icon><DataAnalysis /></el-icon>
          <strong>本校最近 24 小时没有已保存回答的用量记录</strong>
          <span>失败和重试请看上方全站预算，本区不是完整费用账单</span>
        </div>
        <article v-for="item in modelUsage" v-else :key="`${item.provider}-${item.model}`" class="usage-card">
          <span>{{ providerName(item.provider) }} · {{ item.model || '模型未知' }}</span>
          <strong>{{ formatTokens(item.totalTokens) }} <small>Token</small></strong>
          <dl>
            <div><dt>已保存回答</dt><dd>{{ formatCount(item.requestCount) }}</dd></div>
            <div><dt>输入</dt><dd>{{ formatTokens(item.promptTokens) }}</dd></div>
            <div><dt>输出</dt><dd>{{ formatTokens(item.completionTokens) }}</dd></div>
            <div><dt>估算费用</dt><dd>{{ formatCost(item.estimatedCostCny) }}</dd></div>
          </dl>
          <p class="usage-estimate-note">按当前配置单价估算，非供应商账单；单价未配置或供应商未返回 Token 时不显示金额。</p>
        </article>
      </section>

      <AdminCareerPanel v-else-if="activeTab === 'career'" />
      <AdminCanteenPanel v-else-if="activeTab === 'canteens'" />
      <AdminWallPanel v-else-if="activeTab === 'wall'" />

      <section v-else-if="activeTab === 'documents'" class="review-list">
        <div class="document-toolbar">
          <label>查找资料<input v-model="documentQuery" type="search" maxlength="200" placeholder="标题、分类、部门或编号" /></label>
          <label>发布状态<select v-model="documentStatus"><option value="ALL">全部状态</option><option value="PUBLISHED">已发布</option><option value="ARCHIVED">已下架 / 历史</option></select></label>
          <button type="button" @click="activeTab = 'import'">{{ importCheckpoint.isDirty() || revisionOf ? '继续编辑资料' : '新增资料' }}</button>
        </div>
        <p v-if="!sectionErrors.documents" class="document-results" role="status">当前列表 {{ documents.length }} 份 · 符合筛选 {{ filteredDocuments.length }} 份</p>
        <details v-if="updateCandidates.length" class="source-update-section">
          <summary class="source-update-heading">
            <div><span>SOURCE CHANGES</span><h2 id="source-update-title">官网资料有变化</h2></div>
            <small>{{ updateCandidates.length }} 项待核对 · 点击展开 · 不会自动覆盖</small>
          </summary>
          <div class="source-update-list">
          <article v-for="item in updateCandidates" :key="item.id" class="review-card source-update-card">
            <div class="card-meta"><span>待确认更新</span><time>{{ formatDate(item.detectedAt) }}</time></div>
            <h2>{{ item.detectedTitle || item.currentTitle }}</h2>
            <a v-if="safeExternalUrl(item.sourceUrl)" :href="safeExternalUrl(item.sourceUrl)" target="_blank" rel="noopener noreferrer">查看官网来源 ↗</a>
            <details><summary>预览检测到的新正文</summary><p>{{ item.detectedContent }}</p></details>
            <div class="card-actions">
              <button type="button" :disabled="Boolean(processingKey) || actionBusy" @click="dismissDetectedUpdate(item)">忽略本次变化</button>
              <button type="button" :disabled="Boolean(processingKey) || actionBusy" @click="applyDetectedUpdate(item)">{{ actionRunning ? '正在处理…' : '核对后发布新版本' }}</button>
            </div>
          </article>
          </div>
        </details>
        <div v-if="sectionErrors.documents" class="empty-state"><strong>资料列表尚未读取成功</strong><span>请使用上方「重新读取」，不会用空列表覆盖已有资料</span></div>
        <div v-else-if="documents.length === 0" class="empty-state">
          <strong>还没有本校资料</strong><span>导入资料或审核用户补充后会显示在这里</span>
        </div>
        <div v-else-if="filteredDocuments.length === 0" class="empty-state"><strong>没有符合筛选的资料</strong><span>尝试更短的关键词或切换发布状态</span><button type="button" @click="documentQuery = ''; documentStatus = 'ALL'">清除筛选</button></div>
        <article v-for="item in filteredDocuments" v-else :key="item.id" class="review-card">
          <div class="card-meta"><span>{{ item.status === 'PUBLISHED' ? '已发布' : '已下架' }}</span>
            <time>v{{ item.versionNumber || 1 }} · #{{ item.id }}</time></div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.category }} · {{ item.sourceDepartment || '来源未填写' }}</p>
          <p v-if="item.expiresAt">有效至 {{ formatDate(item.expiresAt) }}</p>
          <div class="card-actions">
            <button type="button" @click="showVersions(item)">版本记录</button>
            <button v-if="item.status === 'PUBLISHED' && safeExternalUrl(item.sourceUrl)"
              type="button" :disabled="Boolean(processingKey) || actionBusy" @click="checkDocumentUpdate(item)">
              {{ processingKey === `check-update-${item.id}` ? '正在安排…' : '检查官网更新' }}
            </button>
            <button v-if="item.status === 'PUBLISHED'" type="button" :disabled="editorLoading || importLoading || previewLoading || importConfirming" @click="editDocument(item)">{{ editorLoading ? '正在读取…' : '编辑并发布新版本' }}</button>
            <button v-if="item.status === 'PUBLISHED' || !item.hasSuccessor"
              type="button" :disabled="qualityBusy || actionBusy" @click="toggleDocument(item)">
              {{ item.status === 'PUBLISHED' ? '下架资料' : '重新发布' }}
            </button>
          </div>
          <p v-for="version in versionHistories[item.id] || []" :key="version.id">
            v{{ version.versionNumber }} · {{ version.title }} ·
            {{ version.status === 'PUBLISHED' ? '当前发布' : '历史版本' }}
          </p>
        </article>
      </section>

      <section v-else-if="activeTab === 'evaluation'" class="review-list">
        <div class="review-card quality-controls">
          <h2>固定问题评测集</h2>
          <p>先选本校已核实资料，再写用户可能提出的问法。命中率只衡量资料召回，不等于最终答案正确率。</p>
          <p>资料修订后，评测会沿版本记录核对当前有效版本，原题保留；资料下架或过期仍计为未命中。</p>
          <form class="quality-form" @submit.prevent="addEvaluation">
            <input v-model="evaluationForm.question" aria-label="评测问题" :disabled="qualityBusy || actionBusy" maxlength="500" placeholder="例如：图书馆周末几点关门？" />
            <select v-model="evaluationForm.expectedDocumentId" aria-label="标准资料" :disabled="qualityBusy || actionBusy">
              <option value="">选择标准资料</option>
              <option v-for="item in documents.filter((doc) => doc.status === 'PUBLISHED')"
                :key="item.id" :value="item.id">#{{ item.id }} {{ item.title }}</option>
            </select>
            <button type="submit" :disabled="qualityBusy || actionBusy">加入题集</button>
          </form>
          <div class="card-actions">
            <button type="button" :disabled="qualityBusy || actionBusy || evaluationCases.length === 0"
              @click="evaluateKnowledge">运行固定题集</button>
            <button type="button" :disabled="qualityBusy || actionBusy" @click="indexKnowledge">建立下一批向量索引</button>
          </div>
          <p v-if="evaluationReport">
            命中 {{ evaluationReport.hitsAtFive }}/{{ evaluationReport.total }} ·
            Recall@5 {{ (evaluationReport.recallAtFive * 100).toFixed(1) }}% ·
            MRR {{ evaluationReport.meanReciprocalRank.toFixed(2) }}
          </p>
        </div>
        <article v-for="item in evaluationCases" :key="item.id" class="review-card">
          <div class="card-meta"><span>固定问题 #{{ item.id }}</span>
            <span v-if="evaluationReport">{{ evaluationReport.cases.find((entry) => entry.id === item.id)?.rank
              ? `第 ${evaluationReport.cases.find((entry) => entry.id === item.id).rank} 位` : '未命中' }}</span></div>
          <h2>{{ item.question }}</h2><p>{{ evaluationTargetLabel(item, evaluationReport) }}</p>
          <div class="card-actions"><button type="button" :disabled="qualityBusy || actionBusy"
            @click="removeEvaluation(item)">移除</button></div>
        </article>
      </section>

      <section v-else class="review-list feedback-list">
        <div v-if="sectionErrors.feedback" class="empty-state"><strong>回答反馈尚未读取成功</strong><span>请重试读取，其他后台模块仍可使用</span></div>
        <div v-else-if="feedback.length === 0" class="empty-state">
          <el-icon><Check /></el-icon>
          <strong>暂时没有回答反馈</strong>
          <span>用户在聊天中评价回答后会显示在这里</span>
        </div>

        <article
          v-for="item in feedback"
          v-else
          :key="item.id"
          class="review-card feedback-card"
          :class="{ helpful: item.helpful }"
        >
          <div class="card-meta">
            <span>{{ item.helpful ? '有帮助' : '需要改进' }}</span>
            <time>{{ formatDate(item.updatedAt) }}</time>
          </div>
          <h2>{{ item.questionContent || '未找到对应问题' }}</h2>
          <p class="answer-preview">{{ item.answerContent }}</p>
          <blockquote v-if="item.reason">{{ item.reason }}</blockquote>
          <p v-if="item.resolutionNote" class="resolution-note">
            已处理：{{ item.resolutionNote }}
            <span v-if="item.resolvedDocumentId"> · 关联资料 #{{ item.resolvedDocumentId }}</span>
          </p>
          <form v-else-if="!item.helpful" class="quality-form feedback-resolution"
            @submit.prevent="resolveFeedback(item)">
            <input v-model="resolutionDrafts[item.id].note" :disabled="actionBusy" maxlength="500"
              placeholder="核实结果或具体修复说明" />
            <select v-model="resolutionDrafts[item.id].documentId" :disabled="actionBusy">
              <option value="">不关联资料</option>
              <option v-for="doc in documents.filter((entry) => entry.status === 'PUBLISHED')"
                :key="doc.id" :value="doc.id">#{{ doc.id }} {{ doc.title }}</option>
            </select>
            <button type="submit" :disabled="qualityBusy || actionBusy">标记已处理</button>
          </form>
          <div class="feedback-user">
            来自 {{ item.nickname || item.username }} · 消息 #{{ item.messageId }}
          </div>
        </article>
      </section>
      <!-- Keep this in-memory editor mounted across admin module switches. -->
      <AdminBatchImportPanel v-if="adminAuth.user" v-show="!loading && activeTab === 'import'"
        ref="batchImport" :school-id="adminAuth.user.schoolId" @published="refreshDocumentsAfterImport" />
    </main>
  </div>
</template>

<style scoped>
.resolution-note {
  padding: 12px 14px;
  color: #27623c;
  background: #f0f8f1;
  border-radius: 12px;
}
.quality-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, 0.65fr) auto;
  gap: 10px;
  margin: 20px 0;
}
.quality-form input,
.quality-form select {
  min-width: 0;
  padding: 11px 14px;
  border: 1px solid #d9dce3;
  border-radius: 12px;
  background: #fff;
  font: inherit;
}
.quality-form button {
  padding: 11px 18px;
  color: #fff;
  background: #1769c2;
  border-radius: 12px;
}
@media (max-width: 720px) {
  .quality-form { grid-template-columns: 1fr; }
}
.admin-page {
  display: grid;
  grid-template-columns: 256px minmax(0, 1fr);
  min-height: 100svh;
  color: #1d1d1f;
  background: radial-gradient(circle at 84% 8%, rgba(10, 132, 255, 0.08), transparent 24%), #fbfbfd;
}
button {
  color: inherit;
  border: 0;
  cursor: pointer;
}
.admin-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100svh;
  padding: 24px 16px 18px;
  flex-direction: column;
  background: rgba(245, 245, 247, 0.86);
  border-right: 1px solid rgba(29, 29, 31, 0.08);
  backdrop-filter: blur(28px) saturate(150%);
}
.back-button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  align-self: flex-start;
  padding: 7px 8px;
  color: #6e6e73;
  font-size: 12px;
  background: transparent;
}
.admin-brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 34px 8px 42px;
}
.brand-mark {
  display: block;
  width: 36px;
  height: 32px;
  object-fit: contain;
  filter: none;
}
.admin-brand div,
.admin-user {
  display: flex;
  flex-direction: column;
}
.admin-brand strong {
  font-size: 17px;
  letter-spacing: -0.03em;
}
.admin-brand small,
.admin-user small {
  margin-top: 3px;
  color: #86868b;
  font-size: 8px;
  font-weight: 650;
  letter-spacing: 0.12em;
}
.admin-sidebar nav {
  display: flex;
  gap: 7px;
  flex-direction: column;
}
.admin-sidebar nav button {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  gap: 10px;
  align-items: center;
  min-height: 44px;
  padding: 0 12px;
  color: #6e6e73;
  font-size: 13px;
  text-align: left;
  background: transparent;
  border-radius: 12px;
  transition: 180ms ease;
}
.admin-sidebar nav button.active {
  color: #1d1d1f;
  background: #fff;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.06);
}
.admin-sidebar nav i {
  min-width: 23px;
  padding: 3px 6px;
  color: #6e6e73;
  font-size: 10px;
  font-style: normal;
  text-align: center;
  background: #e8e8ed;
  border-radius: 999px;
}
.admin-user {
  gap: 3px;
  margin-top: auto;
  padding: 16px 10px 0;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}
.admin-user strong {
  font-size: 12px;
}
.admin-exit {
  align-self: flex-start;
  margin-top: 12px;
  padding: 5px 0;
  color: #6e6e73;
  font-size: 11px;
  background: transparent;
}
.admin-exit:hover { color: #1d1d1f; }
main {
  width: min(940px, calc(100% - 64px));
  margin: 0 auto;
  padding: 72px 0 100px;
}
header p {
  margin: 0 0 16px;
  color: #0071e3;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.17em;
}
header h1 {
  margin: 0;
  font-size: clamp(42px, 6vw, 70px);
  font-weight: 650;
  letter-spacing: -0.06em;
}
header > span {
  display: block;
  max-width: 620px;
  margin-top: 18px;
  color: #6e6e73;
  font-size: 15px;
  line-height: 1.7;
}
.overview-panel { margin-top: 48px; }
.overview-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
  color: #777980;
  font-size: 12px;
}
.overview-toolbar button,
.overview-section-heading button {
  padding: 7px 0;
  color: #0069d4;
  font-size: 12px;
  font-weight: 650;
  background: transparent;
}
.overview-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.overview-metric {
  display: flex;
  min-width: 0;
  min-height: 168px;
  flex-direction: column;
  align-items: flex-start;
  padding: 24px;
  text-align: left;
  background: #fff;
  border: 1px solid #e9eaed;
  border-radius: 20px;
  box-shadow: 0 8px 30px rgba(29, 29, 31, 0.025);
}
.overview-metric-action { transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease; }
.overview-metric-action:hover {
  border-color: #c7dafa;
  box-shadow: 0 12px 30px rgba(25, 82, 152, 0.065);
  transform: translateY(-2px);
}
.overview-metric > span { color: #65676e; font-size: 13px; font-weight: 600; }
.overview-metric strong {
  margin: 15px 0 10px;
  font-size: clamp(31px, 3vw, 42px);
  font-variant-numeric: tabular-nums;
  font-weight: 680;
  letter-spacing: -0.055em;
  line-height: 1;
}
.overview-metric small { margin-top: auto; color: #898b91; font-size: 11px; line-height: 1.5; }
.overview-metric-action small span { margin-left: 4px; color: #0071e3; }
.overview-metric-secondary { background: #f6f8fb; box-shadow: none; }
.overview-bottom {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  margin-top: 14px;
}
.overview-section {
  min-width: 0;
  padding: 26px;
  background: #fff;
  border: 1px solid #e9eaed;
  border-radius: 22px;
}
.overview-section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}
.overview-section-heading > div > span { color: #0071e3; font-size: 9px; font-weight: 750; letter-spacing: .14em; }
.overview-section-heading h2 { margin: 7px 0 0; font-size: 21px; font-weight: 660; letter-spacing: -.035em; }
.overview-section-heading small { color: #8d8f96; font-size: 11px; }
.overview-queue-row {
  display: grid;
  grid-template-columns: 1fr auto 15px;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 0;
  text-align: left;
  background: transparent;
  border-top: 1px solid #f0f0f2;
}
.overview-queue-row span { color: #484a51; font-size: 13px; }
.overview-queue-row strong { font-size: 14px; font-variant-numeric: tabular-nums; }
.overview-queue-row i { color: #a0a2a8; font-size: 14px; font-style: normal; }
.failed-jobs { margin-top: 14px; }.failed-job-row { grid-template-columns: minmax(0,1fr) auto auto; }.failed-job-row button { min-height: 38px; padding: 0 12px; color: #8a3f13; font-size: 12px; font-weight: 650; background: #fff1e8; border-radius: 9px; }.failed-job-row button:disabled { opacity: .55; cursor: wait; }
.overview-hint { margin: 0; color: #888b92; font-size: 13px; line-height: 1.7; }
.overview-provider + .overview-provider { margin-top: 19px; }
.overview-provider > div:first-child { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 9px; font-size: 12px; }
.overview-provider strong { font-variant-numeric: tabular-nums; font-weight: 650; }
.overview-provider-track { height: 6px; overflow: hidden; background: #eef0f4; border-radius: 99px; }
.overview-provider-track span { display: block; height: 100%; background: #4089d7; border-radius: inherit; }
.overview-unavailable { min-height: 300px; }
.overview-unavailable button { margin-top: 20px; padding: 9px 18px; color: #fff; background: #0071e3; border-radius: 9px; }
.overview-panel button:focus-visible,
.admin-exit:focus-visible { outline: 2px solid #0071e3; outline-offset: 3px; }
.review-list {
  display: grid;
  gap: 18px;
  margin-top: 56px;
}

.usage-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: 18px;
  margin-top: 56px;
}
.usage-panel .empty-state {
  grid-column: 1 / -1;
}
.usage-card {
  padding: 28px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(29, 29, 31, 0.08);
  border-radius: 24px;
  box-shadow: 0 18px 42px rgba(29, 29, 31, 0.035);
}
.usage-card > span {
  display: block;
  color: #6e6e73;
  font-size: 13px;
  font-weight: 650;
}
.usage-card > strong {
  display: block;
  margin: 18px 0 26px;
  font-size: clamp(28px, 3vw, 40px);
  letter-spacing: -0.05em;
}
.usage-estimate-note { margin: 18px 0 0; color: #86868b; font-size: 11px; line-height: 1.5; }
.usage-card > strong small {
  color: #86868b;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
}
.usage-card dl {
  display: grid;
  gap: 11px;
  margin: 0;
  padding-top: 18px;
  border-top: 1px solid rgba(29, 29, 31, 0.08);
}
.usage-card dl div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.usage-card dt,
.usage-card dd {
  margin: 0;
  font-size: 12px;
}
.usage-card dt {
  color: #86868b;
}
.usage-card dd {
  color: #1d1d1f;
  font-variant-numeric: tabular-nums;
}

.import-panel {
  margin-top: 56px;
}

.import-form {
  padding: 30px 32px 28px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(29, 29, 31, 0.07);
  border-radius: 24px;
  box-shadow: 0 16px 55px rgba(0, 0, 0, 0.055);
}

.import-form-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.import-form-heading span {
  color: #0071e3;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.15em;
}

.import-form-heading h2 {
  margin: 10px 0 0;
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.import-form-heading > .el-icon {
  padding: 10px;
  color: #0071e3;
  font-size: 21px;
  background: rgba(0, 113, 227, 0.08);
  border-radius: 12px;
}

.import-notice {
  margin: 14px 0 25px;
  color: #6e6e73;
  font-size: 12px;
  line-height: 1.65;
}

.import-source {
  margin: 22px 0 26px;
  padding: 18px;
  background: #f7f8fa;
  border: 1px solid rgba(29, 29, 31, 0.08);
  border-radius: 16px;
}

.import-source-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 16px;
  margin-bottom: 14px;
}

.import-source-heading strong {
  color: #1d1d1f;
  font-size: 14px;
}

.import-source-heading > span,
.import-preview-status {
  color: #63636a;
  font-size: 12px;
  line-height: 1.55;
}

.import-source-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(180px, 0.55fr);
  align-items: end;
  gap: 10px;
}

.import-source-actions > button {
  min-height: 43px;
  padding: 0 18px;
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  background: #1d1d1f;
  border: 0;
  border-radius: 11px;
  cursor: pointer;
  transition: background 180ms ease, opacity 180ms ease;
}

.import-source-actions > button:hover:not(:disabled) {
  background: #0071e3;
}

.import-source-actions > button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.import-source-file input[type='file'] {
  min-height: 43px;
  min-width: 0;
  max-width: 100%;
  padding: 9px 10px;
  cursor: pointer;
}

.import-preview-status {
  margin: 14px 0 0;
  padding: 11px 12px;
  background: #edf4ff;
  border-radius: 10px;
}

.import-conflict-link {
  padding: 0 2px;
  color: #005fc2;
  font: inherit;
  font-weight: 650;
  background: none;
  border: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.import-conflict-link:focus-visible {
  outline: 2px solid #0071e3;
  outline-offset: 3px;
}

@media (max-width: 760px) {
  .import-source-actions {
    grid-template-columns: 1fr;
  }
}

.import-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 15px;
}

.import-form label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.import-form label > span {
  color: #6e6e73;
  font-size: 10px;
  font-weight: 650;
}

.import-form input,
.import-form textarea {
  width: 100%;
  padding: 11px 12px;
  color: #1d1d1f;
  font: inherit;
  font-size: 12px;
  background: #f5f5f7;
  border: 1px solid transparent;
  border-radius: 11px;
  outline: none;
  box-sizing: border-box;
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.import-form input:focus,
.import-form textarea:focus {
  background: #fff;
  border-color: rgba(0, 113, 227, 0.45);
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.08);
}

.import-content-field {
  margin-top: 16px;
}

.import-form textarea {
  min-height: 230px;
  resize: vertical;
  line-height: 1.65;
}

.import-form-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid rgba(29, 29, 31, 0.07);
}

.import-form-actions > span {
  color: #86868b;
  font-size: 10px;
}

.import-form-actions > button {
  min-height: 40px;
  padding: 0 17px;
  color: #fff;
  font-size: 12px;
  font-weight: 650;
  background: #1d1d1f;
  border-radius: 999px;
  transition: background 180ms ease, transform 180ms ease, opacity 180ms ease;
}

.import-form-actions > button:hover:not(:disabled) {
  background: #0071e3;
  transform: translateY(-1px);
}

.import-form-actions > button:disabled {
  cursor: wait;
  opacity: 0.5;
}

.review-card {
  padding: 30px 32px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(29, 29, 31, 0.07);
  border-radius: 24px;
  box-shadow: 0 16px 55px rgba(0, 0, 0, 0.055);
}
.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-meta span {
  padding: 5px 9px;
  color: #9a6700;
  font-size: 10px;
  font-weight: 650;
  background: #fff3cd;
  border-radius: 999px;
}
.card-meta time {
  color: #a1a1a6;
  font-size: 11px;
}
.review-card h2 {
  margin: 23px 0 12px;
  font-size: 23px;
  font-weight: 650;
  letter-spacing: -0.035em;
}
.review-card > p {
  margin: 0;
  color: #515154;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.review-card > a {
  display: inline-block;
  margin-top: 16px;
  color: #0071e3;
  font-size: 12px;
  text-decoration: none;
}
.card-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px solid rgba(29, 29, 31, 0.07);
}
.card-actions button,
.reject-panel button {
  min-height: 38px;
  padding: 0 16px;
  font-size: 12px;
  font-weight: 600;
  background: #ededf0;
  border-radius: 999px;
}
.card-actions button:last-child,
.reject-panel button:last-child {
  color: #fff;
  background: #1d1d1f;
}
.card-actions button:disabled,
.reject-panel button:disabled {
  cursor: wait;
  opacity: 0.5;
}
.reject-panel {
  margin-top: 24px;
  padding: 18px;
  background: #f5f5f7;
  border-radius: 16px;
}
.reject-panel textarea {
  width: 100%;
  padding: 13px 14px;
  resize: none;
  font: inherit;
  font-size: 13px;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 12px;
  outline: none;
  box-sizing: border-box;
}
.reject-panel textarea:focus {
  border-color: #0071e3;
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.1);
}
.merge-panel label { display: block; margin: 10px 0; color: #575a62; font-size: 12px; }
.merge-panel select,.merge-panel input {
  box-sizing: border-box; display: block; width: 100%; margin-top: 7px; padding: 10px 12px;
  color: #1d1d1f; font: inherit; background: #fff; border: 1px solid #d9dce3; border-radius: 10px;
}
.merge-panel p { color: #6e6e73; font-size: 12px; line-height: 1.6; }
.reject-panel div {
  display: flex;
  gap: 9px;
  justify-content: flex-end;
  margin-top: 12px;
}
.contact-card.handled {
  opacity: 0.66;
}
.contact-card.handled .card-meta span {
  color: #248a3d;
  background: #e8f7ec;
}
.contact-card dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 22px 0 0;
}
.contact-card dl div {
  padding: 12px 14px;
  background: #f5f5f7;
  border-radius: 12px;
}
.contact-card dt {
  color: #86868b;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.08em;
}
.contact-card dd {
  margin: 5px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.feedback-card .card-meta span {
  color: #b42318;
  background: #fff0ee;
}
.feedback-card.helpful .card-meta span {
  color: #248a3d;
  background: #e8f7ec;
}
.feedback-card .answer-preview {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}
.feedback-card blockquote {
  margin: 20px 0 0;
  padding: 14px 16px;
  color: #1d1d1f;
  font-size: 13px;
  line-height: 1.65;
  background: #f5f5f7;
  border-left: 3px solid #ff453a;
  border-radius: 0 12px 12px 0;
}
.feedback-user {
  margin-top: 20px;
  padding-top: 16px;
  color: #86868b;
  font-size: 10px;
  border-top: 1px solid rgba(29, 29, 31, 0.07);
}
.card-actions > span {
  margin-right: auto;
  color: #86868b;
  font-size: 11px;
}
.empty-state {
  display: flex;
  min-height: 280px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #86868b;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(29, 29, 31, 0.06);
  border-radius: 24px;
}
.empty-state .el-icon {
  margin-bottom: 16px;
  color: #248a3d;
  font-size: 28px;
}
.empty-state strong {
  color: #1d1d1f;
  font-size: 16px;
}
.empty-state span {
  margin-top: 8px;
  font-size: 12px;
}
.source-update-section {
  margin-bottom: 28px;
  padding: 22px;
  background: #f4f8ff;
  border: 1px solid #d8e8fb;
  border-radius: 22px;
}
.source-update-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
  list-style: none;
}
.source-update-heading::-webkit-details-marker { display: none; }
.source-update-heading:focus-visible { outline: 2px solid #3348e7; outline-offset: 6px; border-radius: 10px; }
.source-update-list {
  display: grid;
  gap: 14px;
  margin-top: 18px;
}
.source-update-heading span {
  color: #0069d4;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .15em;
}
.source-update-heading h2 {
  margin: 6px 0 0;
  color: #1d1d1f;
  font-size: 22px;
  letter-spacing: -.035em;
}
.source-update-heading small {
  color: #5e6875;
  font-size: 12px;
}
.source-update-card {
  margin: 0;
  box-shadow: none;
}
.source-update-card details {
  margin-top: 15px;
  padding: 13px 15px;
  background: #f7f7f8;
  border-radius: 12px;
}
.source-update-card summary {
  color: #3f4650;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
}
.source-update-card details p {
  max-height: 300px;
  margin: 12px 0 0;
  overflow: auto;
  color: #525862;
  font-size: 13px;
  line-height: 1.75;
  white-space: pre-wrap;
}
.loading-state {
  margin-top: 56px;
}
.loading-state i {
  width: 24px;
  height: 24px;
  margin-bottom: 17px;
  border: 2px solid #e5e5ea;
  border-top-color: #0071e3;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 760px) {
  .admin-page {
    grid-template-columns: 1fr;
  }
  .admin-sidebar {
    position: relative;
    height: auto;
    padding: 14px 14px 10px;
  }
  .admin-brand {
    display: none;
  }
  .admin-user {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding: 10px 4px 0;
  }
  .admin-user small { display: none; }
  .admin-exit { margin-top: 0; }
  .admin-sidebar nav {
    margin-top: 12px;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .admin-sidebar nav button {
    flex: 1 1 calc(50% - 4px);
  }
  main {
    width: calc(100% - 28px);
    padding: 42px 0 70px;
  }
  header h1 {
    font-size: 44px;
  }
  .review-list {
    margin-top: 38px;
  }
  .source-update-section { padding: 16px; border-radius: 18px; }
  .source-update-heading { align-items: flex-start; flex-direction: column; }
  .overview-panel { margin-top: 34px; }
  .overview-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .overview-metric { min-height: 150px; padding: 19px; }
  .overview-bottom { grid-template-columns: 1fr; }
  .import-panel {
    margin-top: 38px;
  }
  .import-form {
    padding: 24px 20px;
    border-radius: 20px;
  }
  .import-form-heading h2 {
    font-size: 24px;
  }
  .import-grid {
    grid-template-columns: 1fr;
  }
  .import-form-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .import-form-actions > button {
    width: 100%;
  }
  .review-card {
    padding: 24px 20px;
    border-radius: 20px;
  }
  .contact-card dl {
    grid-template-columns: 1fr;
  }
  .card-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .card-actions button {
    width: 100%;
  }
}
@media (max-width: 480px) {
  .overview-metrics { grid-template-columns: 1fr 1fr; gap: 9px; }
  .overview-metric { min-height: 140px; padding: 17px; border-radius: 17px; }
  .overview-metric strong { font-size: 30px; }
  .overview-metric > span { font-size: 12px; }
  .overview-metric small { font-size: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .overview-metric-action { transition: none; }
  .overview-metric-action:hover { transform: none; }
}
</style>
