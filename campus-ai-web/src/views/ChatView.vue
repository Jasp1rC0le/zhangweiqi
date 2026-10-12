<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { isCancel } from 'axios'
import { renderMarkdown, safeExternalUrl } from '@/utils/safeMarkdown'
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Delete as DeleteIcon,
  DocumentCopy,
  EditPen,
  Menu,
  Promotion,
  Search,
  Star,
  SwitchButton,
  User,
} from '@element-plus/icons-vue'
import {
  createConversation,
  deleteConversation,
  getDailyAiQuota,
  getConversations,
  getMessages,
  sendMessageStream,
  updateMessageFeedback,
} from '@/api/chat'
import { submitContactMessage } from '@/api/contact'
import { createKnowledgeSubmission, getMyKnowledgeSubmissions } from '@/api/knowledgeSubmission'
import { getSchools } from '@/api/school'
import { getModelOptions } from '@/api/model'
import { useAuthStore } from '@/stores/auth'
import WorkspaceIcon from '@/components/WorkspaceIcon.vue'
import NavigationIcon from '@/components/NavigationIcon.vue'
import CampMark from '@/components/CampMark.vue'
import QuickActionIcon from '@/components/QuickActionIcon.vue'
import CampusDirectory from '@/components/CampusDirectory.vue'
import ProDialog from '@/components/ProDialog.vue'
import ChatDraftRecovery from '@/components/ChatDraftRecovery.vue'
import TimetableTeaser from '@/components/TimetableTeaser.vue'
import { chatDraftRecovery, chatDraftRecoveryState } from '@/utils/chatDraftRecovery.js'
import { createWorkspaceDrafts } from '@/utils/workspaceDrafts.js'
import { createChatRun } from '@/utils/chatRun.js'
import { createLatestRequest } from '@/utils/latestRequest.js'
import { isAdministrator } from '@/utils/adminAccess.js'
import { singleCitedKnowledgeSource } from '@/utils/answerSource.js'
import { quotaPresentation } from '@/utils/quotaPresentation.js'
import '@/styles/chat-tools.css'
import '@/styles/workspace-shell.css'

const router = useRouter()
const route = useRoute()
const expandedWorkspace = ref(false)
const workspaceContent = ref()
function resetWorkspaceScroll(){ workspaceContent.value?.scrollTo({top:0,left:0,behavior:'instant'}) }
const isChatRoute = computed(() => route.name === 'chat' || !route.name)
const contentTitle = computed(() => ({wall:'校园墙',canteens:'食堂评分',projects:'我的项目',reviews:'协作审阅',account:'个人信息',admin:'管理后台',instruments:'仪器资料',study:'实验与作业',timetable:'我的课表',feedback:'提交意见',pro:'Campthink Pro'})[route.name] || '工作区')
watch(() => route.name, async () => {
  const transition = ++routeReadSequence
  if (!isChatRoute.value) {
    cancelAnswer()
    if (historyRequests.cancel()) historyNeedsReload.value = true
  }
  mobileSidebarOpen.value = false
  profileMenuOpen.value = false
  await nextTick()
  if (disposed || transition !== routeReadSequence) return
  if (isChatRoute.value) {
    expandedWorkspace.value=false
    resizeComposer()
    await Promise.all([
      loadConversationList(),
      historyNeedsReload.value && activeConversationId.value ? historyRequests.run(activeConversationId.value) : undefined,
    ])
  }
  else resetWorkspaceScroll()
})
const authStore = useAuthStore()
const draft = ref('')
const conversations = ref([])
const historyQuery = ref('')
const historySearchInput = ref()
const messages = ref([])
const activeConversationId = ref(null)
const loadingConversations = ref(false)
const loadingMessages = ref(false)
const conversationListError = ref('')
const historyError = ref('')
let disposed = false, routeReadSequence = 0
const historyNeedsReload = ref(false)
const conversationListRequests = createLatestRequest({
  load:getConversations,
  onStart:() => { loadingConversations.value=true; conversationListError.value='' },
  onSuccess:result => { conversations.value=result },
  onError:error => { if (!isCancel(error)) conversationListError.value=resolveErrorMessage(error, '对话列表暂时无法读取，请重试') },
  onFinish:() => { loadingConversations.value=false },
})
const historyRequests = createLatestRequest({
  load:getMessages,
  onStart:() => { loadingMessages.value=true; historyError.value=''; historyNeedsReload.value=false },
  onSuccess:(result, request) => {
    messages.value=result
    void nextTick(() => {
      if (!request.isCurrent() || !isChatRoute.value) return
      const element=messageScroller.value
      element?.scrollTo({top:element.scrollHeight,behavior:'auto'})
      stickToBottom.value=true
      showJumpToLatest.value=false
      resizeComposer()
    })
  },
  onError:error => {
    if (isCancel(error)) return
    historyError.value=error.response?.status===404
      ? '这段对话不存在，或你已无权访问'
      : resolveErrorMessage(error, '历史消息暂时无法读取，请重试')
  },
  onFinish:() => { loadingMessages.value=false },
})
const sending = ref(false)
const answerNotice = ref('')
const chatRuns = createChatRun()
const waitingForAnswer = ref(false)
const messageScroller = ref()
const composerInput = ref()
const composerComposing = ref(false)
const stickToBottom = ref(true)
const showJumpToLatest = ref(false)
const submittingContribution = ref(false)
const myKnowledgeSubmissions = ref([])
const currentSchoolName = ref('本校')
const contributionForm = reactive({
  messageId: null,
  question: '',
  content: '',
  sourceUrl: '',
})
const contactVisible = ref(false)
const contactLoading = ref(false)
const mobileSidebarOpen = ref(false)
const mobileLayout = ref(window.matchMedia('(max-width: 760px)').matches)
const sidebarElement = ref()
const menuTrigger = ref()
const mobileMedia = window.matchMedia('(max-width: 760px)')
function updateMobileLayout(event) {
  mobileLayout.value = event.matches
  if (!event.matches) mobileSidebarOpen.value = false
  nextTick(resizeComposer)
}
watch(mobileSidebarOpen, async (open) => {
  if (!mobileLayout.value) return
  await nextTick()
  if (open) sidebarElement.value?.querySelector('button')?.focus()
  else menuTrigger.value?.focus()
})
const pendingDeleteConversation = ref(null)
const deletingConversationId = ref(null)
const feedbackSavingIds = ref([])
const feedbackDrafts = reactive({})
const modelOptions = ref([])
const dailyQuota = ref(null)
const quotaDisplay = computed(() => quotaPresentation(dailyQuota.value))
function readPreferredModel() {
  try { return localStorage.getItem('preferredModel') || 'standard' } catch { return 'standard' }
}
function savePreferredModel(model) {
  try { localStorage.setItem('preferredModel', model) } catch { /* Preference is optional. */ }
}
const selectedModelKey = ref(readPreferredModel())
const membershipVisible = ref(false)
const membershipPresent = ref(false)
watch(() => route.query.pro, async (requested) => {
  if (requested !== '1') return
  await nextTick()
  membershipVisible.value = true
  const query = { ...route.query }
  delete query.pro
  await router.replace({ path: route.path, query, hash: route.hash })
}, { immediate: true })
const workspaceScene = ref()
const switchingWorkspace = ref(false)
const pendingWorkspaceKey = ref(null)
const selectedQuickAction = ref(null)
const workspaceDrafts = createWorkspaceDrafts()
const pendingDrafts = ref([])
const draftRecoveryNotice = ref('')
const draftsReady = ref(false)
function checkpointDrafts() {
  if (!draftsReady.value || disposed || !authStore.user || pendingDrafts.value.length) return
  workspaceDrafts.save(selectedModelKey.value, activeConversationId.value, draft.value)
  chatDraftRecovery.save(workspaceDrafts.entries(), {model:selectedModelKey.value, conversationId:activeConversationId.value})
}
watch([draft, selectedModelKey, activeConversationId], checkpointDrafts, {flush:'post'})
function toggleDraftRecovery(enabled) {
  workspaceDrafts.save(selectedModelKey.value, activeConversationId.value, draft.value)
  const saved = chatDraftRecovery.setEnabled(enabled, workspaceDrafts.entries(), {model:selectedModelKey.value, conversationId:activeConversationId.value})
  draftRecoveryNotice.value = saved ? (enabled ? '已开启本标签页临时保存，不会自动发送' : '已关闭并清除暂存副本，当前输入仍保留') : ''
}
function discardRecoveredDrafts() {
  pendingDrafts.value = []
  toggleDraftRecovery(false)
}
async function restoreChatDraft(entry) {
  if (!entry || sending.value || switchingWorkspace.value || loadingMessages.value || deletingConversationId.value) return
  if (draft.value.trim()) { draftRecoveryNotice.value = '输入框已有文字，请先复制并清空输入框，或选择不恢复，避免覆盖'; return }
  const saved = chatDraftRecovery.snapshot()
  const target = saved?.entries.find(item => item.model === entry.model && item.conversationId === entry.conversationId)
  if (!target) {
    pendingDrafts.value = []
    draftRecoveryNotice.value = '暂存已过期或被清除，没有恢复任何内容'
    return
  }
  // Authentication has completed; the original conversation is still loaded
  // through its protected endpoint, never inferred from this local snapshot.
  historyRequests.cancel()
  for (const item of saved.entries) workspaceDrafts.save(item.model, item.conversationId, item.text)
  selectedModelKey.value = target.model
  activeConversationId.value = target.conversationId
  messages.value = []
  historyError.value = ''
  answerNotice.value = ''
  historyNeedsReload.value = false
  pendingDrafts.value = []
  draft.value = target.text
  savePreferredModel(target.model)
  draftRecoveryNotice.value = modelOptions.value.some(model => model.key === target.model && model.available)
    ? '草稿已恢复，其他草稿仍按原模块和对话保留；核对后再发送'
    : '草稿已恢复；原模块暂时不可用，可以复制文字，或稍后重试'
  await nextTick()
  if (disposed || !isChatRoute.value || activeConversationId.value !== target.conversationId || selectedModelKey.value !== target.model) return
  resizeComposer()
  composerInput.value?.focus()
  if (target.conversationId) await historyRequests.run(target.conversationId)
}
let workspaceTransitionId = 0
let workspaceAnimation
const profileMenuOpen = ref(false)
const logoutConfirmVisible = ref(false)
const logoutBusy = ref(false)
const logoutError = ref('')
const logoutDialog = ref()
watch(logoutConfirmVisible, async open => {
  await nextTick()
  if (open) logoutDialog.value?.focus()
  else sidebarElement.value?.querySelector('.profile')?.focus()
})
watch(logoutBusy, async busy => {
  if (busy) { await nextTick(); logoutDialog.value?.focus() }
})
let streamScrollFrame = null
const contactForm = reactive({
  name: '',
  contact: '',
  subject: '',
  message: '',
})

const displayName = computed(() => authStore.user?.nickname || authStore.user?.username || '同学')
const isAdmin = computed(() => isAdministrator(authStore.user))
const filteredConversations = computed(() => {
  const query = historyQuery.value.trim().toLocaleLowerCase()
  if (!query) return conversations.value
  return conversations.value.filter((conversation) =>
    (conversation.title || '新对话').toLocaleLowerCase().includes(query),
  )
})

const workspaceDefinitions = [
  {
    key: 'standard',
    label: '问答',
    provider: 'DeepSeek',
    subtitle: '查询校园资料、最新信息和日常问题',
    placeholder: '询问校园事务、课程、实习或最新信息',
    waiting: '正在整理回答',
    suggestions: [
      { title: '校园速查', description: '开放时间、办事流程，一步选好', icon: 'campus', action: 'campus', label: '选择要查的事' },
      { title: '食堂评分', description: '看看同学怎么评，决定下一顿', icon: 'dining', route: '/canteens', label: '去看真实评分' },
      { title: '学习计划', description: '填上目标，拆解下一步怎么学', icon: 'plan', label: '建立我的计划', prompt: '请帮我制定一份可执行的学习计划。\n\n学习目标：\n目前基础：\n每周可投入时间：\n希望完成的日期：\n\n请按阶段列出任务、练习和检验标准。' },
    ],
  },
  {
    key: 'kimi',
    label: '论文',
    provider: 'Kimi',
    subtitle: '阅读、梳理论文，完成提纲与长文本写作',
    placeholder: '粘贴论文内容，或描述选题、结构和写作要求',
    waiting: '正在梳理论文结构与证据',
    suggestions: [
      { title: '拆解论文', description: '提炼问题、方法与证据边界', icon: 'read', label: '粘贴论文开始', prompt: '请根据我提供的论文，整理研究问题、方法、数据、结论和局限。不要补造原文没有的信息。\n\n论文内容：\n' },
      { title: '搭建提纲', description: '从研究问题到清晰的章节结构', icon: 'outline', label: '填写选题信息', prompt: '请帮我搭建论文提纲。\n\n选题方向：\n研究问题：\n可用资料或数据：\n字数与格式要求：\n\n请指出还缺少哪些必要信息。' },
      { title: '梳理文献', description: '比较观点，找出值得追问的空白', icon: 'research', label: '整理阅读材料', prompt: '请根据以下文献材料，按主题、方法与结论整理比较框架，并标明证据出处。不要编造文献。\n\n研究主题：\n文献材料：\n' },
    ],
  },
  {
    key: 'glm',
    label: '代码',
    provider: 'GLM',
    subtitle: '生成、解释和调试代码，明确环境与验证方式',
    placeholder: '描述语言、运行环境、输入输出和报错信息',
    waiting: '正在分析代码与运行约束',
    suggestions: [
      { title: '排查报错', description: '先定位根因，再给最小修改', icon: 'debug', label: '填入错误现场', prompt: '请帮我定位报错根因，给出最小修改与验证步骤。\n\n语言及版本：\n预期行为：\n实际报错：\n相关代码：\n' },
      { title: '实现功能', description: '把输入输出和约束写清楚', icon: 'code', label: '描述功能需求', prompt: '请根据以下约束实现功能，并给出测试示例。\n\n语言及运行环境：\n功能需求：\n输入与预期输出：\n边界条件：\n' },
      { title: '读懂代码', description: '理清执行流程与关键边界', icon: 'explain', label: '粘贴代码分析', prompt: '请按执行顺序解释下面的代码，说明关键设计和边界情况。\n\n我的疑问：\n代码：\n' },
    ],
  },
]

const workspaceKeys = new Set(workspaceDefinitions.map((workspace) => workspace.key))
const activeWorkspace = computed(
  () => workspaceDefinitions.find((workspace) => workspace.key === selectedModelKey.value)
    || workspaceDefinitions[0],
)
const workspaceOptions = computed(() => workspaceDefinitions.map((workspace) => ({
  ...workspace,
  model: modelOptions.value.find((model) => model.key === workspace.key) || null,
})))
const suggestions = computed(() => activeWorkspace.value.suggestions)
const waitingCopy = computed(() => activeWorkspace.value.waiting)
const composerPlaceholder = computed(() => activeWorkspace.value.placeholder)
const campusLookups = [
  { label: '图书馆开放时间', prompt: '请查找本校图书馆的开放时间，注明适用日期和资料来源。如果没有已核实的信息，请明确说明。' },
  { label: '校园卡办理', prompt: '请查询本校校园卡办理、挂失与补办流程，给出已核实的办理地点和资料来源。' },
  { label: '校内办事地点', prompt: '我想查找校内办事地点。\n\n需要办理的事项：\n\n请优先使用本校已核实的资料，并提供来源。' },
  { label: '实习准备', prompt: '请帮我制定第一份实习的准备计划。\n\n专业与年级：\n目标岗位：\n已有技能或项目：\n可投入时间：\n' },
]

function resolveErrorMessage(error, fallback) {
  if (error.code === 'ECONNABORTED') return '回答等待超时，请查看历史记录后重试'
  const response = error.response?.data
  const fieldError = response?.fieldErrors ? Object.values(response.fieldErrors)[0] : undefined
  return response?.message || fieldError || response?.error || fallback
}

function showKnowledgeGap(message) {
  if (message.role !== 'assistant' || message.streaming || message.interrupted
    || message.sources?.length || message.webSources?.length) return false
  const index = messages.value.findIndex(item => item.id === message.id)
  const question = messages.value.slice(0, index).findLast(item => item.role === 'user')?.content || ''
  return /学校|校内|本校|校园|食堂|宿舍|图书馆|教务|学工|中德/.test(question)
}

function citedWebSources(message) {
  const cited = new Set([...String(message.content || '').matchAll(/\[网络\s*(\d+)\]/g)]
    .map(match => Number(match[1]) - 1))
  return (message.webSources || []).filter((_, index) => cited.has(index))
}

function sourceHost(value) {
  const safeUrl = safeExternalUrl(value)
  if (!safeUrl) return '公开网页'

  try {
    return new URL(safeUrl).hostname.replace(/^www\./, '')
  } catch {
    return '公开网页'
  }
}

function formatSourceDate(value) {
  if (!value) return '未标注'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未标注'

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

const campusServiceKeywords = [
  '校园事务',
  '校园生活',
  '办事',
  '图书馆',
  '教务',
  '宿舍',
  '食堂',
  '校园卡',
  '证明',
  '请假',
  '缴费',
  '借阅',
  '开放',
  '报修',
  '场馆',
  '实验室',
  '校历',
  '选课',
  '考试',
  '成绩',
  '学籍',
  '资助',
  '奖学金',
  '失物',
  '快递',
]

function campusServiceResult(message) {
  const cited = singleCitedKnowledgeSource(message)
  if (!cited) return null
  const primarySource = cited.source
  const question = questionForAnswer(message.id) || ''
  const searchableText = [
    question,
    primarySource.title,
    primarySource.category,
    primarySource.sourceDepartment,
  ]
    .filter(Boolean)
    .join(' ')

  if (!campusServiceKeywords.some((keyword) => searchableText.includes(keyword))) return null

  const plainAnswer = (message.content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\[(\d+)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const summary = plainAnswer.length > 118 ? `${plainAnswer.slice(0, 118)}…` : plainAnswer
  const sourceDescriptor = [primarySource.title, primarySource.category].filter(Boolean).join(' ')
  const publishedDate = primarySource.publishedAt ? new Date(primarySource.publishedAt) : null
  const hasValidPublishedDate = publishedDate && !Number.isNaN(publishedDate.getTime())
  const sourceAge =
    hasValidPublishedDate ? Date.now() - publishedDate.getTime() : null
  const isTestSource = /测试|示例|演示/.test(sourceDescriptor)
  const isPossiblyStale = sourceAge !== null && sourceAge > 1000 * 60 * 60 * 24 * 540
  const stateLabel = isTestSource
    ? '测试资料'
    : !hasValidPublishedDate
      ? '日期待确认'
      : isPossiblyStale
        ? '注意时效'
        : '资料可追溯'
  const stateTone =
    isTestSource || !hasValidPublishedDate || isPossiblyStale ? 'caution' : 'verified'

  return {
    title: primarySource.title || '校园事务结果',
    summary: summary || '已根据校内资料整理出当前结果。',
    department: primarySource.sourceDepartment || '校内资料库',
    category: primarySource.category || '校园服务',
    publishedAt: primarySource.publishedAt,
    sourceUrl: safeExternalUrl(primarySource.sourceUrl),
    sourceCount: cited.sourceCount,
    stateLabel,
    stateTone,
  }
}

function hasAdditionalServiceDetail(message) {
  const content = message.content || ''
  const plainAnswer = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\[(\d+)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return plainAnswer.length > 118 || /\r|\n|```|\[[^\]]+\]\([^)]+\)/.test(content)
}

async function copyAnswer(message) {
  try {
    await navigator.clipboard.writeText(`【Campthink AI 生成内容，请核实】\n\n${message.content || ''}`)
    ElMessage.success('回答已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择内容')
  }
}

function isNearBottom() {
  const element = messageScroller.value
  if (!element) return true

  return element.scrollHeight - element.scrollTop - element.clientHeight < 96
}

function handleMessageScroll() {
  stickToBottom.value = isNearBottom()
  showJumpToLatest.value = !stickToBottom.value && messages.value.length > 0
}

async function scrollToBottom(behavior = 'smooth') {
  await nextTick()
  const element = messageScroller.value
  if (!element) return

  element.scrollTo({ top: element.scrollHeight, behavior })
  stickToBottom.value = true
  showJumpToLatest.value = false
}

function scheduleStreamScroll() {
  if (!stickToBottom.value || streamScrollFrame !== null) return

  streamScrollFrame = window.requestAnimationFrame(async () => {
    streamScrollFrame = null
    await nextTick()
    const element = messageScroller.value
    if (!element || !stickToBottom.value) return
    element.scrollTop = element.scrollHeight
    showJumpToLatest.value = false
  })
}

function resizeComposer() {
  const element = composerInput.value
  if (!element) return

  element.style.height = 'auto'
  const height = element.scrollHeight
  element.style.height = `${Math.max(38, Math.min(height, 138))}px`
  element.style.overflowY = height > 138 ? 'auto' : 'hidden'
}

function handleComposerEnter(event) {
  // Enter confirms a Chinese IME candidate before it should send a message.
  if (composerComposing.value || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  submitPrompt()
}

async function loadConversationList() {
  await conversationListRequests.run()
}

async function loadModelOptions() {
  try {
    modelOptions.value = await getModelOptions()
    const preferredModel = modelOptions.value.find(
      (model) => workspaceKeys.has(model.key)
        && model.key === selectedModelKey.value
        && model.available,
    )

    if (!preferredModel) {
      selectedModelKey.value = 'standard'
      savePreferredModel('standard')
    }
  } catch (error) {
    modelOptions.value = [
      {
        key: 'standard',
        name: '快速回答',
        description: '校园资料与日常问答',
        premium: false,
        available: true,
      },
    ]
    selectedModelKey.value = 'standard'
    savePreferredModel('standard')
    ElMessage.error(resolveErrorMessage(error, '模型列表加载失败，已使用默认模型'))
  }
}

async function loadDailyQuota() {
  try { dailyQuota.value = await getDailyAiQuota() }
  catch { dailyQuota.value = null }
}

async function chooseWorkspace(workspace) {
  if (sending.value || loadingMessages.value || deletingConversationId.value) return
  const model = workspace.model
  if (!model) {
    ElMessage.warning(`${workspace.label}模块暂时不可用`)
    return
  }

  if (model.configured === false) {
    ElMessage.warning(`${workspace.provider} 尚未完成服务或成本配置，暂未开放`)
    return
  }

  if (!model.available) {
    membershipVisible.value = true
    return
  }

  if (model.key === (pendingWorkspaceKey.value || selectedModelKey.value)) return
  const transitionId = ++workspaceTransitionId
  pendingWorkspaceKey.value = model.key
  switchingWorkspace.value = true
  const currentOpacity = workspaceScene.value ? getComputedStyle(workspaceScene.value).opacity : 1
  workspaceAnimation?.cancel()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reducedMotion && workspaceScene.value) {
    workspaceAnimation = workspaceScene.value.animate(
      [{ opacity: currentOpacity, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-7px)' }],
      { duration: 140, easing: 'ease-out', fill: 'forwards' },
    )
    await workspaceAnimation.finished.catch(() => {})
  }
  if (transitionId !== workspaceTransitionId) return
  workspaceDrafts.save(selectedModelKey.value, activeConversationId.value, draft.value)
  selectedModelKey.value = model.key
  savePreferredModel(model.key)
  activeConversationId.value = null
  historyError.value = ''
  answerNotice.value = ''
  messages.value = []
  draft.value = workspaceDrafts.read(model.key)
  selectedQuickAction.value = null
  showJumpToLatest.value = false
  stickToBottom.value = true
  await nextTick()
  if (transitionId !== workspaceTransitionId) return
  resizeComposer()
  messageScroller.value?.scrollTo({ top: 0, behavior: 'instant' })
  workspaceAnimation?.cancel()
  if (!reducedMotion && workspaceScene.value) {
    workspaceAnimation = workspaceScene.value.animate(
      [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 330, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    )
    await workspaceAnimation.finished.catch(() => {})
  }
  if (transitionId !== workspaceTransitionId) return
  workspaceAnimation?.cancel()
  switchingWorkspace.value = false
  pendingWorkspaceKey.value = null
}

function openMembership() {
  mobileSidebarOpen.value = false
  membershipVisible.value = true
}

function openAdminConsole() {
  mobileSidebarOpen.value = false
  router.push('/admin')
}

async function selectConversation(conversationId) {
  if (!isChatRoute.value) { await router.push('/chat'); if (!isChatRoute.value) return }
  if (disposed || sending.value || switchingWorkspace.value || deletingConversationId.value) return
  if (activeConversationId.value === conversationId && !historyError.value && !historyNeedsReload.value) return

  workspaceDrafts.save(selectedModelKey.value, activeConversationId.value, draft.value)
  activeConversationId.value = conversationId
  answerNotice.value = ''
  const conversation = conversations.value.find((item) => item.id === conversationId)
  const savedModel = modelOptions.value.find(
    (model) => workspaceKeys.has(model.key)
      && model.key === conversation?.model
      && model.available,
  )
  selectedModelKey.value = savedModel?.key || 'standard'
  draft.value = workspaceDrafts.read(selectedModelKey.value, conversationId)
  selectedQuickAction.value = null
  savePreferredModel(selectedModelKey.value)
  mobileSidebarOpen.value = false
  messages.value = []
  stickToBottom.value = true
  showJumpToLatest.value = false

  await historyRequests.run(conversationId)
}

async function startNewConversation() {
  if (!isChatRoute.value) { await router.push('/chat'); if (!isChatRoute.value) return }
  if (disposed || sending.value || switchingWorkspace.value || deletingConversationId.value) return

  historyRequests.cancel()
  historyNeedsReload.value = false
  workspaceDrafts.save(selectedModelKey.value, activeConversationId.value, draft.value)
  answerNotice.value = ''
  activeConversationId.value = null
  historyError.value = ''
  messages.value = []
  draft.value = ''
  workspaceDrafts.clear(selectedModelKey.value)
  selectedQuickAction.value = null
  stickToBottom.value = true
  showJumpToLatest.value = false
  mobileSidebarOpen.value = false
  nextTick(() => { resizeComposer(); composerInput.value?.focus() })
}

async function ensureConversation(run) {
  if (activeConversationId.value) return activeConversationId.value

  const conversation = await createConversation('新对话', { signal: run.signal })
  if (!run.isCurrent()) return null
  // An older list snapshot must not remove the conversation just created.
  conversationListRequests.cancel()
  conversations.value.unshift(conversation)
  activeConversationId.value = conversation.id
  return conversation.id
}

function chooseSuggestion(prompt) {
  if (switchingWorkspace.value) return
  // Templates assist writing; never replace text the student has already typed.
  const nextDraft = draft.value.trim() ? `${draft.value.trimEnd()}\n\n${prompt}` : prompt
  if (nextDraft.length > (selectedModelKey.value === 'kimi' ? 50000 : 10000)) {
    ElMessage.warning('输入内容已接近上限，请先整理草稿再添加模板')
    return
  }
  draft.value = nextDraft
  nextTick(() => {
    resizeComposer()
    composerInput.value?.focus()
  })
}

function activateQuickAction(item) {
  if (switchingWorkspace.value) return
  if (item.route) {
    workspaceDrafts.save(selectedModelKey.value, activeConversationId.value, draft.value)
    router.push(item.route)
  } else if (item.action === 'campus') {
    selectedQuickAction.value = selectedQuickAction.value === 'campus' ? null : 'campus'
  } else chooseSuggestion(item.prompt)
}

function questionForAnswer(messageId) {
  const answerIndex = messages.value.findIndex((message) => message.id === messageId)
  return messages.value
    .slice(0, answerIndex)
    .reverse()
    .find((message) => message.role === 'user')
    ?.content?.trim()
}

function submissionForMessage(messageId) {
  const question = questionForAnswer(messageId)
  if (!question) return null

  return myKnowledgeSubmissions.value.find((submission) => submission.question === question) || null
}

function submissionStatusLabel(messageId) {
  const status = submissionForMessage(messageId)?.status
  if (status === 'APPROVED') return '已加入知识库'
  if (status === 'PENDING') return '正在审核'
  return ''
}

function isFeedbackSaving(messageId) {
  return feedbackSavingIds.value.includes(messageId)
}

async function setMessageFeedback(message, helpful, reason = null) {
  if (isFeedbackSaving(message.id)) return

  const previousHelpful = message.helpful
  const previousReason = message.feedbackReason
  message.helpful = helpful
  if (reason !== null) message.feedbackReason = reason
  feedbackSavingIds.value = [...feedbackSavingIds.value, message.id]

  try {
    const updated = await updateMessageFeedback(
      message.conversationId,
      message.id,
      helpful,
      reason,
    )
    message.helpful = updated.helpful
    message.feedbackReason = updated.feedbackReason
    if (updated.feedbackReason) feedbackDrafts[message.id] = updated.feedbackReason
  } catch (error) {
    message.helpful = previousHelpful
    message.feedbackReason = previousReason
    ElMessage.error(resolveErrorMessage(error, '反馈保存失败，请稍后重试'))
  } finally {
    feedbackSavingIds.value = feedbackSavingIds.value.filter((id) => id !== message.id)
  }
}

async function saveFeedbackReason(message) {
  const reason = (feedbackDrafts[message.id] || '').trim()
  if (!reason) {
    ElMessage.warning('请简单说明哪里需要改进')
    return
  }

  await setMessageFeedback(message, false, reason)
}

function beginContribution(messageId) {
  const question = questionForAnswer(messageId)
  contributionForm.messageId = messageId
  contributionForm.question = question || '补充当前校园问题的相关信息'
  contributionForm.content = ''
  contributionForm.sourceUrl = ''

  nextTick(() => {
    document.getElementById(`contribution-${messageId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  })
}

function closeContribution() {
  if (submittingContribution.value) return
  contributionForm.messageId = null
  contributionForm.question = ''
  contributionForm.content = ''
  contributionForm.sourceUrl = ''
}

async function submitContribution() {
  const content = contributionForm.content.trim()

  if (!content) {
    ElMessage.warning('请填写你知道的校园信息')
    return
  }

  submittingContribution.value = true
  let submitted = false

  try {
    const submission = await createKnowledgeSubmission({
      question: contributionForm.question,
      content,
      sourceUrl: contributionForm.sourceUrl.trim() || null,
    })

    myKnowledgeSubmissions.value.unshift(submission)
    submitted = true
    ElMessage.success('补充内容已提交，管理员审核后会进入校园知识库')
  } catch (error) {
    ElMessage.error(resolveErrorMessage(error, '提交失败，请稍后重试'))
  } finally {
    submittingContribution.value = false
    if (submitted) closeContribution()
  }
}

async function loadMyKnowledgeSubmissions() {
  try {
    myKnowledgeSubmissions.value = await getMyKnowledgeSubmissions()
  } catch {
    // 审核状态不影响主聊天流程，失败时仍允许用户继续使用聊天。
  }
}

async function loadCurrentSchool() {
  try {
    const schools = await getSchools()
    const currentSchool = schools.find((school) => school.id === authStore.user?.schoolId)
    if (currentSchool?.name) currentSchoolName.value = currentSchool.name
  } catch {
    // 学校名称加载失败时保留“本校”，不阻塞聊天。
  }
}

function scrollToMessageSources(messageId) {
  const details = document.getElementById(`sources-${messageId}`)
  if (details) details.open = true
  details?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
}

function openContact() {
  mobileSidebarOpen.value = false
  router.push('/feedback')
}

function closeContact() {
  if (!contactLoading.value) contactVisible.value = false
}

async function submitContact() {
  const payload = {
    name: contactForm.name.trim(),
    contact: contactForm.contact.trim(),
    subject: contactForm.subject.trim(),
    message: contactForm.message.trim(),
  }

  if (!payload.name || !payload.contact || !payload.subject || !payload.message) {
    ElMessage.warning('请完整填写意见信息')
    return
  }

  contactLoading.value = true
  try {
    await submitContactMessage(payload)
    contactForm.subject = ''
    contactForm.message = ''
    contactVisible.value = false
    ElMessage.success('消息已提交，管理员会在后台收到')
  } catch (error) {
    ElMessage.error(resolveErrorMessage(error, '提交失败，请稍后重试'))
  } finally {
    contactLoading.value = false
  }
}

function handleEscape(event) {
  if (event.key === 'Tab' && logoutConfirmVisible.value) {
    const items = [...logoutDialog.value.querySelectorAll('button:not(:disabled)')]
    const first = items[0], last = items[items.length - 1]
    if (!first) { event.preventDefault(); logoutDialog.value.focus() }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === logoutDialog.value)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    return
  }
  if (event.key === 'Tab' && mobileLayout.value && mobileSidebarOpen.value) {
    const items = [...sidebarElement.value.querySelectorAll('button:not(:disabled), input, a[href]')]
      .filter((element) => element.getClientRects().length && !element.closest('[inert]'))
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (mobileLayout.value) mobileSidebarOpen.value = true
    nextTick(() => historySearchInput.value?.focus())
    return
  }
  if (event.key !== 'Escape') return
  if (logoutConfirmVisible.value) { if (!logoutBusy.value) logoutConfirmVisible.value = false }
  else if (profileMenuOpen.value) profileMenuOpen.value = false
  else if (membershipVisible.value) membershipVisible.value = false
  else if (contactVisible.value) closeContact()
  else if (pendingDeleteConversation.value) pendingDeleteConversation.value = null
  else mobileSidebarOpen.value = false
}

function requestDeleteConversation(conversation) {
  if (sending.value || loadingMessages.value || switchingWorkspace.value || deletingConversationId.value) return
  pendingDeleteConversation.value = conversation
}

async function confirmDeleteConversation() {
  const conversation = pendingDeleteConversation.value
  if (!conversation || deletingConversationId.value || loadingMessages.value || sending.value || switchingWorkspace.value) return

  deletingConversationId.value = conversation.id
  try {
    await deleteConversation(conversation.id)
    conversationListRequests.cancel()
    workspaceDrafts.forgetConversation(conversation.id)
    pendingDrafts.value = pendingDrafts.value.filter(entry => entry.conversationId !== conversation.id)
    if (pendingDrafts.value.length) chatDraftRecovery.save(pendingDrafts.value, null)
    conversations.value = conversations.value.filter((item) => item.id !== conversation.id)

    if (activeConversationId.value === conversation.id) {
      activeConversationId.value = null
      historyError.value = ''
      messages.value = []
      draft.value = ''
      stickToBottom.value = true
      showJumpToLatest.value = false
    }

    pendingDeleteConversation.value = null
    checkpointDrafts()
    ElMessage.success('对话已删除')
  } catch (error) {
    ElMessage.error(resolveErrorMessage(error, '删除失败，请稍后重试'))
  } finally {
    deletingConversationId.value = null
  }
}

function cancelAnswer() {
  const run = chatRuns.cancel()
  if (!run) return
  if (run.completed) {
    waitingForAnswer.value = false
    sending.value = false
    return
  }
  const partial = messages.value.find(message => message.id === run.streamingAssistantId)
  if (partial) {
    partial.streaming = false
    partial.interrupted = true
    partial.stopped = true
  }
  // Recovery is opt-in and bound to a server-confirmed account, never automatic resending.
  if (!draft.value) draft.value = run.content
  answerNotice.value = '已停止接收，问题已放回输入框；服务端可能仍在处理，请先查看历史记录再决定是否重发'
  waitingForAnswer.value = false
  sending.value = false
  nextTick(resizeComposer)
}

async function submitPrompt() {
  if (pendingDrafts.value.length) {
    draftRecoveryNotice.value = '请先恢复或清除暂存草稿，再发送当前问题；输入框内容会保留'
    return
  }
  const content = draft.value.trim()

  if (!content) {
    ElMessage.warning('先输入你想了解的问题')
    return
  }

  if (sending.value || switchingWorkspace.value || loadingMessages.value || historyError.value || deletingConversationId.value) return

  sending.value = true
  answerNotice.value = ''
  waitingForAnswer.value = true
  const temporaryId = `temporary-${Date.now()}`
  const streamingAssistantId = `streaming-${Date.now()}`
  const run = chatRuns.start({ content, streamingAssistantId })
  const modelKey = selectedModelKey.value
  const draftConversationId = activeConversationId.value
  let streamStarted = false

  try {
    const conversationId = await ensureConversation(run)
    if (!run.isCurrent()) return
    workspaceDrafts.clear(modelKey, draftConversationId)
    workspaceDrafts.clear(modelKey, conversationId)
    const shouldFollowUserMessage = isNearBottom()
    const preservedUserScroll = messageScroller.value?.scrollTop ?? 0
    messages.value.push({
      id: temporaryId,
      conversationId,
      role: 'user',
      content,
      sources: [],
      webSources: [],
      createdAt: new Date().toISOString(),
    })
    draft.value = ''
    await nextTick()
    if (!run.isCurrent()) return
    resizeComposer()

    if (shouldFollowUserMessage) {
      await scrollToBottom('smooth')
    } else if (messageScroller.value) {
      messageScroller.value.scrollTop = preservedUserScroll
    }

    if (!run.isCurrent()) return
    const response = await sendMessageStream(
      conversationId,
      content,
      modelKey,
      {
        onDelta(delta) {
          if (!run.isCurrent() || !delta) return

          if (!streamStarted) {
            streamStarted = true
            waitingForAnswer.value = false
            messages.value.push({
              id: streamingAssistantId,
              conversationId,
              role: 'assistant',
              content: '',
              sources: [],
              webSources: [],
              streaming: true,
              createdAt: new Date().toISOString(),
            })
          }

          const streamingMessage = messages.value.find(
            (message) => message.id === streamingAssistantId,
          )
          if (streamingMessage) streamingMessage.content += delta
          scheduleStreamScroll()
        },
      },
      { signal: run.signal },
    )

    if (!run.isCurrent()) return
    waitingForAnswer.value = false
    const shouldFollowAnswer = stickToBottom.value
    const preservedAnswerScroll = messageScroller.value?.scrollTop ?? 0
    const temporaryIndex = messages.value.findIndex((message) => message.id === temporaryId)

    if (temporaryIndex >= 0) messages.value[temporaryIndex] = response.userMessage
    const completedAssistant = {
      ...response.assistantMessage,
      sources: response.sources || [],
      webSources: response.webSources || [],
      streaming: false,
    }
    const streamingIndex = messages.value.findIndex(
      (message) => message.id === streamingAssistantId,
    )
    if (streamingIndex >= 0) {
      messages.value[streamingIndex] = completedAssistant
    } else {
      messages.value.push(completedAssistant)
    }
    run.completed = true

    await nextTick()
    if (!run.isCurrent()) return

    if (shouldFollowAnswer) {
      await scrollToBottom('smooth')
    } else if (messageScroller.value) {
      messageScroller.value.scrollTop = preservedAnswerScroll
      showJumpToLatest.value = true
    }

    if (run.isCurrent()) await loadConversationList()
  } catch (error) {
    // Navigation and session cancellation are not service failures. In particular,
    // do not reload old messages or quota after an identity change.
    if (!run.isCurrent()) return
    if (isCancel(error)) {
      run.finish()
      waitingForAnswer.value = false
      sending.value = false
      return
    }
    ElMessage.error(resolveErrorMessage(error, '回答服务暂时不可用，请稍后重试'))
    // Do not erase a newer draft typed while the previous request was running.
    if (!draft.value) {
      draft.value = content
      await nextTick()
      if (!run.isCurrent()) return
      resizeComposer()
    }

    if (streamStarted) {
      const partial = messages.value.find((message) => message.id === streamingAssistantId)
      if (partial) {
        partial.streaming = false
        partial.interrupted = true
      }
    }

    if (activeConversationId.value && !streamStarted) {
      const shouldFollowRecovery = isNearBottom()
      const preservedRecoveryScroll = messageScroller.value?.scrollTop ?? 0

      try {
        const recovered = await getMessages(activeConversationId.value, {signal:run.signal})
        if (!run.isCurrent()) return
        messages.value = recovered
        await nextTick()
        if (!run.isCurrent()) return

        if (shouldFollowRecovery) {
          await scrollToBottom('auto')
        } else if (messageScroller.value) {
          messageScroller.value.scrollTop = preservedRecoveryScroll
          showJumpToLatest.value = true
        }
      } catch {
        // 保留当前界面，由下一次手动切换会话时重新加载。
      }
    }
  } finally {
    if (run.isCurrent()) {
      run.finish()
      waitingForAnswer.value = false
      sending.value = false
      // Session cancellation must not start a new authenticated request.
      if (!run.signal.aborted && authStore.user) await loadDailyQuota()
    }
  }
}

function requestLogout() {
  logoutError.value = ''
  profileMenuOpen.value = false
  logoutConfirmVisible.value = true
}

async function confirmLogout() {
  if (logoutBusy.value) return
  logoutBusy.value = true
  logoutError.value = ''
  try {
    await authStore.logout()
    window.location.replace('/login')
  } catch {
    logoutError.value = '未能确认退出成功，请检查网络后重试。在公共设备上，请勿直接离开'
  } finally { logoutBusy.value = false }
}

onMounted(async () => {
  window.addEventListener('keydown', handleEscape)
  mobileMedia.addEventListener('change', updateMobileLayout)
  try {
    await authStore.loadCurrentUser()
  } catch {
    return
  }

  if (disposed) return

  const savedDrafts = chatDraftRecovery.snapshot()
  pendingDrafts.value = savedDrafts?.entries || []
  // Prefer the last active draft without putting its text into an input yet.
  if (savedDrafts?.active) pendingDrafts.value.sort((a, b) =>
    Number(b.model === savedDrafts.active.model && b.conversationId === savedDrafts.active.conversationId)
    - Number(a.model === savedDrafts.active.model && a.conversationId === savedDrafts.active.conversationId))

  await Promise.all([
    loadConversationList(),
    loadModelOptions(),
    loadDailyQuota(),
    loadMyKnowledgeSubmissions(),
    loadCurrentSchool(),
  ])
  if (!disposed) {
    draftsReady.value = true
    if (draft.value.trim()) checkpointDrafts()
  }
})

onBeforeUnmount(() => {
  disposed = true
  routeReadSequence++
  cancelAnswer()
  historyRequests.dispose()
  conversationListRequests.dispose()
  workspaceTransitionId += 1
  workspaceAnimation?.cancel()
  window.removeEventListener('keydown', handleEscape)
  mobileMedia.removeEventListener('change', updateMobileLayout)
  if (streamScrollFrame !== null) window.cancelAnimationFrame(streamScrollFrame)
})
</script>

<template>
  <div class="workspace persistent-workspace" :class="{ 'workspace-expanded': expandedWorkspace }" :inert="membershipVisible || membershipPresent">
    <aside ref="sidebarElement" class="sidebar" :class="{ 'mobile-open': mobileSidebarOpen }" :inert="logoutConfirmVisible || (mobileLayout && !mobileSidebarOpen)" aria-label="校园导航">
      <div class="sidebar-top">
        <div class="brand">
          <CampMark />
          <span class="brand-copy">
            <strong>Campthink.</strong>
            <small>{{ currentSchoolName }}</small>
          </span>
        </div>

        <button class="compose-button" type="button" @click="startNewConversation">
          <el-icon><EditPen /></el-icon>
          <span>新对话</span><kbd>↗</kbd>
        </button>
      </div>

      <nav class="sidebar-nav">
        <p class="nav-label">我的校园 / WORKSPACE</p>
        <button class="nav-item" :class="{active:isChatRoute}" type="button" @click="router.push('/chat')">
          <WorkspaceIcon mode="standard" />
          <span>校园助手</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='wall'}" type="button" @click="router.push('/wall')">
          <NavigationIcon name="wall" /><span>校园墙</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='study'}" type="button" @click="router.push('/study')">
          <NavigationIcon name="study" /><span>实验与作业</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='timetable'}" type="button" @click="router.push('/timetable')">
          <NavigationIcon name="timetable" /><span>我的课表</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='canteens'}" type="button" @click="router.push('/canteens')">
          <NavigationIcon name="canteen" />
          <span>食堂评分</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='projects'}" type="button" @click="router.push('/projects')">
          <NavigationIcon name="projects" />
          <span>我的项目</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='instruments'}" type="button" @click="router.push('/instruments')">
          <NavigationIcon name="instruments" /><span>仪器资料</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='reviews'}" type="button" @click="router.push('/reviews')"><NavigationIcon name="projects" /><span>收到的审阅</span></button>
        <button v-if="isAdmin" class="nav-item" :class="{active:route.name==='admin'}" type="button" @click="openAdminConsole">
          <NavigationIcon name="admin" />
          <span>管理后台</span>
        </button>
        <button class="nav-item" :class="{active:route.name==='feedback'}" type="button" @click="openContact">
          <NavigationIcon name="feedback" />
          <span>提交意见</span>
        </button>
        <button class="nav-item membership-entry" aria-haspopup="dialog" type="button" @click="openMembership">
          <el-icon><Star /></el-icon>
          <span>Campthink Pro</span>
          <small>即将开放</small>
        </button>

        <p class="nav-label recent-label">最近对话</p>
        <label class="history-search">
          <el-icon aria-hidden="true"><Search /></el-icon>
          <input
            ref="historySearchInput"
            v-model="historyQuery"
            type="search"
            aria-label="搜索历史对话"
            placeholder="搜索对话"
            autocomplete="off"
          />
          <kbd v-if="!historyQuery">⌘ K</kbd>
        </label>
        <div class="conversation-list">
          <div v-if="!activeConversationId && !loadingMessages" class="fresh-conversation" aria-current="true">
            <WorkspaceIcon :mode="selectedModelKey" /><span>{{ activeWorkspace.label }} · 新对话</span><small>未发送</small>
          </div>
          <span v-if="loadingConversations" class="sidebar-status" role="status">正在加载对话…</span>
          <div v-if="conversationListError" class="history-load-error" role="alert">
            <p>{{ conversationListError }}</p>
            <button type="button" :disabled="loadingConversations" @click="loadConversationList">重新读取列表</button>
          </div>
          <div
            v-for="conversation in filteredConversations"
            :key="conversation.id"
            class="conversation-row"
            :class="{ active: conversation.id === activeConversationId }"
          >
            <button
              class="conversation-item"
              type="button"
              @click="selectConversation(conversation.id)"
            >
              <el-icon><Clock /></el-icon>
              <span>{{ conversation.title || '新对话' }}</span>
            </button>
            <button
              class="conversation-delete"
              type="button"
              :aria-label="`删除对话：${conversation.title || '新对话'}`"
              :disabled="sending || loadingMessages || switchingWorkspace || Boolean(deletingConversationId)"
              @click="requestDeleteConversation(conversation)"
            >
              <el-icon><DeleteIcon /></el-icon>
            </button>
          </div>
          <span v-if="!loadingConversations && !conversationListError && conversations.length === 0" class="sidebar-status">
            还没有历史对话
          </span>
          <span v-else-if="!loadingConversations && !conversationListError && filteredConversations.length === 0" class="sidebar-status">
            没有匹配的对话
          </span>
        </div>
      </nav>

      <div class="sidebar-account">
        <Transition name="profile-menu">
          <button
            v-if="profileMenuOpen"
            class="profile-menu-scrim"
            type="button"
            aria-label="关闭账户菜单"
            @click="profileMenuOpen = false"
          ></button>
        </Transition>
        <Transition name="profile-menu">
          <section v-if="profileMenuOpen" class="profile-menu" aria-label="账户菜单">
            <div class="profile-menu-user">
              <span class="avatar">{{ displayName.slice(0, 1) }}</span>
              <div>
                <strong>{{ displayName }}</strong>
                <span v-if="authStore.user?.username" class="profile-username" :title="authStore.user.username">@{{ authStore.user.username }}</span>
                <small>{{ isAdmin ? '学校管理员' : '校园用户' }}</small>
              </div>
            </div>
            <div class="pure-service"><i></i><span>全站无广告，不出售用户数据</span></div>
            <button type="button" class="profile-entry" @click="profileMenuOpen = false; router.push('/account')">
              <el-icon><User /></el-icon>
              <span>个人信息</span>
            </button>
            <button type="button" class="logout-entry" @click="requestLogout">
              <el-icon><SwitchButton /></el-icon>
              <span>退出登录</span>
            </button>
          </section>
        </Transition>

        <button
          class="profile"
          type="button"
          :aria-expanded="profileMenuOpen"
          @click="profileMenuOpen = !profileMenuOpen"
        >
          <span class="avatar">{{ displayName.slice(0, 1) }}</span>
          <span class="profile-copy">
            <strong>{{ displayName }}</strong>
            <small>账户与退出</small>
          </span>
        </button>
      </div>
    </aside>

    <Transition name="sidebar-mask">
      <button
        v-if="mobileSidebarOpen && !logoutConfirmVisible"
        class="mobile-sidebar-mask"
        type="button"
        aria-label="关闭菜单"
        @click="mobileSidebarOpen = false"
      ></button>
    </Transition>

    <main v-show="isChatRoute" class="chat-main" :class="{'workspace-reveal':isChatRoute}" :inert="logoutConfirmVisible || (mobileLayout && mobileSidebarOpen)">
      <header class="chat-header">
        <button
          ref="menuTrigger"
          class="mobile-menu-button"
          type="button"
          aria-label="打开菜单"
          @click="mobileSidebarOpen = true"
        >
          <el-icon><Menu /></el-icon>
        </button>
        <div class="connection-state">
          <span>{{ currentSchoolName }}空间</span>
        </div>

        <div class="header-center">
          <nav class="workspace-switcher" :class="`is-${pendingWorkspaceKey || selectedModelKey}`" aria-label="选择工作模块">
          <button
            v-for="workspace in workspaceOptions"
            :key="workspace.key"
            type="button"
            :disabled="sending || loadingMessages"
            :class="{
              active: workspace.key === (pendingWorkspaceKey || selectedModelKey),
              unavailable: !workspace.model?.available,
            }"
            :aria-pressed="workspace.key === selectedModelKey"
            :title="workspace.model?.configured === false
              ? `${workspace.provider} 尚未配置`
              : sending ? '回答完成后可切换模块' : `${workspace.subtitle} · 切换后开始独立新对话`"
            @click="chooseWorkspace(workspace)"
          >
            <WorkspaceIcon :mode="workspace.key" />
            <span>{{ workspace.label }}</span>
            <small>{{ workspace.model?.configured === false ? '未配置' : workspace.provider }}</small>
          </button>
          </nav>
        </div>

      </header>

      <section ref="messageScroller" class="message-scroller" @scroll="handleMessageScroll">
        <div ref="workspaceScene" class="workspace-scene" :aria-busy="switchingWorkspace" :inert="switchingWorkspace">
        <div v-if="loadingMessages" class="loading-state" role="status">
          <span></span>
          <p>正在读取这段对话</p>
        </div>

        <section v-else-if="historyError" class="history-recovery" aria-labelledby="history-recovery-title">
          <h2 id="history-recovery-title">这段对话还没打开</h2>
          <p role="alert">{{ historyError }}</p>
          <p>未读取成功不代表没有历史。输入框中的草稿仍在，重新读取后再发送</p>
          <button class="work-button primary" type="button" @click="selectConversation(activeConversationId)">重新读取对话</button>
          <button class="work-button" type="button" @click="startNewConversation">另开新对话</button>
        </section>
        <section v-else-if="messages.length === 0" class="welcome">
          <p class="welcome-eyebrow">CAMPTHINK / {{ selectedModelKey === 'standard' ? 'ASK' : selectedModelKey === 'kimi' ? 'RESEARCH' : 'BUILD' }}</p>
          <div class="welcome-heading">
            <span class="welcome-mode-icon"><WorkspaceIcon :mode="selectedModelKey" /></span>
            <div>
              <h1>你好，{{ displayName }}</h1>
              <p class="welcome-subtitle">{{ activeWorkspace.subtitle }}</p>
            </div>
          </div>
          <p class="welcome-invitation">{{ selectedModelKey === 'standard' ? '今天，从哪件事开始？' : selectedModelKey === 'kimi' ? '把一个想法，写得更清楚' : '让灵感，变成可以运行的东西' }}</p>
          <div class="quick-tools-label"><span>你的快捷工具</span><small>先选工具，再补充需求</small></div>
          <div class="suggestion-grid">
            <button
              v-for="item in suggestions"
              :key="item.title"
              class="suggestion-card"
              type="button"
              :aria-expanded="item.action === 'campus' ? selectedQuickAction === 'campus' : undefined"
              :aria-controls="item.action === 'campus' ? 'campus-quick-lookups' : undefined"
              @click="activateQuickAction(item)"
            >
              <span class="quick-tool-icon"><QuickActionIcon :name="item.icon" /></span>
              <span class="suggestion-copy">
                <strong>{{ item.title }}</strong>
                <small>{{ item.description }}</small>
              </span>
              <span class="quick-tool-action">{{ item.label }}<span aria-hidden="true">{{ item.route ? '↗' : item.action === 'campus' ? '+' : '→' }}</span></span>
            </button>
          </div>
          <TimetableTeaser />
          <Transition name="quick-disclosure">
            <div v-if="selectedQuickAction === 'campus'" id="campus-quick-lookups" class="campus-quick-lookups">
              <div><strong>你想了解什么？</strong><button type="button" aria-label="收起校园速查" @click="selectedQuickAction = null">收起 −</button></div>
              <div class="lookup-options"><button v-for="item in campusLookups" :key="item.label" type="button" @click="chooseSuggestion(item.prompt)">{{ item.label }}<span aria-hidden="true">↗</span></button></div>
              <small>选择后填入输入框，确认再发送；回答以已核实资料为准</small>
              <CampusDirectory v-if="currentSchoolName === '天津中德应用技术大学'" />
            </div>
          </Transition>
        </section>

        <div v-else class="message-list">
          <article
            v-for="message in messages"
            :key="message.id"
            class="message-row"
            :class="message.role"
          >
            <CampMark v-if="message.role === 'assistant'" class="assistant-avatar" />
            <div class="message-content">
              <span class="message-role">{{
                message.role === 'assistant' ? '校园助手 · AI 生成内容，请核实' : '你'
              }}</span>
              <p v-if="message.interrupted" class="answer-interrupted" role="status">
                {{ message.stopped ? '已停止接收，以下内容可能不完整；可稍后查看历史记录核对' : '回答中途断开，以下内容不完整；请查看历史记录后重试' }}
              </p>
              <p v-if="message.role === 'user'">{{ message.content }}</p>
              <div v-else class="answer-bubble" :class="{ 'is-streaming': message.streaming }">
              <div v-if="message.streaming" class="answer-streaming">
                <span v-if="!message.content" class="typing-indicator" role="status" aria-label="正在整理回答"><b></b><b></b><b></b></span>
                <template v-else>{{ message.content }}<i aria-hidden="true"></i></template>
              </div>
              <section
                v-else-if="campusServiceResult(message)"
                class="campus-service-result"
              >
                <header>
                  <span class="service-result-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 20V8.6L12 4l8 4.6V20h-6v-5h-4v5H4Zm2-2h2v-5h8v5h2V9.8l-6-3.4-6 3.4V18Z" />
                    </svg>
                  </span>
                  <div>
                    <small>校内事务</small>
                    <strong>{{ campusServiceResult(message).title }}</strong>
                  </div>
                  <span
                    class="service-result-state"
                    :class="campusServiceResult(message).stateTone"
                  >
                    <i></i>{{ campusServiceResult(message).stateLabel }}
                  </span>
                </header>

                <p v-if="!hasAdditionalServiceDetail(message)">
                  {{ campusServiceResult(message).summary }}
                </p>

                <div class="service-result-meta">
                  <span>
                    <small>负责单位</small>
                    <strong>{{ campusServiceResult(message).department }}</strong>
                  </span>
                  <span>
                    <small>事务分类</small>
                    <strong>{{ campusServiceResult(message).category }}</strong>
                  </span>
                  <span>
                    <small>资料时间</small>
                    <strong>{{ formatSourceDate(campusServiceResult(message).publishedAt) }}</strong>
                  </span>
                </div>

                <footer>
                  <span>回答引用 {{ campusServiceResult(message).sourceCount }} 份本校资料</span>
                  <a
                    v-if="campusServiceResult(message).sourceUrl"
                    :href="campusServiceResult(message).sourceUrl"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看办事原文
                    <el-icon><Promotion /></el-icon>
                  </a>
                  <button v-else type="button" @click="scrollToMessageSources(message.id)">
                    查看资料依据
                  </button>
                </footer>
              </section>
              <div v-else class="answer-markdown" v-html="renderMarkdown(message.content)"></div>

              <div
                v-if="campusServiceResult(message) && hasAdditionalServiceDetail(message)"
                class="answer-markdown service-answer-detail"
                v-html="renderMarkdown(message.content)"
              ></div>
              </div>

              <details
                v-if="message.sources?.length"
                :id="`sources-${message.id}`"
                class="message-sources citation-details"
                :class="{ 'compact-service-sources': campusServiceResult(message) }"
              >
                <summary>本校参考片段 <span>{{ message.sources.length }} 条</span><i aria-hidden="true">⌄</i></summary>
                <div class="source-reference-list">
                  <component
                    v-for="(source, index) in message.sources"
                    :key="`${message.id}-${source.chunkId}`"
                    :is="safeExternalUrl(source.sourceUrl) ? 'a' : 'div'"
                    :href="safeExternalUrl(source.sourceUrl) || undefined"
                    :target="safeExternalUrl(source.sourceUrl) ? '_blank' : undefined"
                    :rel="safeExternalUrl(source.sourceUrl) ? 'noopener noreferrer' : undefined"
                  >
                    <span>{{ index + 1 }}</span>
                    <strong>{{ source.title }}<small>{{ source.sourceDepartment || '校内资料库' }} · {{ formatSourceDate(source.publishedAt) }}</small></strong>
                  </component>
                </div>
              </details>

              <details
                v-if="citedWebSources(message).length"
                class="message-sources web-sources citation-details"
              >
                <summary>引用网页 <span>{{ citedWebSources(message).length }} 项</span><i aria-hidden="true">⌄</i></summary>
                <div class="web-source-list">
                  <a
                    v-for="(source, index) in citedWebSources(message)"
                    :key="`${message.id}-web-${index}`"
                    :href="safeExternalUrl(source.url) || undefined"
                    :target="safeExternalUrl(source.url) ? '_blank' : undefined"
                    :rel="safeExternalUrl(source.url) ? 'noopener noreferrer' : undefined"
                  >
                    <span class="web-source-site-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24">
                        <path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.2-3.2a3 3 0 1 1 4.2 4.2l-2 2a3 3 0 0 1-4.2 0 1 1 0 0 1 1.4-1.4 1 1 0 0 0 1.4 0l2-2a1 1 0 0 0-1.4-1.4L12 13.4a1 1 0 0 1-1.4 0Zm2.8-2.8a1 1 0 0 1 0 1.4l-3.2 3.2A3 3 0 1 1 6 11l2-2a3 3 0 0 1 4.2 0 1 1 0 0 1-1.4 1.4 1 1 0 0 0-1.4 0l-2 2a1 1 0 0 0 1.4 1.4l3.2-3.2a1 1 0 0 1 1.4 0Z" />
                      </svg>
                    </span>
                    <span class="web-source-copy">
                      <strong>{{ source.title }}</strong>
                      <small>{{ sourceHost(source.url) }}<template v-if="source.publishedDate"> · {{ formatSourceDate(source.publishedDate) }}</template></small>
                    </span>
                    <el-icon class="web-source-open"><Promotion /></el-icon>
                  </a>
                </div>
              </details>

              <div
                v-if="showKnowledgeGap(message)"
                class="knowledge-gap"
              >
                <div>
                  <strong>这条回答暂未引用本校资料</strong>
                  <span>如果你知道可靠信息，可以继续在当前对话补充</span>
                </div>
                <span v-if="submissionStatusLabel(message.id)" class="submission-status">
                  {{ submissionStatusLabel(message.id) }}
                </span>
                <button v-else type="button" @click="beginContribution(message.id)">
                  {{
                    submissionForMessage(message.id)?.status === 'REJECTED'
                      ? '重新补充'
                      : '我知道相关信息'
                  }}
                </button>
              </div>

              <Transition name="contribution">
                <form
                  v-if="contributionForm.messageId === message.id"
                  :id="`contribution-${message.id}`"
                  class="contribution-form"
                  @submit.prevent="submitContribution"
                >
                  <div class="contribution-heading">
                    <div>
                      <strong>补充校园信息</strong>
                      <span>{{ contributionForm.question }}</span>
                    </div>
                    <button type="button" @click="closeContribution">取消</button>
                  </div>

                  <textarea
                    v-model="contributionForm.content"
                    rows="4"
                    maxlength="100000"
                    placeholder="写下你确认的信息，例如开放时间、办理地点或具体流程"
                  ></textarea>

                  <input
                    v-model="contributionForm.sourceUrl"
                    type="url"
                    maxlength="1000"
                    placeholder="来源链接（可选，官网或公众号文章）"
                  />

                  <div class="contribution-actions">
                    <span>提交后先由管理员审核，不会直接进入知识库</span>
                    <button type="submit" :disabled="submittingContribution">
                      {{ submittingContribution ? '正在提交…' : '提交审核' }}
                    </button>
                  </div>
                </form>
              </Transition>

              <div v-if="message.role === 'assistant' && !message.streaming && !message.interrupted" class="answer-feedback">
                <button class="copy-answer" type="button" @click="copyAnswer(message)">
                  <el-icon><DocumentCopy /></el-icon><span>复制回答</span>
                </button>
                <span>这条回答有帮助吗？</span>
                <div class="feedback-buttons">
                  <button
                    type="button"
                    :class="{ active: message.helpful === true }"
                    :disabled="isFeedbackSaving(message.id)"
                    aria-label="回答有帮助"
                    @click="setMessageFeedback(message, true)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7.8 10.4 11 3.8c.5-1 1.8-.8 2.1.2.3 1 .2 2.1-.2 3.1l-.7 1.8h5.5c1.4 0 2.4 1.3 2 2.7l-1.7 7c-.2.9-1 1.5-2 1.5H7.8V10.4ZM4 10.4h3.8v9.7H4v-9.7Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    :class="{ active: message.helpful === false }"
                    :disabled="isFeedbackSaving(message.id)"
                    aria-label="回答需要改进"
                    @click="setMessageFeedback(message, false)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7.8 13.6 11 20.2c.5 1 1.8.8 2.1-.2.3-1 .2-2.1-.2-3.1l-.7-1.8h5.5c1.4 0 2.4-1.3 2-2.7l-1.7-7c-.2-.9-1-1.5-2-1.5H7.8v9.7ZM4 3.9h3.8v9.7H4V3.9Z" />
                    </svg>
                  </button>
                  <small v-if="message.helpful !== null && message.helpful !== undefined">
                    已记录
                  </small>
                </div>
              </div>

              <Transition name="feedback-detail">
                <form
                  v-if="
                    message.role === 'assistant' && !message.streaming && message.helpful === false
                  "
                  class="feedback-detail"
                  @submit.prevent="saveFeedbackReason(message)"
                >
                  <input
                    v-model="feedbackDrafts[message.id]"
                    maxlength="500"
                    :placeholder="message.feedbackReason || '哪里不准确？简单说一句即可'"
                  />
                  <button type="submit" :disabled="isFeedbackSaving(message.id)">
                    {{ message.feedbackReason ? '更新' : '提交' }}
                  </button>
                </form>
              </Transition>
            </div>
          </article>

          <article v-if="waitingForAnswer" class="message-row assistant waiting-row">
            <CampMark class="assistant-avatar" />
            <div class="message-content">
              <span class="message-role">校园助手</span>
              <div class="answer-bubble thinking-bubble" role="status">
                <span class="typing-indicator" aria-hidden="true"><b></b><b></b><b></b></span>
                <span>{{ waitingCopy }}</span>
              </div>
            </div>
          </article>
        </div>
        </div>
      </section>

      <Transition name="jump">
        <button
          v-if="showJumpToLatest"
          class="jump-latest"
          type="button"
          @click="scrollToBottom('smooth')"
        >
          <el-icon><ArrowDown /></el-icon>
          回到最新回答
        </button>
      </Transition>

      <section class="composer-wrap">
        <div class="composer" :class="{ disabled: sending || switchingWorkspace }">
          <textarea
            ref="composerInput"
            v-model="draft"
            aria-label="输入消息"
            rows="1"
            :maxlength="selectedModelKey === 'kimi' ? 50000 : 10000"
            :disabled="sending || switchingWorkspace || loadingMessages"
            :placeholder="sending ? '正在生成回答…' : composerPlaceholder"
            @input="resizeComposer"
            @compositionstart="composerComposing = true"
            @compositionend="composerComposing = false"
            @keydown.enter.exact="handleComposerEnter"
          ></textarea>
          <button
            v-if="sending"
            class="send-button"
            type="button"
            aria-label="停止接收回答"
            title="停止接收回答；服务端可能仍在处理，请勿立即重复提交"
            @click="cancelAnswer"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" /></svg>
          </button>
          <button
            v-else
            class="send-button"
            type="button"
            aria-label="发送"
            :disabled="sending || switchingWorkspace || loadingMessages || Boolean(historyError) || Boolean(deletingConversationId) || !draft.trim()"
            @click="submitPrompt"
          >
            <el-icon><ArrowUp /></el-icon>
          </button>
        </div>
        <p v-if="answerNotice" class="answer-notice" role="status">{{ answerNotice }}</p>
        <ChatDraftRecovery :state="chatDraftRecoveryState" :pending="pendingDrafts" :notice="draftRecoveryNotice"
          :busy="!draftsReady || sending || switchingWorkspace || loadingMessages || Boolean(deletingConversationId)"
          @toggle="toggleDraftRecovery" @restore="restoreChatDraft" @discard="discardRecoveredDrafts" />
        <p class="composer-meta">
          <span>{{ activeWorkspace.label }}模块 · {{ activeWorkspace.provider }}</span>
          <span v-if="quotaDisplay" :title="quotaDisplay.hint">{{ quotaDisplay.label }}</span>
          <span>Enter 发送 · Shift + Enter 换行</span>
        </p>
      </section>
    </main>
    <section v-if="!isChatRoute" class="workspace-pane workspace-reveal" :inert="logoutConfirmVisible || (mobileLayout && mobileSidebarOpen)" aria-label="功能工作区">
      <header class="workspace-toolbar">
        <button ref="menuTrigger" class="mobile-menu-button" type="button" aria-label="打开菜单" @click="mobileSidebarOpen=true"><el-icon><Menu /></el-icon></button>
        <span>{{ contentTitle }}</span>
        <button class="expand-workspace" type="button" :aria-pressed="expandedWorkspace" @click="expandedWorkspace=!expandedWorkspace">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /></svg>
          {{ expandedWorkspace ? '还原侧栏' : '展开工作区' }}
        </button>
      </header>
      <div ref="workspaceContent" class="workspace-content">
        <RouterView v-slot="{Component}">
          <Transition name="workspace-content" mode="out-in" @before-enter="resetWorkspaceScroll" @after-enter="resetWorkspaceScroll">
            <div :key="route.name" class="workspace-page"><component :is="Component" /></div>
          </Transition>
        </RouterView>
      </div>
    </section>
  </div>

  <Teleport to="body">
    <Transition name="contact-modal">
      <div v-if="contactVisible" class="contact-overlay" @mousedown.self="closeContact">
        <section
          class="chat-contact-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-contact-title"
        >
          <button class="contact-close" type="button" aria-label="关闭" @click="closeContact">
            ×
          </button>
          <p class="contact-eyebrow">PRODUCT FEEDBACK</p>
          <h2 id="chat-contact-title">提交意见</h2>
          <p class="contact-description">直接告诉我们哪里需要改进，内容会进入管理员后台。</p>

          <form @submit.prevent="submitContact">
            <div class="contact-grid">
              <input v-model="contactForm.name" maxlength="80" placeholder="你的称呼" />
              <input
                v-model="contactForm.contact"
                maxlength="120"
                placeholder="手机号、邮箱或微信"
              />
            </div>
            <input v-model="contactForm.subject" maxlength="120" placeholder="意见主题" />
            <textarea
              v-model="contactForm.message"
              rows="5"
              maxlength="5000"
              placeholder="请描述问题、建议或希望增加的能力"
            ></textarea>
            <button type="submit" :disabled="contactLoading">
              {{ contactLoading ? '正在提交…' : '提交意见' }}
            </button>
          </form>
          <small>意见仅用于改进产品，不会公开展示。Campus AI 全站无广告。</small>
        </section>
      </div>
    </Transition>

    <Transition name="contact-modal">
      <div
        v-if="logoutConfirmVisible"
        class="contact-overlay"
        @mousedown.self="!logoutBusy && (logoutConfirmVisible = false)"
      >
        <section ref="logoutDialog" class="delete-dialog logout-dialog" role="alertdialog" aria-modal="true" tabindex="-1" aria-labelledby="logout-title" :aria-busy="logoutBusy">
          <button
            class="contact-close"
            type="button"
            aria-label="关闭退出确认"
            :disabled="logoutBusy"
            @click="logoutConfirmVisible = false"
          >
            ×
          </button>
          <h2 id="logout-title">退出 Campthink？</h2>
          <p>退出后需要重新登录才能继续访问历史对话与校园资料。</p>
          <p v-if="logoutError" class="work-error" role="alert">{{ logoutError }}</p>
          <div>
            <button type="button" :disabled="logoutBusy" @click="logoutConfirmVisible = false">取消</button>
            <button type="button" :disabled="logoutBusy" @click="confirmLogout">{{ logoutBusy ? '正在退出…' : '确认退出' }}</button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="contact-modal">
      <div
        v-if="pendingDeleteConversation"
        class="contact-overlay"
        @mousedown.self="pendingDeleteConversation = null"
      >
        <section class="delete-dialog" role="alertdialog" aria-modal="true">
          <span class="delete-icon"
            ><el-icon><DeleteIcon /></el-icon
          ></span>
          <h2>删除这段对话？</h2>
          <p>“{{ pendingDeleteConversation.title || '新对话' }}”及其中的全部消息将永久删除。</p>
          <div>
            <button type="button" @click="pendingDeleteConversation = null">取消</button>
            <button
              type="button"
              :disabled="Boolean(deletingConversationId)"
              @click="confirmDeleteConversation"
            >
              {{ deletingConversationId ? '正在删除…' : '确认删除' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>

  </Teleport>
  <ProDialog v-model="membershipVisible" @present-change="membershipPresent = $event" />
</template>

<style scoped>
.history-recovery { max-width: 660px; margin: 48px auto; padding: 28px; color: #273344; }
.history-recovery h2 { font-size: 25px; margin: 0 0 16px; }
.history-recovery p { font-size: 16px; line-height: 1.8; color: #596454; overflow-wrap: anywhere; }
.history-recovery button { margin: 8px 12px 0 0; }
.history-load-error { margin: 10px 0; padding: 12px; border: 1px solid #d4dacd; border-radius: 16px; font-size: 14px; color: #52604a; }
.history-load-error p { margin: 0 0 8px; line-height: 1.6; overflow-wrap: anywhere; }
.history-load-error button { min-height: 36px; padding: 6px 10px; border-radius: 12px; background: #fffefa; color: #3544b7; }
.workspace {
  display: grid;
  grid-template-columns: 258px minmax(0, 1fr);
  height: 100svh;
  overflow: hidden;
  background: #fcfcfe;
}

button {
  color: inherit;
  border: 0;
  cursor: pointer;
}

button:focus-visible,
a:focus-visible {
  outline: 2px solid #0071e3;
  outline-offset: 3px;
}

.sidebar {
  display: flex;
  min-height: 0;
  padding: 22px 16px 16px;
  flex-direction: column;
  background: #f4f5f8;
  border-right: 1px solid rgba(29, 29, 31, 0.08);
}

.sidebar-top {
  padding: 0 4px;
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  height: 38px;
  padding: 0 8px;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.brand-mark {
  display: block;
  flex: 0 0 30px;
  width: 30px;
  height: 26px;
  object-fit: contain;
  filter: none;
}

.brand-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.brand-copy strong {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.05;
}

.brand-copy small {
  max-width: 180px;
  margin-top: 4px;
  overflow: hidden;
  color: #86868b;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-button {
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 42px;
  margin-top: 18px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  background: #1d1d1f;
  border-radius: 12px;
  transition:
    transform 180ms ease,
    background 180ms ease;
}

.compose-button:hover {
  background: #000;
  transform: translateY(-1px);
}

.sidebar-nav {
  min-height: 0;
  margin-top: 28px;
  flex: 1;
  overflow: hidden;
}

.nav-label {
  margin: 0 12px 8px;
  color: #696e79;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.recent-label {
  margin-top: 26px;
}

.history-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  margin: 0 4px 10px;
  padding: 0 10px;
  border: 1px solid #e1e4eb;
  border-radius: 10px;
  color: #6e7380;
  background: #fff;
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.history-search:focus-within {
  border-color: #6c9cda;
  box-shadow: 0 0 0 3px rgba(35, 102, 188, 0.1);
}

.history-search .el-icon { flex: none; font-size: 15px; }
.history-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  color: #1d2636;
  background: transparent;
  font: inherit;
  font-size: 12px;
}
.history-search input::placeholder { color: #737b89; }
.history-search input::-webkit-search-cancel-button { cursor: pointer; }
.history-search kbd {
  flex: none;
  color: #858b96;
  font-family: inherit;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.nav-item,
.conversation-item {
  display: flex;
  gap: 11px;
  align-items: center;
  width: 100%;
  height: 42px;
  margin: 2px 0;
  padding: 0 12px;
  color: #424245;
  font-size: 14px;
  text-align: left;
  background: transparent;
  border-radius: 11px;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.nav-item:hover,
.nav-item.active,
.conversation-row:hover .conversation-item,
.conversation-row.active .conversation-item {
  color: #1d1d1f;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.04);
}

.nav-item .workspace-icon,
.nav-item .navigation-icon {
  width: 18px;
  height: 18px;
}

.membership-entry small {
  margin-left: auto;
  padding: 3px 6px;
  color: #38608d;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: #e8eef6;
  border-radius: 999px;
}

.conversation-list {
  max-height: calc(100svh - 398px);
  overflow-y: auto;
  scrollbar-width: none;
}

.conversation-list::-webkit-scrollbar {
  display: none;
}

.conversation-item {
  padding-right: 38px;
  color: #6e6e73;
  font-size: 12px;
}

.conversation-row {
  position: relative;
}

.conversation-delete {
  position: absolute;
  top: 50%;
  right: 7px;
  display: grid;
  width: 28px;
  height: 28px;
  color: #86868b;
  background: transparent;
  border-radius: 8px;
  opacity: 0;
  place-items: center;
  transform: translateY(-50%) scale(0.9);
  transition:
    opacity 160ms ease,
    color 160ms ease,
    background 160ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.conversation-row:hover .conversation-delete,
.conversation-row.active .conversation-delete,
.conversation-delete:focus-visible {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.conversation-delete:hover {
  color: #d70015;
  background: rgba(215, 0, 21, 0.08);
}

.conversation-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-status {
  display: block;
  padding: 10px 12px;
  color: #6e7380;
  font-size: 11px;
}

.profile {
  display: flex;
  gap: 11px;
  align-items: center;
  width: 100%;
  padding: 10px;
  background: transparent;
  border-radius: 13px;
}

.sidebar-account {
  position: relative;
}

.profile-menu-scrim {
  position: fixed;
  inset: 0;
  padding: 0;
  background: transparent;
  cursor: default;
  z-index: 10;
}

.profile-menu {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  width: 240px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(29, 29, 31, 0.09);
  border-radius: 18px;
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(28px) saturate(150%);
  z-index: 11;
}

.profile-menu-user {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 8px 8px 12px;
}

.profile-menu-user > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.profile-menu-user strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-menu-user small {
  margin-top: 3px;
  color: #596551;
  font-size: 14px;
}

.profile-username {
  margin-top: 4px;
  overflow: hidden;
  color: #596551;
  font-size: 14px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pure-service {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0 4px 7px;
  padding: 9px 10px;
  color: #596551;
  font-size: 12px;
  background: #f5f5f7;
  border-radius: 10px;
}

.pure-service i {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  background: #30a14e;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(48, 161, 78, 0.1);
}

.profile-entry,
.logout-entry {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 44px;
  padding: 0 11px;
  color: #d70015;
  font-size: 14px;
  background: transparent;
  border-radius: 10px;
  transition: background 160ms ease;
}

.logout-entry:hover {
  background: rgba(215, 0, 21, 0.07);
}
.profile-entry { color: #344238; }
.profile-entry:hover { background: #edf0e7; }

.profile-menu-enter-active,
.profile-menu-leave-active {
  transition:
    opacity 180ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.profile-menu-enter-from,
.profile-menu-leave-to {
  opacity: 0;
  transform: translateY(7px) scale(0.97);
}

.profile:hover {
  background: rgba(255, 255, 255, 0.86);
}

.avatar {
  display: grid;
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  color: #fff;
  font-size: 14px;
  font-weight: 650;
  background: linear-gradient(145deg, #1d1d1f, #626266);
  border-radius: 50%;
  place-items: center;
}

.profile-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.profile-copy strong {
  max-width: 150px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-copy small {
  margin-top: 2px;
  color: #86868b;
  font-size: 10px;
}

.chat-main {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.chat-header {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  flex: 0 0 64px;
  padding: 0 30px;
  color: #6e6e73;
  font-size: 12px;
  background: rgba(252, 252, 254, 0.94);
  border-bottom: 1px solid #e9ebf0;
  backdrop-filter: blur(14px);
  z-index: 5;
}

.mobile-menu-button,
.mobile-sidebar-mask {
  display: none;
}

.connection-state {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-center {
  position: relative;
  display: flex;
  align-items: center;
  flex-direction: column;
}

.workspace-switcher {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, minmax(104px, 1fr));
  gap: 3px;
  align-items: center;
  min-height: 46px;
  padding: 3px;
  background: #f0f2f6;
  border: 1px solid #e2e5ec;
  border-radius: 15px;
}

.workspace-switcher::before {
  content: '';
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: calc((100% - 12px) / 3);
  border: 1px solid rgba(0, 113, 227, 0.1);
  border-radius: 11px;
  background: #fff;
  box-shadow: 0 3px 12px rgba(20, 35, 56, 0.1);
  transition: transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
}
.workspace-switcher.is-kimi::before { transform: translateX(calc(100% + 3px)); }
.workspace-switcher.is-glm::before { transform: translateX(calc(200% + 6px)); }

.workspace-switcher button {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 22px auto;
  grid-template-rows: auto auto;
  column-gap: 7px;
  align-items: center;
  min-width: 0;
  min-height: 40px;
  padding: 5px 10px;
  color: #68686d;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 11px;
  transition:
    color 180ms ease,
    background 180ms ease,
    box-shadow 220ms ease;
}

.workspace-switcher button:hover {
  color: #1d1d1f;
  background: rgba(255, 255, 255, 0.58);
}

.workspace-switcher button.active {
  color: #075fb8;
  background: transparent;
}

.workspace-switcher button.unavailable:not(.active) {
  opacity: 0.52;
}

.workspace-switcher .workspace-icon {
  grid-row: 1 / 3;
  display: grid;
  width: 21px;
  height: 21px;
  color: currentColor;
  place-items: center;
}

.workspace-switcher button.active .workspace-icon {
  color: #075fb8;
}

.workspace-switcher span {
  overflow: hidden;
  font-size: 12px;
  font-weight: 680;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-switcher small {
  overflow: hidden;
  color: #6f7480;
  font-size: 10px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  justify-self: end;
  padding: 8px 12px;
  color: #424245;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.76);
  border: 1px solid rgba(29, 29, 31, 0.08);
  border-radius: 999px;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    opacity 180ms ease;
}

.source-button .navigation-icon { width: 16px; height: 16px; }

.source-button:hover {
  background: #fff;
  border-color: rgba(0, 113, 227, 0.24);
}

.source-button.muted {
  opacity: 0.5;
  cursor: not-allowed;
}

.message-scroller {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-behavior: smooth;
}

.welcome {
  width: min(710px, calc(100% - 56px));
  min-height: 100%;
  margin: 0 auto;
  padding: clamp(66px, 11vh, 120px) 0 80px;
  text-align: left;
  animation: workspace-enter 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes workspace-enter { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }

.welcome-heading {
  display: flex;
  gap: 22px;
  align-items: center;
}

.welcome-mode-icon {
  display: grid;
  flex: 0 0 62px;
  width: 62px;
  height: 62px;
  place-items: center;
  color: #1769bd;
  background: #edf4fd;
  border: 1px solid #dbe8f7;
  border-radius: 17px;
}

.welcome-mode-icon .workspace-icon {
  width: 31px;
  height: 31px;
}

.welcome h1 {
  margin: 0;
  font-size: clamp(36px, 4vw, 50px);
  font-weight: 650;
  letter-spacing: -0.04em;
}

.welcome-subtitle {
  margin: 8px 0 0;
  color: #626b79;
  font-size: 15px;
  line-height: 1.55;
}

.suggestion-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  margin-top: 44px;
  border-top: 1px solid #e5e8ee;
}

.suggestion-card {
  position: relative;
  display: flex;
  min-height: 86px;
  padding: 17px 42px 17px 4px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  background: transparent;
  border-bottom: 1px solid #e5e8ee;
  border-radius: 0;
  box-shadow: none;
  transition:
    color 180ms ease,
    background 180ms ease;
}

.suggestion-card:hover {
  color: #075fb8;
  background: #f5f9fe;
}

.suggestion-copy {
  display: flex;
  flex-direction: column;
}

.suggestion-copy strong {
  font-size: 16px;
  font-weight: 650;
}

.suggestion-copy small {
  margin-top: 5px;
  color: #626b79;
  font-size: 12px;
  line-height: 1.45;
}

.card-arrow {
  position: absolute;
  top: 50%;
  right: 10px;
  color: #788393;
  font-size: 14px;
  transform: translateY(-50%);
}

.loading-state {
  display: grid;
  height: 100%;
  color: #86868b;
  font-size: 12px;
  place-content: center;
  text-align: center;
}

.loading-state span {
  width: 28px;
  height: 28px;
  margin: 0 auto;
  border: 2px solid rgba(29, 29, 31, 0.1);
  border-top-color: #1d1d1f;
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

.message-list {
  width: min(850px, calc(100% - 48px));
  margin: 0 auto;
  padding: 50px 0 70px;
}

.message-row {
  display: flex;
  gap: 14px;
  margin: 0 0 38px;
}

.message-row.user {
  justify-content: flex-end;
}

.assistant-avatar {
  flex: 0 0 30px;
  width: 30px;
  height: 28px;
  margin-top: 21px;
  object-fit: contain;
  box-shadow: none;
}

.message-content {
  max-width: min(720px, 85%);
}

.message-row.user .message-content {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
}

.message-role {
  display: block;
  margin: 0 0 7px;
  color: #a1a1a6;
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.05em;
}

.message-content > p {
  margin: 0;
  color: #1d1d1f;
  font-size: 15px;
  line-height: 1.82;
  letter-spacing: -0.01em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.answer-markdown {
  color: #1d1d1f;
  font-size: 15px;
  line-height: 1.82;
  letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}

.answer-markdown :deep(> :first-child) {
  margin-top: 0;
}

.answer-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.answer-markdown :deep(p) {
  margin: 0 0 14px;
}

.answer-markdown :deep(h1),
.answer-markdown :deep(h2),
.answer-markdown :deep(h3),
.answer-markdown :deep(h4) {
  margin: 24px 0 10px;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.025em;
}

.answer-markdown :deep(h1) {
  font-size: 24px;
}

.answer-markdown :deep(h2) {
  font-size: 20px;
}

.answer-markdown :deep(h3),
.answer-markdown :deep(h4) {
  font-size: 16px;
}

.answer-markdown :deep(ul),
.answer-markdown :deep(ol) {
  margin: 10px 0 16px;
  padding-left: 22px;
}

.answer-markdown :deep(li) {
  margin: 5px 0;
}

.answer-markdown :deep(a) {
  color: #0071e3;
  text-decoration: none;
}

.answer-markdown :deep(a:hover) {
  text-decoration: underline;
}

.answer-markdown :deep(blockquote) {
  margin: 16px 0;
  padding: 2px 0 2px 16px;
  color: #6e6e73;
  border-left: 3px solid rgba(0, 113, 227, 0.35);
}

.answer-markdown :deep(code) {
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.88em;
  background: #f2f2f4;
  border-radius: 6px;
}

.answer-markdown :deep(pre) {
  margin: 16px 0;
  padding: 16px;
  overflow-x: auto;
  color: #f5f5f7;
  background: #1d1d1f;
  border-radius: 14px;
}

.answer-markdown :deep(pre code) {
  padding: 0;
  color: inherit;
  background: transparent;
}

.answer-streaming {
  color: #1d1d1f;
  line-height: 1.78;
  white-space: pre-wrap;
}

.answer-interrupted {
  margin: 10px 0;
  padding: 10px 13px;
  border: 1px solid #e7c5a4;
  border-radius: 10px;
  color: #71461b;
  background: #fff8f0;
  font-size: 13px;
  line-height: 1.5;
}

.answer-streaming i {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 3px;
  vertical-align: -0.12em;
  background: #0071e3;
  border-radius: 999px;
  animation: stream-caret 920ms ease-in-out infinite;
}

@keyframes stream-caret {
  0%,
  100% {
    opacity: 0.18;
  }

  50% {
    opacity: 1;
  }
}

.answer-markdown :deep(table) {
  width: 100%;
  margin: 16px 0;
  overflow: hidden;
  font-size: 13px;
  border-collapse: collapse;
  border: 1px solid rgba(29, 29, 31, 0.09);
  border-radius: 12px;
}

.answer-markdown :deep(th),
.answer-markdown :deep(td) {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(29, 29, 31, 0.07);
}

.answer-markdown :deep(th) {
  background: #f5f5f7;
  font-weight: 650;
}

.campus-service-result {
  overflow: hidden;
  margin-top: 2px;
  background: #fff;
  border: 1px solid #dce6f2;
  border-radius: 16px;
  box-shadow: 0 6px 24px rgba(30, 58, 96, 0.04);
}

.campus-service-result > header {
  display: flex;
  gap: 11px;
  align-items: center;
  padding: 16px 17px 13px;
}

.service-result-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  color: #1269d3;
  background: #eaf3fd;
  border-radius: 10px;
  place-items: center;
}

.service-result-icon svg {
  width: 19px;
  height: 19px;
  fill: currentColor;
}

.campus-service-result > header > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.campus-service-result > header small {
  color: #78889a;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.04em;
}

.campus-service-result > header strong {
  margin-top: 3px;
  overflow: hidden;
  color: #172a42;
  font-size: 13px;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.service-result-state {
  display: flex;
  gap: 5px;
  align-items: center;
  margin-left: auto;
  padding: 5px 8px;
  flex: 0 0 auto;
  color: #1d7141;
  font-size: 9px;
  font-weight: 650;
  background: rgba(52, 199, 89, 0.09);
  border-radius: 999px;
}

.service-result-state i {
  width: 5px;
  height: 5px;
  background: #34a853;
  border-radius: 50%;
}

.service-result-state.caution {
  color: #946200;
  background: rgba(255, 159, 10, 0.11);
}

.service-result-state.caution i {
  background: #ff9f0a;
}

.campus-service-result > p {
  margin: 0;
  padding: 2px 17px 16px;
  color: #273b52;
  font-size: 13px;
  line-height: 1.7;
}

.service-result-meta {
  display: grid;
  grid-template-columns: 1.15fr 0.9fr 0.9fr;
  margin: 0 17px;
  overflow: hidden;
  background: #f7f9fc;
  border-radius: 10px;
}

.service-result-meta > span {
  display: flex;
  min-width: 0;
  padding: 10px 11px;
  flex-direction: column;
}

.service-result-meta > span + span {
  border-left: 1px solid rgba(25, 89, 166, 0.08);
}

.service-result-meta small {
  color: #8390a0;
  font-size: 8px;
}

.service-result-meta strong {
  margin-top: 4px;
  overflow: hidden;
  color: #30455e;
  font-size: 10px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.campus-service-result > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 13px;
  padding: 11px 17px 13px;
  color: #8692a0;
  font-size: 9px;
  border-top: 1px solid rgba(25, 89, 166, 0.07);
}

.campus-service-result > footer a,
.campus-service-result > footer button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 0;
  color: #1269d3;
  font: inherit;
  font-size: 10px;
  font-weight: 650;
  text-decoration: none;
  background: transparent;
}

.service-answer-detail {
  margin-top: 17px;
}

.message-row.user .message-content > p {
  padding: 13px 17px;
  background: #1d1d1f;
  color: #fff;
  border-radius: 20px 20px 5px 20px;
}

.message-sources {
  display: grid;
  gap: 15px;
  margin-top: 22px;
  padding: 17px;
  background: #f8fafc;
  border: 1px solid #e2e8ef;
  border-radius: 16px;
}

.compact-service-sources {
  gap: 11px;
  margin-top: 12px;
  padding: 13px 15px;
}

.web-sources {
  background: #f8faff;
  border-color: #e2eaf6;
}

.web-source-mark {
  color: #0071e3;
  background: rgba(0, 113, 227, 0.09);
}

.web-source-list {
  display: grid;
  gap: 8px;
}

.web-source-list a {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 18px;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 10px 11px;
  color: #1d1d1f;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(29, 29, 31, 0.06);
  border-radius: 12px;
  transition: background 180ms ease, border-color 180ms ease;
}

.web-source-list a:hover {
  background: #fff;
  border-color: rgba(0, 113, 227, 0.2);
}

.web-source-site-icon {
  display: grid;
  width: 32px;
  height: 32px;
  color: #075fb8;
  place-items: center;
  background: rgba(0, 113, 227, 0.08);
  border: 1px solid rgba(0, 113, 227, 0.1);
  border-radius: 10px;
}

.web-source-site-icon svg {
  width: 17px;
  height: 17px;
  fill: currentColor;
}

.web-source-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.web-source-list strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.web-source-list small {
  margin-top: 4px;
  overflow: hidden;
  color: #86868b;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.web-source-open {
  color: #a1a1a6;
  font-size: 13px;
}

.answer-feedback {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 18px;
  color: #626b79;
  font-size: 11px;
}

.copy-answer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  margin-right: 12px;
  padding: 0 8px;
  color: #4d5a6c;
  background: #f1f4f8;
  border-radius: 8px;
  font-size: 11px;
  transition: color 180ms ease, background 180ms ease;
}

.copy-answer:hover {
  color: #075fb8;
  background: #e8f1fc;
}

.feedback-buttons {
  display: flex;
  gap: 5px;
  align-items: center;
}

.feedback-buttons button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  color: #86868b;
  background: rgba(245, 245, 247, 0.82);
  border: 1px solid rgba(29, 29, 31, 0.06);
  border-radius: 999px;
  transition:
    color 180ms ease,
    background 180ms ease,
    border-color 180ms ease,
    transform 180ms ease;
}

.feedback-buttons button:hover:not(:disabled) {
  color: #1d1d1f;
  background: #fff;
  border-color: rgba(29, 29, 31, 0.12);
  transform: translateY(-1px);
}

.feedback-buttons button.active {
  color: #0071e3;
  background: rgba(0, 113, 227, 0.09);
  border-color: rgba(0, 113, 227, 0.18);
}

.feedback-buttons button:disabled {
  cursor: wait;
  opacity: 0.5;
}

.feedback-buttons svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}

.feedback-buttons small {
  margin-left: 3px;
  color: #86868b;
  font-size: 9px;
}

.feedback-detail {
  display: flex;
  gap: 8px;
  max-width: 460px;
  margin-top: 8px;
}

.feedback-detail input {
  min-width: 0;
  flex: 1;
  padding: 9px 12px;
  color: #1d1d1f;
  font: inherit;
  font-size: 11px;
  background: rgba(245, 245, 247, 0.86);
  border: 1px solid transparent;
  border-radius: 11px;
  outline: none;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.feedback-detail input:focus {
  background: #fff;
  border-color: rgba(0, 113, 227, 0.38);
  box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.08);
}

.feedback-detail button {
  padding: 8px 12px;
  color: #fff;
  font-size: 10px;
  font-weight: 650;
  background: #1d1d1f;
  border-radius: 10px;
}

.feedback-detail-enter-active,
.feedback-detail-leave-active {
  transition:
    opacity 200ms ease,
    transform 200ms ease;
}

.feedback-detail-enter-from,
.feedback-detail-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.knowledge-gap {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding: 13px 14px;
  background: rgba(245, 245, 247, 0.78);
  border: 1px solid rgba(29, 29, 31, 0.07);
  border-radius: 14px;
}

.knowledge-gap > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.knowledge-gap strong {
  font-size: 11px;
  font-weight: 650;
}

.knowledge-gap span {
  margin-top: 3px;
  color: #86868b;
  font-size: 10px;
  line-height: 1.4;
}

.knowledge-gap button {
  flex: 0 0 auto;
  padding: 7px 10px;
  color: #0071e3;
  font-size: 10px;
  font-weight: 650;
  background: rgba(0, 113, 227, 0.08);
  border-radius: 999px;
  transition:
    background 180ms ease,
    transform 180ms ease;
}

.knowledge-gap button:hover {
  background: rgba(0, 113, 227, 0.13);
  transform: translateY(-1px);
}

.knowledge-gap .submission-status {
  flex: 0 0 auto;
  margin: 0;
  padding: 7px 10px;
  color: #248a3d;
  font-size: 10px;
  font-weight: 650;
  background: rgba(52, 199, 89, 0.1);
  border-radius: 999px;
}

.contribution-form {
  margin-top: 10px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(0, 113, 227, 0.14);
  border-radius: 16px;
  box-shadow: 0 12px 34px rgba(20, 54, 92, 0.07);
}

.contribution-heading,
.contribution-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.contribution-heading > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.contribution-heading strong {
  font-size: 12px;
  font-weight: 650;
}

.contribution-heading span {
  margin-top: 4px;
  overflow: hidden;
  color: #86868b;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contribution-heading > button {
  flex: 0 0 auto;
  padding: 5px 8px;
  color: #86868b;
  font-size: 10px;
  background: transparent;
}

.contribution-form textarea,
.contribution-form input {
  width: 100%;
  margin-top: 12px;
  padding: 12px 13px;
  color: #1d1d1f;
  font-size: 12px;
  line-height: 1.55;
  background: #f5f5f7;
  border: 1px solid transparent;
  border-radius: 12px;
  outline: none;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.contribution-form textarea {
  min-height: 104px;
  resize: vertical;
}

.contribution-form textarea:focus,
.contribution-form input:focus {
  background: #fff;
  border-color: rgba(0, 113, 227, 0.5);
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.08);
}

.contribution-actions {
  margin-top: 12px;
}

.contribution-actions > span {
  color: #a1a1a6;
  font-size: 9px;
}

.contribution-actions > button {
  flex: 0 0 auto;
  padding: 8px 13px;
  color: #fff;
  font-size: 10px;
  font-weight: 650;
  background: #1d1d1f;
  border-radius: 999px;
  transition:
    background 180ms ease,
    transform 180ms ease,
    opacity 180ms ease;
}

.contribution-actions > button:hover:not(:disabled) {
  background: #0071e3;
  transform: translateY(-1px);
}

.contribution-actions > button:disabled {
  cursor: default;
  opacity: 0.5;
}

.contribution-enter-active,
.contribution-leave-active {
  overflow: hidden;
  transition:
    opacity 260ms ease,
    transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

.contribution-enter-from,
.contribution-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.985);
}

.source-panel-header {
  display: flex;
  gap: 10px;
  align-items: center;
}

.source-panel-mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  color: #345b7c;
  background: #eaf1f7;
  border-radius: 10px;
  place-items: center;
}

.source-panel-mark svg {
  width: 19px;
  height: 19px;
  fill: currentColor;
}

.source-panel-header > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.source-panel-header small {
  color: #738084;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.source-panel-header strong {
  margin-top: 3px;
  color: #173643;
  font-size: 13px;
  font-weight: 680;
}

.source-count {
  margin-left: auto;
  padding: 5px 8px;
  color: #51666d;
  font-size: 9px;
  font-weight: 650;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(20, 62, 80, 0.07);
  border-radius: 999px;
}

.source-summary-grid {
  display: grid;
  grid-template-columns: 1.2fr 0.9fr 0.9fr;
  overflow: hidden;
  background: #fff;
  border: 1px solid #e7ecf1;
  border-radius: 10px;
}

.source-summary-grid > div {
  display: flex;
  min-width: 0;
  padding: 11px 12px;
  flex-direction: column;
}

.source-summary-grid > div + div {
  border-left: 1px solid rgba(20, 62, 80, 0.07);
}

.source-summary-grid small {
  color: #8a9497;
  font-size: 9px;
}

.source-summary-grid strong {
  margin-top: 4px;
  overflow: hidden;
  color: #344b54;
  font-size: 11px;
  font-weight: 620;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-panel-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.source-panel-actions button,
.source-panel-actions a {
  padding: 7px 10px;
  color: #244754;
  font: inherit;
  font-size: 10px;
  font-weight: 650;
  text-decoration: none;
  background: #fff;
  border: 1px solid #dfe7ee;
  border-radius: 9px;
  transition:
    background 180ms ease,
    transform 180ms ease;
}

.source-panel-actions button:hover,
.source-panel-actions a:hover {
  background: #fff;
  transform: translateY(-1px);
}

.source-reference-list {
  display: grid;
  gap: 6px;
  padding-top: 3px;
  border-top: 1px solid rgba(20, 62, 80, 0.07);
}

.source-reference-list a,
.source-reference-list > div {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: #53666d;
  font-size: 10px;
  text-decoration: none;
}

.source-reference-list span {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: #fff;
  font-size: 8px;
  background: #557b84;
  border-radius: 6px;
  place-items: center;
}

.source-reference-list strong {
  overflow: hidden;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.waiting-row {
  min-height: 68px;
}

.thinking {
  display: flex;
  gap: 5px;
  align-items: center;
  min-height: 34px;
  color: #86868b;
  font-size: 11px;
}

.thinking i {
  width: 5px;
  height: 5px;
  background: #86868b;
  border-radius: 50%;
  animation: thinking 1.25s ease-in-out infinite;
}

.thinking i:nth-child(2) {
  animation-delay: 140ms;
}

.thinking i:nth-child(3) {
  margin-right: 5px;
  animation-delay: 280ms;
}

.composer-wrap {
  flex: 0 0 auto;
  padding: 16px 32px 18px;
  background: linear-gradient(180deg, rgba(251, 251, 253, 0), #fbfbfd 26%);
  z-index: 4;
}

.composer {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  width: min(790px, 100%);
  min-height: 62px;
  margin: 0 auto;
  padding: 9px 10px 9px 22px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(29, 29, 31, 0.1);
  border-radius: 24px;
  box-shadow: 0 14px 44px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(22px) saturate(150%);
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    opacity 180ms ease;
}

.composer:focus-within {
  border-color: rgba(0, 113, 227, 0.42);
  box-shadow: 0 16px 48px rgba(0, 113, 227, 0.1);
}

.composer.disabled {
  opacity: 0.72;
}

.composer textarea {
  min-width: 0;
  height: 38px;
  max-height: 138px;
  overflow-y: hidden;
  padding: 7px 0;
  flex: 1;
  resize: none;
  color: #1d1d1f;
  font-size: 15px;
  line-height: 1.5;
  background: transparent;
  border: 0;
  outline: 0;
}

.composer textarea::placeholder {
  color: #a1a1a6;
}

.send-button {
  display: grid;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  color: #fff;
  font-size: 18px;
  background: #1d1d1f;
  border-radius: 50%;
  place-items: center;
  transition:
    transform 180ms ease,
    background 180ms ease,
    opacity 180ms ease;
}

.send-button:hover:not(:disabled) {
  background: #0071e3;
  transform: scale(1.04);
}

.send-button:disabled {
  cursor: default;
  opacity: 0.42;
}

.composer-meta {
  display: flex;
  gap: 18px;
  justify-content: center;
  margin: 9px 0 0;
  color: #a1a1a6;
  font-size: 10px;
  text-align: center;
}

.answer-notice {
  width: min(790px, 100%);
  margin: 10px auto 0;
  color: #515d51;
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.jump-latest {
  position: absolute;
  right: 28px;
  bottom: 112px;
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 9px 13px;
  color: #1d1d1f;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(29, 29, 31, 0.09);
  border-radius: 999px;
  box-shadow: 0 9px 30px rgba(0, 0, 0, 0.11);
  backdrop-filter: blur(18px);
  z-index: 6;
}

.jump-enter-active,
.jump-leave-active {
  transition:
    opacity 220ms ease,
    transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
}

.jump-enter-from,
.jump-leave-to {
  opacity: 0;
  transform: translateY(9px);
}

.contact-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  padding: 20px;
  overflow-y: auto;
  background: rgba(15, 15, 17, 0.52);
  backdrop-filter: blur(22px) saturate(125%);
  place-items: center;
  z-index: 999;
}

.chat-contact-dialog {
  position: relative;
  width: min(620px, 100%);
  max-height: calc(100svh - 40px);
  padding: 48px 52px 40px;
  overflow-y: auto;
  background:
    radial-gradient(circle at 100% 0%, rgba(10, 132, 255, 0.1), transparent 36%),
    rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 28px;
  box-shadow: 0 45px 130px rgba(0, 0, 0, 0.28);
}

.contact-close {
  position: absolute;
  top: 17px;
  right: 17px;
  display: grid;
  width: 34px;
  height: 34px;
  color: #6e6e73;
  font-size: 20px;
  line-height: 1;
  background: rgba(118, 118, 128, 0.1);
  border-radius: 50%;
  place-items: center;
}

.contact-eyebrow {
  margin: 0 0 12px;
  color: #0071e3;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.17em;
}

.chat-contact-dialog h2 {
  margin: 0;
  font-size: 40px;
  font-weight: 650;
  letter-spacing: -0.055em;
}

.contact-description {
  margin: 10px 0 26px;
  color: #6e6e73;
  font-size: 13px;
  line-height: 1.65;
}

.chat-contact-dialog form {
  display: grid;
  gap: 11px;
}

.contact-grid {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 11px;
}

.chat-contact-dialog input,
.chat-contact-dialog textarea {
  width: 100%;
  padding: 0 15px;
  color: #1d1d1f;
  font: inherit;
  font-size: 13px;
  background: #f5f5f7;
  border: 1px solid transparent;
  border-radius: 13px;
  outline: none;
  box-sizing: border-box;
  transition:
    background 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.chat-contact-dialog input {
  height: 50px;
}

.chat-contact-dialog textarea {
  min-height: 128px;
  padding-top: 14px;
  resize: none;
  line-height: 1.6;
}

.chat-contact-dialog input:focus,
.chat-contact-dialog textarea:focus {
  background: #fff;
  border-color: #0071e3;
  box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.1);
}

.chat-contact-dialog form > button {
  min-height: 50px;
  margin-top: 3px;
  color: #fff;
  font-size: 13px;
  font-weight: 650;
  background: #1d1d1f;
  border-radius: 999px;
}

.chat-contact-dialog form > button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.chat-contact-dialog > small {
  display: block;
  margin-top: 15px;
  color: #a1a1a6;
  font-size: 9px;
  text-align: center;
}

.delete-dialog {
  width: min(430px, 100%);
  padding: 38px 38px 32px;
  color: #1d1d1f;
  text-align: center;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 26px;
  box-shadow: 0 45px 130px rgba(0, 0, 0, 0.28);
}

.delete-icon {
  display: grid;
  width: 48px;
  height: 48px;
  margin: 0 auto 20px;
  color: #d70015;
  font-size: 20px;
  background: rgba(215, 0, 21, 0.08);
  border-radius: 50%;
  place-items: center;
}

.delete-dialog h2 {
  margin: 0;
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.04em;
}

.delete-dialog p {
  margin: 12px 0 26px;
  color: #6e6e73;
  font-size: 13px;
  line-height: 1.65;
}

.delete-dialog > div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.delete-dialog button {
  min-height: 44px;
  font-size: 12px;
  font-weight: 650;
  background: #ededf0;
  border-radius: 999px;
}

.delete-dialog button:last-child {
  color: #fff;
  background: #d70015;
}

.delete-dialog .contact-close {
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  min-height: 32px;
  padding: 0;
  color: #6e6e73;
  font-size: 19px;
  font-weight: 400;
  background: rgba(118, 118, 128, 0.1);
  border-radius: 50%;
}

.logout-dialog {
  position: relative;
  padding-top: 48px;
}
.logout-dialog:focus { outline: none; }
.delete-dialog.logout-dialog p { font-size: 15px; color: #596457; }
.delete-dialog.logout-dialog p.work-error { color: #933c2c; }
.delete-dialog.logout-dialog > div button { font-size: 15px; min-height: 46px; }
.delete-dialog.logout-dialog > div button:last-child { background: #3547e1; }

.delete-dialog button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.contact-modal-enter-active,
.contact-modal-leave-active {
  transition: opacity 280ms ease;
}

.contact-modal-enter-active .chat-contact-dialog,
.contact-modal-leave-active .chat-contact-dialog,
.contact-modal-enter-active .delete-dialog,
.contact-modal-leave-active .delete-dialog,
.contact-modal-enter-active .membership-dialog,
.contact-modal-leave-active .membership-dialog {
  transition:
    opacity 320ms ease,
    transform 460ms cubic-bezier(0.22, 1, 0.36, 1);
}

.contact-modal-enter-from,
.contact-modal-leave-to,
.contact-modal-enter-from .chat-contact-dialog,
.contact-modal-leave-to .chat-contact-dialog,
.contact-modal-enter-from .delete-dialog,
.contact-modal-leave-to .delete-dialog,
.contact-modal-enter-from .membership-dialog,
.contact-modal-leave-to .membership-dialog {
  opacity: 0;
}

.contact-modal-enter-from .chat-contact-dialog,
.contact-modal-enter-from .delete-dialog,
.contact-modal-enter-from .membership-dialog {
  transform: translateY(28px) scale(0.96);
}

.contact-modal-leave-to .chat-contact-dialog,
.contact-modal-leave-to .delete-dialog,
.contact-modal-leave-to .membership-dialog {
  transform: translateY(14px) scale(0.98);
}

@keyframes pulse-orb {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    border-radius: 54% 46% 58% 42%;
    transform: translateY(-5px) rotate(8deg);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes thinking {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome { animation: none; }
  .workspace-switcher::before { transition: none; }
  .thinking i,
  .loading-state span {
    animation: none;
  }

  .message-scroller {
    scroll-behavior: auto;
  }
}

@media (max-width: 960px) {
  .workspace {
    display: block;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    display: flex;
    width: min(286px, calc(100vw - 48px));
    padding: 22px 16px 16px;
    transform: translateX(-105%);
    transition: transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
    z-index: 30;
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }

  .sidebar .brand,
  .sidebar .compose-button,
  .sidebar .nav-item,
  .sidebar .profile {
    justify-content: flex-start;
  }

  .sidebar .compose-button span,
  .sidebar .nav-item span,
  .sidebar .conversation-item span {
    display: inline;
  }

  .sidebar .brand-copy {
    display: flex;
  }

  .sidebar .nav-label,
  .sidebar .sidebar-status {
    display: block;
  }

  .sidebar .membership-entry small {
    display: inline;
  }

  .sidebar .profile-copy {
    display: flex;
  }

  .sidebar .profile-menu {
    right: 0;
    width: auto;
  }

  .sidebar .compose-button {
    width: 100%;
  }

  .sidebar .conversation-item {
    justify-content: flex-start;
    padding: 0 38px 0 12px;
  }

  .sidebar .conversation-delete {
    display: grid;
  }

  .mobile-sidebar-mask {
    position: fixed;
    inset: 0;
    display: block;
    background: rgba(15, 15, 17, 0.35);
    border-radius: 0;
    backdrop-filter: blur(8px);
    z-index: 25;
  }

  .sidebar-mask-enter-active,
  .sidebar-mask-leave-active {
    transition: opacity 280ms ease;
  }

  .sidebar-mask-enter-from,
  .sidebar-mask-leave-to {
    opacity: 0;
  }

  .chat-main {
    height: 100svh;
  }

  .chat-header {
    grid-template-columns: auto 1fr auto;
    height: 56px;
    padding: 0 15px;
  }

  .mobile-menu-button {
    display: grid;
    width: 34px;
    height: 34px;
    padding: 0;
    color: #515154;
    background: transparent;
    place-items: center;
  }

  .connection-state {
    display: none;
  }

  .connection-state span:last-child,
  .source-button span {
    display: none;
  }

  .header-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .workspace-switcher {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: min(250px, calc(100vw - 112px));
    min-height: 40px;
  }

  .workspace-switcher button {
    grid-template-columns: 18px auto;
    min-height: 34px;
    padding: 5px 6px;
  }

  .workspace-switcher .workspace-icon {
    width: 18px;
    height: 18px;
  }

  .workspace-switcher span {
    font-size: 11px;
  }

  .workspace-switcher small {
    display: none;
  }

  .source-button {
    padding: 8px;
  }

  .membership-dialog {
    padding: 40px 24px 28px;
    border-radius: 24px;
  }

  .welcome {
    width: calc(100% - 32px);
    padding: 42px 0 50px;
  }

  .welcome h1 {
    font-size: clamp(30px, 5vw, 38px);
  }

  .welcome-subtitle {
    font-size: 14px;
  }

  .suggestion-grid {
    margin-top: 30px;
  }

  .message-list {
    width: calc(100% - 28px);
    padding: 32px 0 48px;
  }

  .message-content {
    max-width: 88%;
  }

  .source-summary-grid {
    grid-template-columns: 1fr;
  }

  .service-result-meta {
    grid-template-columns: 1fr;
  }

  .service-result-meta > span + span {
    border-top: 1px solid rgba(25, 89, 166, 0.08);
    border-left: 0;
  }

  .campus-service-result > footer {
    gap: 10px;
    align-items: flex-start;
    flex-direction: column;
  }

  .source-summary-grid > div + div {
    border-top: 1px solid rgba(20, 62, 80, 0.07);
    border-left: 0;
  }

  .source-panel-actions {
    flex-wrap: wrap;
  }

  .knowledge-gap,
  .contribution-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .knowledge-gap button,
  .knowledge-gap .submission-status,
  .contribution-actions > button {
    align-self: flex-end;
  }

  .composer-wrap {
    padding: 12px 12px 10px;
  }

  .composer-wrap > .composer-meta {
    display: none;
  }

  .jump-latest {
    right: 14px;
    bottom: 90px;
  }

  .contact-overlay {
    padding: 12px;
  }

  .chat-contact-dialog {
    padding: 44px 20px 28px;
    border-radius: 24px;
  }

  .chat-contact-dialog h2 {
    font-size: 34px;
  }

  .contact-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .welcome-heading {
    gap: 14px;
    align-items: flex-start;
  }

  .welcome-mode-icon {
    width: 48px;
    height: 48px;
    flex-basis: 48px;
    border-radius: 14px;
  }

  .welcome-mode-icon .workspace-icon {
    width: 25px;
    height: 25px;
  }

  .welcome-heading > div { min-width: 0; }
  .welcome h1 { font-size: 30px; overflow-wrap: anywhere; }
  .suggestion-card { min-height: 82px; }
}

/* Conversation surfaces: the outgoing bubble carries the color, not the whole page. */
.workspace { background:#eef1f6; }
.sidebar { background:radial-gradient(ellipse at 0 95%,#dfe9f680,transparent 55%),radial-gradient(ellipse at 100% 65%,#e9dfeb70,transparent 50%),#e9edf2; border-right:1px solid #d8dee7; }
.sidebar .nav-item.active,.sidebar .conversation-row.active { color:#23364b; background:#d8dfe9; box-shadow:inset 0 1px 0 #ffffff70; }
.sidebar .nav-item:hover,.sidebar .conversation-row:hover { background:#dde3ec; }
.sidebar .history-search { background:#ffffff80; border-color:#d5dde7; }
.chat-main { background:#f8f9fc; }
.chat-header { border-bottom:1px solid #ebedf2; background:#ffffffed; backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); }
.message-scroller { background:#f8f9fc; scrollbar-color:#c8d4e6 transparent; scrollbar-width:thin; }
.message-list { width:min(780px,calc(100% - 48px)); padding-top:58px; }
.message-row { gap:11px; margin-bottom:29px; animation:conversation-appear .42s cubic-bezier(.22,1,.36,1) both; }
.message-content { max-width:min(650px,84%); }
.message-role { margin:0 0 6px 5px; color:#737f90; font-size:11px; font-weight:600; letter-spacing:0; }
.message-row.user .message-role { margin-right:7px; }
.message-row.user .message-content > p { max-width:100%; padding:11px 16px 12px; border-radius:19px 19px 5px 19px; color:#fff; background:#0b76e8; box-shadow:0 5px 16px #075cb323; font-size:15px; line-height:1.62; }
.message-row.assistant .message-content { padding:0 0 0 1px; }
.assistant-avatar { width:28px; flex-basis:28px; margin-top:22px; }
.answer-markdown,.answer-streaming { color:#273142; font-size:15px; line-height:1.72; }
.answer-bubble { min-width:64px; padding:16px 20px; border:1px solid #e1e5ec; border-radius:5px 22px 22px 22px; background:#fff; box-shadow:0 2px 3px #24365004,0 6px 20px #24365005; overflow-wrap:anywhere; }
.answer-bubble .answer-markdown :deep(> :first-child) { margin-top:0; }
.answer-bubble .answer-markdown :deep(> :last-child) { margin-bottom:0; }
.answer-bubble .campus-service-result { margin:0; border:0; background:transparent; box-shadow:none; }
.answer-bubble .service-answer-detail { margin-top:14px; }
.answer-bubble .answer-streaming { margin:0; }
.typing-indicator { display:flex; align-items:center; gap:5px; min-height:24px; padding:0 3px; }
.typing-indicator b { width:6px; height:6px; border-radius:50%; background:#8091aa; animation:typing-pulse 1.2s ease-in-out infinite; }
.typing-indicator b:nth-child(2) { animation-delay:120ms; }
.typing-indicator b:nth-child(3) { animation-delay:240ms; }
.thinking-bubble { display:flex; align-items:center; gap:12px; color:#64748b; font-size:12px; }
@keyframes typing-pulse { 0%,65%,100% { opacity:.45; transform:translateY(0); } 30% { opacity:1; transform:translateY(-3px); } }
@media (prefers-reduced-motion:reduce) { .typing-indicator b { animation:none; } }
.answer-markdown :deep(p) { margin-bottom:12px; }
.answer-markdown :deep(h1),.answer-markdown :deep(h2),.answer-markdown :deep(h3) { color:#171d2a; }
.answer-markdown :deep(blockquote) { border-left:2px solid #b5cceb; color:#526273; }
.answer-markdown :deep(pre) { border-radius:15px; }
.composer-wrap { padding:16px 28px 20px; background:linear-gradient(180deg,#f8f9fc00,#f8f9fc 30%); }
.composer { border:1px solid #d9e0eb; border-radius:24px; background:#fff; box-shadow:0 8px 28px #233b6010,inset 0 1px 0 #fff; }
.composer:focus-within { background:#fff; border-color:#8ebbf0; box-shadow:0 14px 36px #2363a71f,0 0 0 3px #0b76e814; }
.send-button { background:#0b76e8; }
.send-button:hover:not(:disabled) { background:#005fc6; }
.composer-meta { color:#768293; font-size:11px; }
.citation-details { display:block; margin-top:16px; padding:0; border:0; border-top:1px solid #e5ebf2; border-radius:0; background:transparent; box-shadow:none; }
.citation-details summary { display:flex; align-items:center; gap:9px; width:fit-content; padding:10px 2px; color:#426480; cursor:pointer; list-style:none; font-size:11px; font-weight:620; }
.citation-details summary::-webkit-details-marker { display:none; }
.citation-details summary span { color:#8290a0; font-weight:500; }
.citation-details summary i { display:inline-block; margin-left:4px; color:#8290a0; font-size:15px; font-style:normal; transition:transform .24s ease; }
.citation-details[open] summary i { transform:rotate(180deg); }
.citation-details .source-reference-list { gap:0; padding:2px 0 0; border-top:0; }
.citation-details .source-reference-list a,.citation-details .source-reference-list > div { align-items:flex-start; padding:10px 2px; border-bottom:1px solid #eff2f6; color:#324b64; font-size:12px; }
.citation-details .source-reference-list span { width:22px; height:22px; flex-basis:22px; border-radius:7px; background:#e8f2ff; color:#0b6acb; font-size:10px; }
.citation-details .source-reference-list strong { display:grid; gap:4px; overflow:visible; white-space:normal; font-weight:620; }
.citation-details .source-reference-list small { color:#728092; font-size:10px; font-weight:450; }
.web-sources { border:0; border-top:1px solid #e5ebf2; border-radius:0; background:transparent; box-shadow:none; }
.web-sources .source-panel-mark { display:none; }
.web-sources .source-panel-header { padding:8px 0; }
.web-sources .source-panel-header strong { font-size:12px; }
.web-source-list { gap:0; }
.web-source-list a { border:0; border-bottom:1px solid #eef1f6; border-radius:0; background:transparent; }
.knowledge-gap { gap:12px; margin-top:14px; padding:10px 0 0; border:0; border-top:1px solid #edf1f5; border-radius:0; background:transparent; }
.knowledge-gap strong { color:#657487; font-size:11px; font-weight:600; }
.knowledge-gap span { color:#8792a1; }
.knowledge-gap button { padding:6px 0; border-radius:0; background:transparent; }
.knowledge-gap button:hover { background:transparent; text-decoration:underline; }
@keyframes conversation-appear { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
@media (max-width:760px) { .chat-header { grid-template-columns:auto 1fr; }.message-list { width:calc(100% - 28px); padding-top:30px; }.message-row { margin-bottom:24px; }.message-content { max-width:calc(100% - 39px); }.answer-bubble { padding:13px 15px; border-radius:5px 18px 18px 18px; }.composer-wrap { padding:11px 12px 14px; }.composer textarea { font-size:16px; } }
@media (prefers-reduced-motion:reduce) { .message-row { animation:none; }.citation-details summary i { transition:none; } }
</style>
