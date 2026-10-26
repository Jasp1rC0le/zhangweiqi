<script setup>
import DateField from '@/components/DateField.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { ArrowRight, Plus, Download, FolderOpened, DocumentChecked, Clock, Delete, Check } from '@element-plus/icons-vue'
import CampMark from '@/components/CampMark.vue'
import ProjectDataPanel from '@/components/ProjectDataPanel.vue'
import AttachmentImportPanel from '@/components/AttachmentImportPanel.vue'
import ProjectReviewPanel from '@/components/ProjectReviewPanel.vue'
import InstrumentLibrary from '@/components/InstrumentLibrary.vue'
import FormDraftRecovery from '@/components/FormDraftRecovery.vue'
import { projectFormRecovery } from '@/utils/formDraftRecovery.js'
import { useFormDraftRecovery } from '@/utils/useFormDraftRecovery.js'
import { projectRecoveryConflict } from '@/utils/formDraftSchemas.js'
import { projectTemplates } from '@/utils/projectTemplates'
import { useAuthStore } from '@/stores/auth'
import { createLatestRequest } from '@/utils/latestRequest'
import { isAdministrator } from '@/utils/adminAccess'
import { projectChanges, defensePrompts, defenseMarkdown } from '@/utils/projectProgress'
import { reviewInput, reviewFingerprint, recordReviewFeedback } from '@/utils/projectReview'
import { emptyDataSheet } from '@/utils/projectDataCheck'
import { taskHints, nextProjectAction, evidenceSelection, selectionStillValid } from '@/utils/projectGuidance'
import * as api from '@/api/projects'
import { emptyProject, tracks, trackName, newRequirement, splitBrief, inspectProject, sourceValid, evidenceLine, projectMarkdown, validateProject } from '@/utils/projectStudio'
import '@/styles/project-studio.css'

const route = useRoute(), router = useRouter()
const auth = useAuthStore()
const isAdmin = computed(() => isAdministrator(auth.user))
const projects = ref([]), loading = ref(true), busy = ref(false), error = ref(''), status = ref('')
const listError = ref('')
const current = ref(null), draft = ref(emptyProject()), archived = ref(false), saved = ref('')
const editing = ref(false), section = ref('requirements'), versions = ref([]), versionsLoading = ref(false)
const reviewed = ref(null), reviewedContent = ref(''), showArchived = ref(false)
const reviewDigest = ref(''), reviewing = ref(false), feedbackIssue = ref(null), feedbackReason = ref(''), previousIssueCount = ref(null)
const createId = ref(crypto.randomUUID()), nextTrack = ref('business')
const importer = ref()
const instrumentLibrary = ref(), instrumentEpoch = ref(0)
const taskTemplate = computed(() => projectTemplates[draft.value.track] || projectTemplates.general)
const selection = ref(null), evidenceTarget = ref('')
const hints = computed(() => taskHints[draft.value.track] || taskHints.general)
const nextAction = computed(() => nextProjectAction(draft.value))
const comparison = ref(null)
const changes = computed(() => comparison.value ? projectChanges(comparison.value.content, draft.value) : [])
const defense = computed(() => defensePrompts(draft.value))
watch(draft, () => { selection.value = null; evidenceTarget.value = '' })
let openSequence = 0, disposed = false, recoveryNavigation = false, syncingSavedRoute = ''
const stamp = () => JSON.stringify({ content: draft.value, archived: archived.value })
const clone = (value) => JSON.parse(JSON.stringify(value))
const dirty = computed(() => editing.value && saved.value !== stamp())
const recovery = useFormDraftRecovery(projectFormRecovery, () => dirty.value ? [{
  id:createId.value,projectId:current.value?.id ?? null,baseRevision:current.value?.revision ?? null,
  archived:archived.value,content:clone(draft.value),
}] : [])
const {state:recoveryState,pending:pendingDraft,notice:recoveryNotice} = recovery
watch([draft,archived],() => recovery.save(),{deep:true})
const visibleProjects = computed(() => projects.value.filter(p => showArchived.value || !p.archived))
const currentTrack = computed(() => tracks.find(t => t.id === draft.value.track) || tracks[2])
const reviewStale = computed(() => reviewedContent.value !== reviewInput(draft.value))
const tabs = [{ id: 'requirements', label: '任务要求' }, { id: 'materials', label: '材料与证据' }, { id: 'instruments', label: '仪器与调试' }, { id: 'data', label: '数据检查' }, { id: 'review', label: '提交前检查' }, { id: 'defense', label: '答辩准备' }, { id: 'collaboration', label: '协作审阅' }, { id: 'versions', label: '历史版本' }]
function appendInstrument(note) {
  if(busy.value||disposed)return
  if(draft.value.manuscript.length+note.text.length+2>50000){error.value='材料已接近5万字上限，请先精简后加入';return}
  draft.value.manuscript += `\n\n${note.text}`
  instrumentLibrary.value?.markAccepted(note)
  status.value='仪器记录已加入本页材料草稿，请点击保存项目；尚未上传或发送给 AI'
}
const formatted = (value) => value ? new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const fail = (e) => { error.value = e.response?.data?.message || e.response?.data?.detail || '暂时无法连接项目服务。你的当前草稿仍在此页，请导出备份后重试'; status.value = '' }
const mayLeave = () => !(dirty.value||instrumentLibrary.value?.hasPending) || window.confirm(instrumentLibrary.value?.hasPending ? '还有仪器记录未加入项目材料，离开会清除这些记录及本页未保存修改。继续？' : recoveryState.value.enabled ? '当前修改尚未保存到账号，仅有30分钟临时副本。确认离开？' : '当前修改还没有保存。离开会丢失本页草稿，是否离开？')
onBeforeRouteLeave(() => (!busy.value || recoveryNavigation) && mayLeave())
onBeforeRouteUpdate(to => (syncingSavedRoute && to.path === syncingSavedRoute) || ((!busy.value || recoveryNavigation) && mayLeave()))
function beforeUnload(event) { if (busy.value || instrumentLibrary.value?.hasPending || (dirty.value && !recovery.hasCurrent())) { event.preventDefault(); event.returnValue = '' } }
window.addEventListener('beforeunload', beforeUnload)
onBeforeUnmount(() => { disposed = true; openSequence++; directoryRead.dispose(); window.removeEventListener('beforeunload', beforeUnload) })
function accept(project) {
  comparison.value = null
  current.value = project
  draft.value = clone(project.content)
  draft.value.deadline ||= ''
  draft.value.dataSheet ||= emptyDataSheet()
  draft.value.reviewFeedback ||= []
  archived.value = project.archived
  saved.value = stamp()
  editing.value = true
}
const directoryRead = createLatestRequest({
  load: options => api.listProjects(options),
  onStart: () => { loading.value = true; listError.value = '' },
  onSuccess: list => { projects.value = list },
  onError: () => { listError.value = '目录暂时无法读取，请重试刷新目录；当前编辑内容不受影响' },
  onFinish: () => { loading.value = false },
})
function refreshList() { if (!disposed) return directoryRead.run() }
async function openProject(id) {
  instrumentEpoch.value++
  // A retained draft must be offered before a new editor can replace the single local slot.
  pendingDraft.value = projectFormRecovery.recovery.snapshot()?.entries[0] ?? null
  importer.value?.close()
  comparison.value = null
  const sequence = ++openSequence
  error.value = ''; status.value = ''; reviewed.value = null; versions.value = []; section.value = 'requirements'
  feedbackIssue.value = null; reviewDigest.value = ''; previousIssueCount.value = null
  if (!id) {
    current.value = null; draft.value = emptyProject(); draft.value.track = nextTrack.value
    archived.value = false; createId.value = crypto.randomUUID(); editing.value = true; saved.value = stamp()
    return
  }
  busy.value = true; editing.value = false
  try {
    const project = await api.getProject(id)
    if (sequence === openSequence && route.params.id === id) accept(project)
  } catch (e) { if (sequence === openSequence) fail(e) }
  finally { if (sequence === openSequence) busy.value = false }
}
watch(() => route.params.id, id => {
  if (recoveryNavigation) return
  // The create response is already authoritative; synchronizing its URL must not start another load.
  if (editing.value && current.value?.id === id) return
  openProject(id)
})
onMounted(() => {
  // Directory loading must never trigger a late editor reload over a new draft.
  refreshList()
  if (route.params.id) openProject(route.params.id)
})
async function beginProject(track = 'business') {
  if (busy.value) return
  nextTrack.value = track
  if (route.params.id) await router.push('/projects')
  else if (mayLeave()) await openProject(null)
}
async function persist() {
  if (busy.value || disposed) return
  const sequence = openSequence
  error.value = validateProject(draft.value)
  if (error.value) return
  busy.value = true; status.value = ''
  const content = clone(draft.value)
  content.title = content.title.trim(); content.deadline ||= null
  try {
    const project = current.value
      ? await api.saveProject(current.value.id, current.value.revision, content, archived.value)
      : await api.createProject(createId.value, content)
    if (disposed || sequence !== openSequence) return
    directoryRead.cancel()
    accept(project)
    // Only this editor's acknowledged draft may be cleared; leave an unrelated recovery offer alone.
    recovery.save()
    recoveryNotice.value = ''
    status.value = `已保存为 v${project.revision}`
    projects.value = [project, ...projects.value.filter(p => p.id !== project.id)].map(p => p.content ? { ...p, title: p.content.title, track: p.content.track } : p)
    void refreshList()
    // Unlock navigation only after the server has acknowledged this snapshot.
    busy.value = false
    if (route.params.id !== project.id) {
      syncingSavedRoute = `/projects/${project.id}`
      try { await router.replace(syncingSavedRoute) } finally { syncingSavedRoute = '' }
    }
    if (section.value === 'versions') await loadVersions()
  } catch (e) { if (!disposed && sequence === openSequence) fail(e) }
  finally { if (!disposed && sequence === openSequence) busy.value = false }
}
async function restoreDraft(asCopy = false) {
  if (busy.value || dirty.value || instrumentLibrary.value?.hasPending) { recoveryNotice.value = '先保存或保留当前修改及仪器记录，再恢复暂存；不会覆盖你正在填写的内容'; return }
  const entry = recovery.peek()
  if (!entry) return
  const sequence = ++openSequence
  busy.value = true; error.value = ''
  try {
    const remote = entry.projectId && !asCopy ? await api.getProject(entry.projectId) : null
    if (disposed || sequence !== openSequence || !recovery.peek()) return
    if (!asCopy && projectRecoveryConflict(entry,remote)) {
      recoveryNotice.value = '服务器已有不同版本，未覆盖。可将暂存恢复为新项目，与原版本分别保留'
      return
    }
    recoveryNavigation = true
    const destination = remote ? `/projects/${remote.id}` : '/projects'
    if (route.path !== destination) await router.push(destination)
    if (disposed || sequence !== openSequence || !recovery.peek()) return
    if (remote) accept(remote)
    else { current.value = null; draft.value = emptyProject(); archived.value = false; saved.value = stamp(); editing.value = true }
    draft.value = clone(entry.content); draft.value.dataSheet ||= emptyDataSheet()
    archived.value = asCopy ? false : entry.archived
    createId.value = asCopy ? crypto.randomUUID() : entry.id
    reviewed.value = null; comparison.value = null; section.value = 'requirements'
    recovery.restored()
    status.value = asCopy ? '已恢复为新项目草稿，原项目未修改，请检查后保存' : '已恢复未保存的修改，请检查后保存版本'
  } catch (e) { if (!disposed) { fail(e); recoveryNotice.value = '无法读取原项目，暂存仍保留；可恢复为新项目再核对' } }
  finally { if (!disposed && sequence === openSequence) busy.value = false; recoveryNavigation = false }
}
function addRequirement(title = '') {
  if (draft.value.requirements.length >= 80) { error.value = '每个项目最多80条要求'; return }
  draft.value.requirements.push(newRequirement(title))
}
function organize() {
  const candidates = splitBrief(draft.value.brief)
  const existing = new Set(draft.value.requirements.filter(r => r.sourceLine).map(r => `${r.sourceLine}:${r.sourceQuote}`))
  const fresh = candidates.filter(r => !existing.has(`${r.sourceLine}:${r.sourceQuote}`))
  if (!fresh.length) { status.value = '没有新的非空原文行可加入'; return }
  if (fresh.length + draft.value.requirements.length > 80) { error.value = '拆分后超过80条，请先精简任务书。原文与现有清单均未改动'; return }
  draft.value.requirements.push(...fresh)
  status.value = `已按非空行整理 ${fresh.length} 条候选要求，请逐条编辑并确认；这不是AI分析`
}
async function runCheck() {
  if (reviewing.value) return
  const sequence = openSequence, snapshot = clone(draft.value)
  reviewing.value = true; feedbackIssue.value = null; error.value = ''
  section.value = 'review'
  try {
    const digest = await reviewFingerprint(snapshot)
    if (sequence !== openSequence) return
    previousIssueCount.value = reviewed.value?.issues.length ?? null
    reviewed.value = inspectProject(snapshot)
    reviewedContent.value = reviewInput(snapshot)
    reviewDigest.value = digest
  } catch { error.value = '无法生成检查快照，请使用 HTTPS 或本机开发地址；草稿未改变' }
  finally { reviewing.value = false }
}
function beginFeedback(issue) {
  feedbackIssue.value = issue
  feedbackReason.value = draft.value.reviewFeedback?.find(row => row.issueKey === issue.key)?.reason || ''
}
function saveFeedback() {
  if (reviewStale.value || !feedbackIssue.value) return
  try {
    draft.value.reviewFeedback = recordReviewFeedback(draft.value.reviewFeedback, feedbackIssue.value, reviewDigest.value, feedbackReason.value)
    feedbackIssue.value = null; error.value = ''; status.value = '复核理由已记入草稿，保存项目后保留；检查结论未被修改'
  } catch (e) { error.value = e.message }
}
async function locate(issue) {
  section.value = issue.section
  await nextTick()
  const element = document.getElementById(issue.index === undefined ? `project-${issue.key}` : `requirement-${issue.index}`)
  element?.scrollIntoView({ behavior: 'auto', block: 'center' })
  element?.focus({ preventScroll: true })
}
async function loadVersions() {
  if (!current.value) return
  const id = current.value.id
  versionsLoading.value = true
  try { const result = await api.listVersions(id); if (current.value?.id === id) versions.value = result } catch (e) { if (current.value?.id === id) fail(e) }
  finally { versionsLoading.value = false }
}
function selectSection(id) { section.value = id; if (id === 'versions') loadVersions() }
async function followNextAction() {
  const action = nextAction.value
  section.value = action.section
  if (action.action === 'organize') organize()
  if (action.action === 'review') { runCheck(); return }
  if (action.requirementId) evidenceTarget.value = action.requirementId
  await nextTick()
  const target = document.getElementById(action.target || 'project-requirements')
  target?.scrollIntoView({ behavior: 'auto', block: 'center' }); target?.focus({ preventScroll: true })
}
function captureSelection(event) {
  const input = event.target
  selection.value = evidenceSelection(draft.value.manuscript, input.selectionStart, input.selectionEnd)
  if (!evidenceTarget.value) evidenceTarget.value = draft.value.requirements.find(r => !evidenceLine(r, draft.value.manuscript))?.id || draft.value.requirements[0]?.id || ''
}
function attachSelection() {
  if (!selectionStillValid(draft.value.manuscript, selection.value)) { selection.value = null; status.value = '原文已变化，请重新选中对应段落'; return }
  const requirement = draft.value.requirements.find(r => r.id === evidenceTarget.value)
  if (!requirement) { status.value = '先选择要关联的要求'; return }
  if (requirement.evidence && requirement.evidence !== selection.value.quote && !window.confirm('这条要求已有证据，是否替换为刚选中的原文？')) return
  requirement.evidence = selection.value.quote
  status.value = '已关联原文。请核对下面的完成状态，不会自动替你勾选完成'
  selection.value = null
}
async function restore(version) {
  if (!mayLeave()) return
  busy.value = true
  try {
    draft.value = await api.getVersion(current.value.id, version)
    draft.value.deadline ||= ''
    draft.value.dataSheet ||= emptyDataSheet()
    draft.value.reviewFeedback ||= []
    feedbackIssue.value = null; reviewDigest.value = ''; previousIssueCount.value = null
    section.value = 'requirements'; reviewed.value = null
    status.value = `已将 v${version} 载入草稿。点击保存将创建新版本，不覆盖历史`
  } catch (e) { fail(e) } finally { busy.value = false }
}
async function compareVersion(revision) {
  busy.value = true; error.value = ''
  try { comparison.value = { revision, content: await api.getVersion(current.value.id, revision) } }
  catch (e) { fail(e) }
  finally { busy.value = false }
}
function downloadDefense() {
  const url = URL.createObjectURL(new Blob([defenseMarkdown(draft.value)], { type:'text/markdown;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = 'campthink-defense.md'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  status.value = '已导出练习提纲、材料证据与本人说明'
}
function download() {
  const content = projectMarkdown(draft.value, current.value ? `v${current.value.revision}${dirty.value ? ' + 未保存草稿' : ''}` : '')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'campthink-project.md'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  status.value = '已导出当前材料、清单与检查说明'
}
function requestImport(target) { importer.value?.open(target) }
function applyAttachment({target,text,source}) {
  if (busy.value) return
  const previous = target === 'dataSheet' ? draft.value.dataSheet?.csv : draft.value[target]
  if (previous && !window.confirm(target === 'dataSheet' ? '导入将替换数据表，并重置原有误差与公式设置。是否继续？可取消并先保存旧版本。' : '导入将替换此文本框的内容，是否替换？可取消并先保存旧版本。')) return
  if (target === 'dataSheet') draft.value.dataSheet = {...emptyDataSheet(),csv:text,source}
  else draft.value[target] = text
  importer.value?.close(); status.value = '已读入本页草稿，保存项目后才上传提取文字'; error.value = ''
}
function useTaskTemplate() {
  if ((draft.value.brief || draft.value.requirements.length) && !window.confirm('使用通用练习会替换任务要求与清单，保留材料正文。是否继续？请先保存需要保留的版本。')) return
  const template = taskTemplate.value
  if (!draft.value.title) draft.value.title = template.title
  draft.value.brief = `通用练习，非学校任务书或评分标准\n参考：${template.source}${template.url ? ` ${template.url}` : ''}\n\n${template.brief}`
  draft.value.requirements = template.brief.split('\n').map(title => newRequirement(title))
  status.value = '已加入通用建议，请逐项调整并确认；没有生成实验数据或成品报告'
}
async function deleteCurrent() {
  if (!window.confirm('将永久删除这个项目及全部保存版本。建议先导出备份，确定删除？')) return
  const id = current.value.id
  busy.value = true
  try {
    await api.removeProject(id, current.value.revision)
    if (disposed || current.value?.id !== id) return
    directoryRead.cancel()
    projects.value = projects.value.filter(p => p.id !== id)
    void refreshList()
    if (projectFormRecovery.recovery.snapshot()?.entries[0]?.projectId === id) {
      projectFormRecovery.recovery.save([],null); pendingDraft.value = null
    }
    saved.value = stamp(); busy.value = false
    await router.replace('/projects'); editing.value = false
  } catch (e) { fail(e) } finally { busy.value = false }
}
</script>

<template>
  <div class="project-studio">
    <header class="studio-header">
      <RouterLink to="/chat" class="studio-brand"><CampMark /><span>Campthink.</span></RouterLink>
      <nav aria-label="工作台导航"><RouterLink to="/chat">问答助手</RouterLink><RouterLink to="/projects" aria-current="page">我的项目</RouterLink><RouterLink to="/reviews">收到的审阅</RouterLink><RouterLink to="/canteens">食堂评分</RouterLink><RouterLink v-if="isAdmin" to="/admin">管理后台</RouterLink></nav>
    </header>
    <div class="studio-layout">
      <aside class="studio-directory" aria-label="项目目录">
        <div class="directory-heading"><h1>我的项目</h1><button class="icon-button" :disabled="busy" aria-label="创建新项目" @click="beginProject()"><Plus /></button></div>
        <p class="directory-intro">任务、材料和版本，一起保存。</p>
        <label class="archive-filter"><input v-model="showArchived" type="checkbox" />显示已归档</label>
        <button class="directory-refresh" :disabled="loading || busy" @click="refreshList">刷新目录</button>
        <div v-if="loading" class="studio-skeleton" role="status" aria-label="正在加载项目"></div>
        <p v-else-if="listError" class="directory-error" role="alert">{{ listError }}</p>
        <p v-else-if="!visibleProjects.length" class="directory-empty">{{ projects.length ? '没有进行中的项目' : '创建一个项目，把任务书和材料留在一起' }}</p>
        <div class="project-list">
          <RouterLink v-for="project in visibleProjects" :key="project.id" :to="`/projects/${project.id}`" :class="{selected: route.params.id === project.id}" :aria-current="route.params.id === project.id ? 'page' : undefined">
            <FolderOpened /><span><strong>{{ project.title }}</strong><small>{{ project.archived ? '已归档' : trackName(project.track) }} · v{{ project.revision }}</small></span>
          </RouterLink>
        </div>
        <select class="mobile-project-picker" aria-label="选择已有项目" :value="route.params.id || ''" :disabled="busy" @change="router.push($event.target.value ? `/projects/${$event.target.value}` : '/projects')">
          <option value="">新项目</option><option v-for="project in visibleProjects" :key="project.id" :value="project.id">{{ project.title }}{{ project.archived ? '（归档）' : '' }}</option>
        </select>
        <div class="directory-foot"><DocumentChecked /><p>基础整理与缺项检查免费<br /><span>不调用AI，不消耗 Token</span></p></div>
      </aside>
      <main class="studio-main" :aria-busy="busy">
        <FormDraftRecovery :state="recoveryState" :pending="Boolean(pendingDraft)" :busy="busy" :enabled-allowed="editing" scope="项目" :notice="recoveryNotice" @toggle="recovery.toggle" @restore="restoreDraft()" @discard="recovery.discard">
          <button v-if="pendingDraft?.projectId" type="button" :disabled="busy" @click="restoreDraft(true)">恢复为新项目</button>
        </FormDraftRecovery>
        <div v-if="error" class="studio-error" role="alert"><p>{{ error }}</p><button v-if="!editing" :disabled="busy" @click="route.params.id ? openProject(route.params.id) : refreshList()">重试加载</button><template v-else><button @click="download">导出当前草稿</button><button v-if="current" :disabled="busy" @click="mayLeave() && openProject(current.id)">重新加载已保存版本</button></template></div>
        <p class="studio-status" role="status" aria-live="polite">{{ status }}</p>
        <section v-if="!editing && !busy" class="studio-start">
          <h2>开始一个项目</h2>
          <p>选一个方向，放入任务要求和已有材料。</p>
          <div class="starter-flow"><span><DocumentChecked />确认要求</span><ArrowRight /><span><FolderOpened />关联材料</span><ArrowRight /><span><Check />检查缺项</span></div>
          <h3>从你的任务开始</h3>
          <button v-for="track in tracks" :key="track.id" class="project-template" @click="beginProject(track.id)"><span><strong>{{ track.name }}</strong><small>{{ track.description }}</small></span><ArrowRight /></button>
          <p class="studio-boundary">按需检查缺项或数据，不代写、不编造结果。</p>
        </section>
        <div v-else-if="busy && !editing" class="studio-skeleton editor-skeleton" role="status" aria-label="正在打开项目"></div>
        <template v-else-if="editing">
          <div class="studio-toolbar"><div><strong>{{ current ? `v${current.revision}` : '新项目' }}</strong><span>{{ dirty ? '有未保存修改' : current ? `已保存 · ${formatted(current.updatedAt)}` : '填写后保存到账户' }}</span></div><div class="studio-actions"><button :disabled="busy" @click="download"><Download />导出</button><button class="primary" :disabled="busy || (current && !dirty)" @click="persist">{{ busy ? '处理中…' : '保存版本' }}</button></div></div>
          <fieldset class="project-meta" :disabled="busy">
            <label class="title-field">项目名称<input id="project-title" v-model="draft.title" maxlength="100" :placeholder="hints.title" aria-label="项目名称" /></label>
            <label>任务方向<select v-model="draft.track"><option v-for="track in tracks" :key="track.id" :value="track.id">{{ track.name }}</option></select></label>
            <label>截止日期（选填）<DateField v-model="draft.deadline"  :disabled="busy" /></label>
          </fieldset>
          <div class="studio-next-action"><div><strong>下一步：{{ nextAction.label }}</strong><p>{{ nextAction.detail }}</p></div><button :disabled="busy" @click="followNextAction">{{ nextAction.label }}<ArrowRight /></button></div>
          <nav class="studio-tabs" aria-label="项目步骤"><button v-for="tab in tabs" :key="tab.id" :aria-current="section === tab.id ? 'step' : undefined" :class="{active: section === tab.id}" :disabled="busy" @click="selectSection(tab.id)">{{ tab.label }}</button></nav>
          <AttachmentImportPanel ref="importer" @apply="applyAttachment" />
          <fieldset class="studio-editor" :disabled="busy">
            <section v-if="section === 'requirements'" class="requirements-section">
              <div class="section-heading"><div><h2>任务要求</h2></div></div>
              <label class="text-label" for="project-brief">粘贴任务原文</label><p id="brief-help" class="studio-field-help">一行一项，再点“按行整理要求”核对。示例不是学校标准。</p><textarea id="project-brief" v-model="draft.brief" rows="6" maxlength="20000" :placeholder="hints.brief" aria-describedby="brief-help"></textarea>
              <div class="field-actions"><span>{{ draft.brief.length }} / 20,000 字</span><button @click="requestImport('brief')">导入任务附件</button><button :disabled="!draft.brief.trim()" @click="organize">按行整理要求</button></div>
              <details class="template-suggestions"><summary>还没有任务书？从通用练习开始</summary><p>原创练习模板，不是本校课程要求或评分标准；使用后需要逐项修改和确认</p><p v-if="taskTemplate.url">公开教学参考：<a :href="taskTemplate.url" target="_blank" rel="noopener noreferrer">{{ taskTemplate.source }}</a></p><pre class="template-preview">{{ taskTemplate.brief }}</pre><button @click="useTaskTemplate">使用这份通用练习</button></details>
              <div class="requirements-heading"><h3 id="project-requirements" tabindex="-1">要求清单 <span>{{ draft.requirements.length }} / 80</span></h3><button @click="addRequirement()"><Plus />补充要求</button></div>
              <p v-if="!draft.requirements.length" class="inline-empty">从原文整理要求，或添加自己的检查项。每项都需要你确认。</p>
              <article v-for="(item, index) in draft.requirements" :key="item.id" class="requirement-row">
                <div class="requirement-number">{{ index + 1 }}</div><div class="requirement-body">
                  <label :for="`requirement-${index}`">要求内容<input :id="`requirement-${index}`" v-model="item.title" maxlength="300" @input="item.confirmed = false" /></label>
                  <p class="source-note" :class="{invalid: !sourceValid(item, draft.brief)}">{{ item.sourceLine ? `任务书第 ${item.sourceLine} 行` : '本人补充要求 · 非学校标准' }}{{ !sourceValid(item, draft.brief) ? ' · 原文已变化，请重新整理' : '' }}</p>
                  <blockquote v-if="item.sourceQuote">{{ item.sourceQuote }}</blockquote>
                  <div class="requirement-toggles"><label><input v-model="item.confirmed" type="checkbox" :disabled="!item.title.trim() || !sourceValid(item, draft.brief)" />我已核对这条要求</label><label><input v-model="item.done" type="checkbox" />已完成材料</label></div>
                  <details><summary>证据与备注{{ item.evidence ? ' · 已填写' : '' }}</summary><label>粘贴材料中的原文片段<textarea v-model="item.evidence" maxlength="2000" rows="2" placeholder="须与材料页中的文本一致，不是自行填写的完成声明"></textarea></label><p class="source-note">{{ evidenceLine(item, draft.manuscript) ? `已定位：材料第 ${evidenceLine(item, draft.manuscript)} 行（仅文本匹配）` : '尚未在当前材料中定位' }}</p><label>备注<input v-model="item.note" maxlength="1000" placeholder="例如：等待小组成员核对原始数据" /></label></details>
                </div><button class="icon-button remove-requirement" :aria-label="`移除要求 ${index + 1}`" @click="draft.requirements.splice(index, 1)"><Delete /></button>
              </article>
              <details class="template-suggestions"><summary>{{ currentTrack.name }}：可参考的检查方向</summary><p>以下是通用建议，只有加入并经你确认才进入清单，不代表课程要求</p><button v-for="prompt in currentTrack.prompts" :key="prompt" :disabled="draft.requirements.some(r => r.title === prompt)" @click="addRequirement(prompt)"><Plus />{{ prompt }}</button></details>
              <div class="section-next"><button @click="section = 'materials'">下一步：准备材料<ArrowRight /></button></div>
            </section>
            <section v-else-if="section === 'materials'">
              <div class="section-heading"><div><h2>材料和要求，对得上才放心</h2><p>支持 PDF、Word 正文与 Excel 单元格提取；图片、扫描文字和表格公式不会被当作已验证内容</p></div></div>
              <label class="text-label" for="project-manuscript">你已经做了什么？粘贴现有正文</label><p id="material-help" class="studio-field-help">放入你自己写好的内容，再用鼠标或长按选中对应段落，即可关联到某条要求，不用来回复制粘贴。</p><textarea id="project-manuscript" v-model="draft.manuscript" class="material-editor" rows="12" maxlength="50000" :placeholder="hints.material" aria-describedby="material-help" @select="captureSelection" @keyup="captureSelection" @mouseup="captureSelection" @input="selection = null"></textarea>
              <div v-if="draft.requirements.length" class="selection-assistant"><strong>{{ selection ? `已选中 ${selection.quote.length} 字` : '选中一段正文，直接关联证据' }}</strong><p v-if="!selection">每段最多2000字。这里只关联原文，不替你判断是否满足要求。</p><blockquote v-else>{{ selection.quote }}</blockquote><label>这段内容对应哪条要求？<select v-model="evidenceTarget"><option value="">选择要求</option><option v-for="(item, i) in draft.requirements" :key="item.id" :value="item.id">{{ i + 1 }}. {{ item.title || '未命名要求' }}</option></select></label><button :disabled="!selection || !evidenceTarget" @click="attachSelection">关联选中原文</button></div>
              <div class="field-actions"><span>{{ draft.manuscript.length }} / 50,000 字</span><button @click="requestImport('manuscript')">导入材料附件</button></div>
              <p class="studio-boundary">导入在浏览器中读取；点击保存后，文本上传至你的私有项目。此功能不向模型发送材料，不进入公共知识库。</p>
              <div class="evidence-list"><h3>核对证据，再确认完成</h3><p v-if="!draft.requirements.length">先到任务要求页整理检查清单</p><div v-for="(item, index) in draft.requirements" :key="item.id" class="evidence-item"><label><span>{{ index + 1 }}. {{ item.title || '未命名要求' }}</span><textarea v-model="item.evidence" rows="2" maxlength="2000" placeholder="选中上方正文来关联，或直接粘贴原文片段"></textarea><small>{{ evidenceLine(item, draft.manuscript) ? `材料第 ${evidenceLine(item, draft.manuscript)} 行 · 仅确认片段存在` : '未关联有效文本证据' }}</small></label><label class="evidence-done"><input v-model="item.done" type="checkbox" />我已完成这条要求对应的材料</label></div></div>
              <div class="section-next"><button class="primary" @click="runCheck"><DocumentChecked />检查提交缺项</button></div>
            </section>
            <ProjectDataPanel v-else-if="section === 'data'" v-model="draft.dataSheet" @import="requestImport('dataSheet')" />
            <template v-else-if="section === 'instruments'"></template>
            <section v-else-if="section === 'collaboration'"><ProjectReviewPanel v-if="current" :key="current.id" :project="current" :dirty="dirty" /><p v-else class="inline-empty">先保存项目，再选择已保存版本和分享范围，邀请同校伙伴审阅</p></section>
            <section v-else-if="section === 'review'">
              <div class="section-heading"><div><h2>提交前，再对一遍</h2><p>找清单缺项、确认遗漏、失效证据；不作专业评分或通过保证</p></div><button class="primary" :disabled="reviewing" @click="runCheck">{{ reviewing ? '正在检查' : reviewed ? '重新检查' : '开始检查' }}</button></div>
              <div v-if="!reviewed" class="review-empty"><DocumentChecked /><h3>检查你的当前草稿</h3><p>按本人确认的要求检查材料是否齐全，不调用模型、不消耗 Token。未保存的内容也可以检查。</p></div>
              <template v-else>
                <p v-if="reviewStale" class="studio-warning" role="status">材料或要求已经修改，以下是旧结果，请重新检查</p>
                <div class="review-summary"><strong>{{ reviewed.covered }} / {{ reviewed.total }}</strong><p>条要求已确认、已标记完成且关联文本证据<small>{{ reviewed.issues.length ? `还有 ${reviewed.issues.length} 处需要处理` : '当前清单未发现缺项，仍需人工复核' }}</small></p></div>
                <p v-if="previousIssueCount !== null" class="data-help" role="status">上次检查 {{ previousIssueCount }} 处，本次 {{ reviewed.issues.length }} 处；数量变化不等于专业质量提升，仍需核对材料</p>
                <ol class="review-issues"><li v-for="issue in reviewed.issues" :key="issue.key"><span :class="issue.severity">{{ issue.severity === 'attention' ? '待核对' : '缺项' }}</span><div><strong>{{ issue.title }}</strong><p>{{ issue.detail }}</p><div class="issue-actions"><button :disabled="reviewStale" @click="locate(issue)">去处理<ArrowRight /></button><button :disabled="reviewStale" @click="beginFeedback(issue)">认为是误报？记录理由</button></div></div></li></ol>
                <form v-if="feedbackIssue" class="review-feedback-form" @submit.prevent="saveFeedback">
                  <label for="review-feedback-reason">复核：{{ feedbackIssue.title }}</label>
                  <p>写明为何认为不适用或属于误报，不会自动忽略问题或标记通过</p>
                  <textarea id="review-feedback-reason" v-model="feedbackReason" rows="3" maxlength="500" required placeholder="例如：这项成果为实物模型，文本证据不能完整反映，提交前请老师人工核对"></textarea>
                  <div class="issue-actions"><button class="primary" :disabled="reviewStale || !feedbackReason.trim()" type="submit">记入草稿</button><button type="button" @click="feedbackIssue = null">取消</button></div>
                </form>
              </template>
              <details v-if="draft.reviewFeedback?.length" class="data-details" open><summary>本人复核记录 · {{ draft.reviewFeedback.length }}条</summary><p class="data-help">随项目版本保存，不进入公共资料库、不修改规则结果；已消失的问题也保留记录供追溯</p><ul class="feedback-history"><li v-for="record in draft.reviewFeedback" :key="record.issueKey"><strong>{{ record.title }}</strong><p>{{ record.reason }}</p><small>{{ !reviewed || reviewStale ? '请先检查当前材料，确认记录是否仍适用' : record.fingerprint === reviewDigest ? '对应当前检查快照 · 仅本人意见' : '材料或规则已变化 · 旧理由需要重新核对' }}</small><button @click="draft.reviewFeedback = draft.reviewFeedback.filter(r => r !== record)">移除此记录</button></li></ul></details>
              <p class="studio-boundary">这不是完整质量体检。原文按行拆分可能遗漏隐含要求；证据存在不代表论证正确。CSV结构与相对误差请到“数据检查”运行；通用公式、引用核验、代码运行和图片分析尚未接入。</p>
            </section>
            <section v-else-if="section === 'defense'">
              <div class="section-heading"><div><h2>把做过的事，讲清楚</h2><p>从自己的要求清单生成练习提纲，不预测老师提问、不自动编造回答</p></div><button :disabled="!defense.length" @click="downloadDefense">导出准备稿<Download /></button></div>
              <p v-if="!defense.length" class="inline-empty">先在“任务要求”整理清单，再来准备成果说明</p>
              <p v-else class="studio-field-help">每条填写方法、个人贡献和局限即可。与要求备注共用，点击“保存版本”后保留；适用于学生答辩和教师项目汇报。</p>
              <article v-for="(prompt, i) in defense" :key="prompt.id" class="defense-item">
                <h3>{{ i + 1 }}. {{ prompt.title }}</h3><p>{{ prompt.question }}</p>
                <p v-if="!prompt.verified" class="studio-warning">任务要求尚未核对或来源已变化，请先确认</p>
                <details v-if="prompt.line"><summary>查看材料依据 · 第{{ prompt.line }}行</summary><blockquote>{{ prompt.evidence }}</blockquote></details>
                <p v-else class="studio-warning">尚未关联有效材料，不要把没有依据的描述作为成果</p>
                <label :for="`defense-${i}`">你的说明（与该要求备注同步）</label><textarea :id="`defense-${i}`" v-model="draft.requirements[i].note" rows="4" maxlength="1000" placeholder="我做了什么 → 为什么这样做 → 材料依据 → 局限或下一步"></textarea>
              </article>
            </section>
            <section v-else>
              <div class="section-heading"><div><h2>修改有来路，也能回头看</h2><p>保留最近50个保存版本。载入旧版后需要再次保存，才会形成新版本</p></div></div>
              <p v-if="!current" class="inline-empty">先保存项目，再开始记录版本</p><p v-else-if="versionsLoading" role="status">正在加载历史版本…</p>
              <ol class="version-list"><li v-for="version in versions" :key="version.revision"><Clock /><strong>v{{ version.revision }}</strong><span>{{ formatted(version.createdAt) }}</span><button @click="compareVersion(version.revision)">对比当前草稿</button><button @click="restore(version.revision)">载入草稿</button></li></ol>
              <div v-if="comparison" class="version-comparison" aria-live="polite"><h3>v{{ comparison.revision }} → 当前草稿</h3><p>{{ changes.length ? `${changes.length} 个部分发生变化，展开查看原文；只对比文本，不判断哪版更好` : '内容一致，没有文本变化' }}</p><details v-for="change in changes" :key="change.label"><summary>{{ change.label }}</summary><div class="comparison-columns"><div><h4>历史版本</h4><pre>{{ change.before }}</pre></div><div><h4>当前草稿</h4><pre>{{ change.after }}</pre></div></div></details></div>
              <label v-if="current" class="archive-filter"><input v-model="archived" type="checkbox" />归档此项目（保存后生效，可随时取消）</label>
              <div v-if="current" class="project-danger"><p>删除会永久移除项目及历史版本，请先导出备份</p><button @click="deleteCurrent">删除项目</button></div>
            </section>
            <InstrumentLibrary v-show="section === 'instruments'" :key="instrumentEpoch" ref="instrumentLibrary" embedded :saving="busy" @append="appendInstrument" />
          </fieldset>
        </template>
      </main>
    </div>
  </div>
</template>
