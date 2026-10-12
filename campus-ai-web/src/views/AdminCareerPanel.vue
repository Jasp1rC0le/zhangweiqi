<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, toRefs, watch } from 'vue'
import * as api from '@/api/admin'
import { userSessionGeneration } from '@/api/http'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { createAdminCatalogScope, createAdminCatalogState, catalogId, sameCatalogEntry, validCatalogList } from '@/utils/adminCatalogScope'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { safeExternalUrl } from '@/utils/safeMarkdown'

const auth = useAdminAuthStore()
const owner = computed(() => auth.isLoggedIn && auth.user?.schoolId
  ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const collections = ['employers', 'jobs', 'candidates']
const state = reactive(createAdminCatalogState(collections))
const { employers, jobs, candidates, loading, busy, error, success, needsReload } = toRefs(state)
const employerId = ref(null), candidateId = ref(null), jobId = ref(null)
const candidateKeyword = ref('')
const employer = reactive({ name: '', industry: '', websiteUrl: '', description: '' })
const job = reactive({ employerId: '', title: '', employmentType: '', location: '', sourceUrl: '', description: '', postedAt: '', expiresAt: '' })
const employerForm = ref(null), jobForm = ref(null)
const employerNames = computed(() => new Map(employers.value.map((item) => [item.id, item.name])))
let employerGeneration = 0, jobGeneration = 0, keywordGeneration = 0, catalog
const { confirming, confirm } = useScopedConfirmation(() => catalog?.key(), () => Boolean(owner.value))
const locked = computed(() => loading.value || busy.value || confirming.value || !owner.value)
const writeLocked = computed(() => locked.value || needsReload.value)
function resetEmployer() {
  employerId.value = null
  candidateId.value = null
  Object.assign(employer, { name: '', industry: '', websiteUrl: '', description: '' })
}
function resetJob() {
  jobId.value = null
  Object.assign(job, { employerId: '', title: '', employmentType: '', location: '', sourceUrl: '', description: '', postedAt: '', expiresAt: '' })
}
const validStatus = (item) => ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(item.status)
const validCandidate = (item) => typeof item.candidateName === 'string'
  && typeof item.sourceUrl === 'string' && item.status === 'PENDING'
catalog = createAdminCatalogScope({
  owner: () => owner.value, state, collections,
  read: async (options) => {
    const [employers, jobs, candidates] = await Promise.all([
      api.getCareerEmployers(options), api.getCareerJobs(options), api.getEmployerCandidates('PENDING', options),
    ])
    return { employers, jobs, candidates }
  },
  validate: (data) => data && validCatalogList(data.employers, (item) => typeof item.name === 'string' && validStatus(item))
    && validCatalogList(data.jobs, (item) => catalogId(item.employerId) && typeof item.title === 'string' && validStatus(item))
    && validCatalogList(data.candidates, validCandidate),
  onReset: () => { resetEmployer(); resetJob(); candidateKeyword.value = '' },
})
watch(owner, () => catalog.reset(), { flush: 'sync' })
watch(() => [employerId.value, candidateId.value, ...Object.values(employer)], () => { employerGeneration++ }, { flush: 'sync' })
watch(() => [jobId.value, ...Object.values(job)], () => { jobGeneration++ }, { flush: 'sync' })
watch(candidateKeyword, () => { keywordGeneration++ }, { flush: 'sync' })
onMounted(() => catalog.load())
onBeforeUnmount(() => catalog.dispose())
const reload = () => catalog.load()
function revealForm(form) {
  const key = catalog.key()
  nextTick(() => {
    if (key && key === catalog.key() && owner.value) form.value?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center',
    })
  })
}
function editEmployer(item) {
  if (locked.value) return
  employerId.value = item.id
  candidateId.value = null
  Object.assign(employer, { name: item.name, industry: item.industry || '', websiteUrl: item.websiteUrl || '', description: item.description || '' })
  revealForm(employerForm)
}
async function submitEmployer() {
  if (writeLocked.value || !employer.name.trim() || employer.name.trim().length > 200 || employer.industry.length > 100
    || employer.websiteUrl.length > 1000 || employer.description.length > 5000) return
  const id = employerId.value, candidate = candidateId.value, generation = employerGeneration
  const payload = Object.freeze({ ...employer, name: employer.name.trim() })
  const snapshot = candidate ? Object.freeze({ ...candidates.value.find((item) => item.id === candidate) }) : null
  return catalog.run({
    targetCurrent: () => generation === employerGeneration && (!candidate || sameCatalogEntry(candidates.value, snapshot)),
    execute: (signal) => candidate ? api.importEmployerCandidate(candidate, payload, { signal })
      : api.saveCareerEmployer(payload, id, { signal }),
    committed: () => { if (generation === employerGeneration) resetEmployer() },
    success: '企业资料已保存为草稿，核实后再发布。',
  })
}
async function discoverCandidates() {
  if (writeLocked.value || candidateKeyword.value.trim().length > 120) return
  const keyword = candidateKeyword.value.trim(), generation = keywordGeneration
  return catalog.run({
    confirm: () => confirm('搜索会发起联网请求并增加待核验线索，不会直接公开企业。只提交行业或方向，不要填写个人信息。',
      { title: '搜索企业线索', confirmText: '开始搜索', cancelText: '取消，保留方向' }),
    targetCurrent: () => generation === keywordGeneration,
    execute: (signal) => api.discoverEmployerCandidates(keyword, { signal }),
    committed: (result) => { if (!validCatalogList(result, validCandidate)) throw new Error('Invalid discovery result') },
    success: '搜索请求已完成，请逐条核验更新后的线索；结果不会自动公开。',
  })
}
function prepareCandidate(item) {
  if (locked.value) return
  candidateId.value = item.id
  employerId.value = null
  Object.assign(employer, { name: item.candidateName || '', industry: '', websiteUrl: item.sourceUrl || '', description: item.sourceSummary || '' })
  revealForm(employerForm)
}
async function rejectCandidate(item) {
  if (writeLocked.value) return
  const snapshot = Object.freeze({ ...item })
  return catalog.run({
    confirm: () => confirm(`确认忽略“${snapshot.candidateName}”？该线索不会进入公开企业库。`,
      { title: '忽略企业线索', confirmText: '确认忽略', cancelText: '取消，保留线索' }),
    targetCurrent: () => sameCatalogEntry(candidates.value, snapshot),
    execute: (signal) => api.rejectEmployerCandidate(snapshot.id, { signal }),
    committed: () => { if (candidateId.value === snapshot.id) resetEmployer() },
    success: '已忽略线索。',
  })
}
function editJob(item) {
  if (locked.value) return
  jobId.value = item.id
  Object.assign(job, { employerId: item.employerId, title: item.title, employmentType: item.employmentType || '',
    location: item.location || '', sourceUrl: item.sourceUrl || '', description: item.description || '',
    postedAt: item.postedAt?.slice(0, 16) || '', expiresAt: item.expiresAt?.slice(0, 16) || '' })
  revealForm(jobForm)
}
async function submitJob() {
  if (writeLocked.value || !catalogId(Number(job.employerId)) || !job.title.trim() || !job.description.trim()
    || job.title.trim().length > 200 || job.description.trim().length > 10000 || job.employmentType.length > 50
    || job.location.length > 200 || job.sourceUrl.length > 1000) return
  const id = jobId.value, generation = jobGeneration
  const payload = Object.freeze({ ...job, employerId: Number(job.employerId), title: job.title.trim(),
    description: job.description.trim(), postedAt: job.postedAt || null, expiresAt: job.expiresAt || null })
  return catalog.run({
    targetCurrent: () => generation === jobGeneration && employers.value.some((item) => item.id === payload.employerId),
    execute: (signal) => api.saveCareerJob(payload, id, { signal }),
    committed: () => { if (generation === jobGeneration) resetJob() },
    success: '岗位已保存为草稿，核对企业、来源和有效期后再发布。',
  })
}
async function changeStatus(kind, item) {
  if (writeLocked.value || !['employer', 'job'].includes(kind)) return
  const snapshot = Object.freeze({ ...item }), published = item.status !== 'PUBLISHED'
  return catalog.run({
    confirm: () => confirm(published
      ? `确认发布“${snapshot.name || snapshot.title}”？发布后本校用户可见，请核对来源和有效期。`
      : `确认下架“${snapshot.name || snapshot.title}”？用户将不再看到这条资料。`,
    { title: published ? '确认发布' : '确认下架', confirmText: '确认', cancelText: '取消，保留状态' }),
    targetCurrent: () => sameCatalogEntry(kind === 'employer' ? employers.value : jobs.value, snapshot),
    execute: (signal) => kind === 'employer' ? api.setCareerEmployerPublished(snapshot.id, published, { signal })
      : api.setCareerJobPublished(snapshot.id, published, { signal }),
    success: published ? '已发布。' : '已下架。',
  })
}
</script>

<template>
  <section class="career-panel" aria-label="企业与招聘资料管理" :aria-busy="locked">
    <p v-if="!owner" role="alert">管理员身份已变化，请重新核验后打开管理。</p>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="busy" role="status">正在处理。离开页面不会撤销已提交的操作。</p>
    <div class="career-actions"><button type="button" :disabled="locked" @click="reload">刷新本校资料</button></div>
    <p v-if="error" class="career-error" role="alert">{{ error }} <button type="button" :disabled="locked" @click="reload">重试</button></p>
    <div class="candidate-panel" :aria-busy="locked">
      <div class="career-title">
        <div><h2>企业线索审核</h2></div>
        <small>{{ candidates.length }} 条待处理</small>
      </div>
      <p class="career-note">联网结果不会直接公开。官网或政府来源会标记为“官方来源”，仍须核对企业名称、官网和介绍后转为草稿。</p>
      <form class="candidate-search" @submit.prevent="discoverCandidates">
        <label for="candidate-keyword">补充方向</label>
        <input id="candidate-keyword" v-model="candidateKeyword" :disabled="locked" maxlength="120" placeholder="例如：软件、智能制造、实习" />
        <button type="submit" :disabled="writeLocked">{{ busy ? '处理中…' : '搜索新线索' }}</button>
      </form>
      <div v-if="candidates.length" class="candidate-list" aria-live="polite">
        <article v-for="item in candidates" :key="item.id" class="candidate-item">
          <div class="candidate-copy">
            <div class="candidate-meta"><span :class="['source-badge', { official: item.sourceQuality === 'OFFICIAL' }]">{{ item.sourceQuality === 'OFFICIAL' ? '官方来源' : '待核验来源' }}</span><span>{{ item.sourceDomain || '未知域名' }}</span></div>
            <strong>{{ item.candidateName }}</strong>
            <p>{{ item.sourceSummary || '该结果没有摘要，请打开原始链接核验。' }}</p>
            <a v-if="safeExternalUrl(item.sourceUrl)" :href="safeExternalUrl(item.sourceUrl)" target="_blank" rel="noopener noreferrer">查看原始页面</a>
          </div>
          <div class="career-actions"><button type="button" :disabled="writeLocked" @click="rejectCandidate(item)">忽略</button><button type="button" :disabled="writeLocked" @click="prepareCandidate(item)">核验并建档</button></div>
        </article>
      </div>
      <p v-else class="career-note">暂无待处理线索。可按专业或行业搜索，结果只进入审核队列。</p>
    </div>
    <div class="career-grid">
      <div class="career-column">
        <div class="career-title"><div><h2>合作企业</h2></div><small>{{ employers.length }} 家</small></div>
        <p class="career-note">企业单独存放，不与校园通知混成文章。编辑已发布资料会先退回草稿，核实后再发布。</p>
        <form ref="employerForm" class="career-form" @submit.prevent="submitEmployer">
          <h3>{{ employerId ? '编辑企业' : candidateId ? '核验企业线索' : '添加企业' }}</h3>
          <label>企业名称<input v-model="employer.name" :disabled="locked" maxlength="200" required /></label>
          <label>行业<input v-model="employer.industry" :disabled="locked" maxlength="100" /></label>
          <label>官网链接<input v-model="employer.websiteUrl" :disabled="locked" type="url" maxlength="1000" /></label>
          <label>企业介绍<textarea v-model="employer.description" :disabled="locked" maxlength="5000" rows="4"></textarea></label>
          <div class="career-actions"><button v-if="employerId || candidateId" type="button" :disabled="locked" @click="resetEmployer">取消</button><button type="submit" :disabled="writeLocked">{{ candidateId ? '确认并保存草稿' : '保存草稿' }}</button></div>
        </form>
        <p v-if="loading" class="career-note">正在读取企业资料…</p>
        <p v-else-if="!employers.length" class="career-note">还没有企业资料。</p>
        <article v-for="item in employers" :key="item.id" class="career-item">
          <div><strong>{{ item.name }}</strong><small>{{ item.industry || '行业未填写' }} · {{ item.status === 'PUBLISHED' ? '已发布' : '草稿/下架' }}</small></div>
          <div class="career-actions"><button type="button" :disabled="locked" @click="editEmployer(item)">编辑</button><button type="button" :disabled="writeLocked" @click="changeStatus('employer', item)">{{ item.status === 'PUBLISHED' ? '下架' : '发布' }}</button></div>
        </article>
      </div>
      <div class="career-column">
        <div class="career-title"><div><h2>招聘岗位</h2></div><small>{{ jobs.length }} 个</small></div>
        <p class="career-note">岗位关联企业，只有所属企业已发布且岗位未过期，才能发布岗位。</p>
        <form ref="jobForm" class="career-form" @submit.prevent="submitJob">
          <h3>{{ jobId ? '编辑岗位' : '添加岗位' }}</h3>
          <label>所属企业<select v-model="job.employerId" :disabled="locked" required><option value="">请选择企业</option><option v-for="item in employers" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
          <label>岗位名称<input v-model="job.title" :disabled="locked" maxlength="200" required /></label>
          <div class="career-form-row"><label>用工类型<input v-model="job.employmentType" :disabled="locked" maxlength="50" placeholder="实习 / 校招" /></label><label>工作地点<input v-model="job.location" :disabled="locked" maxlength="200" /></label></div>
          <label>招聘原始链接<input v-model="job.sourceUrl" :disabled="locked" type="url" maxlength="1000" /></label>
          <div class="career-form-row"><label>发布时间<input v-model="job.postedAt" :disabled="locked" type="datetime-local" /></label><label>截止时间<input v-model="job.expiresAt" :disabled="locked" type="datetime-local" /></label></div>
          <label>岗位说明<textarea v-model="job.description" :disabled="locked" maxlength="10000" rows="5" required></textarea></label>
          <div class="career-actions"><button v-if="jobId" type="button" :disabled="locked" @click="resetJob">取消</button><button type="submit" :disabled="writeLocked">保存草稿</button></div>
        </form>
        <p v-if="loading" class="career-note">正在读取岗位资料…</p>
        <p v-else-if="!jobs.length" class="career-note">还没有招聘岗位。</p>
        <article v-for="item in jobs" :key="item.id" class="career-item">
          <div><strong>{{ item.title }}</strong><small>{{ employerNames.get(item.employerId) || `企业 #${item.employerId}` }} · {{ item.status === 'PUBLISHED' ? '已发布' : '草稿/下架' }}</small></div>
          <div class="career-actions"><button type="button" :disabled="locked" @click="editJob(item)">编辑</button><button type="button" :disabled="writeLocked" @click="changeStatus('job', item)">{{ item.status === 'PUBLISHED' ? '下架' : '发布' }}</button></div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.career-panel { margin-top: 48px; }.career-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }.career-column,.candidate-panel { min-width: 0; padding: 26px; background: #fff; border: 1px solid #e6e8ec; border-radius: 22px; }.candidate-panel { margin-bottom: 16px; }
.career-title { display: flex; align-items: end; justify-content: space-between; gap: 10px; }.career-title span { color: #0071e3; font-size: 9px; font-weight: 750; letter-spacing: .15em; }.career-title h2 { margin: 8px 0 0; font-size: 25px; }.career-title small,.career-note { color: #777980; font-size: 12px; line-height: 1.7; }.career-note { margin: 14px 0 20px; }
.career-form { display: grid; gap: 12px; padding: 20px; background: #f6f8fb; border-radius: 16px; }.career-form h3 { margin: 0 0 4px; font-size: 16px; }.career-form label { display: block; min-width: 0; color: #555860; font-size: 12px; font-weight: 600; }.career-form input,.career-form select,.career-form textarea { box-sizing: border-box; display: block; width: 100%; margin-top: 7px; padding: 10px 12px; color: #1d1d1f; font: inherit; font-size: 13px; background: #fff; border: 1px solid #dce0e6; border-radius: 10px; }.career-form textarea { resize: vertical; }.career-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.career-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }.career-actions button,.career-error button { min-height: 44px; padding: 0 12px; color: #0069d4; font-size: 12px; font-weight: 650; background: #eaf3ff; border: 0; border-radius: 9px; cursor: pointer; }.career-form .career-actions button:last-child { color: #fff; background: #0071e3; }.career-actions button:disabled { opacity: .5; cursor: not-allowed; }.career-panel :focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }
.career-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 17px 2px; border-bottom: 1px solid #edeef0; }.career-item strong { display: block; font-size: 13px; }.career-item small { display: block; margin-top: 5px; color: #8a8c93; font-size: 11px; }.career-item .career-actions { flex: none; }.career-error { padding: 14px; color: #8b3c16; background: #fff3e8; border-radius: 12px; }
.candidate-search { display: grid; grid-template-columns: auto minmax(180px,1fr) auto; align-items: center; gap: 10px; }.candidate-search label { color: #62656c; font-size: 12px; font-weight: 650; }.candidate-search input { min-height: 44px; padding: 0 13px; font: inherit; font-size: 13px; border: 1px solid #dce0e6; border-radius: 10px; }.candidate-search button { min-height: 44px; padding: 0 16px; color: #fff; font-weight: 650; background: #0071e3; border: 0; border-radius: 10px; cursor: pointer; }.candidate-search button:disabled { opacity: .55; cursor: wait; }.candidate-list { margin-top: 20px; border-top: 1px solid #edeef0; }.candidate-item { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 18px; padding: 18px 0; border-bottom: 1px solid #edeef0; }.candidate-copy { min-width: 0; }.candidate-copy strong { display: block; margin-top: 8px; font-size: 14px; }.candidate-copy p { display: -webkit-box; overflow: hidden; margin: 8px 0; color: #666971; font-size: 12px; line-height: 1.65; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.candidate-copy a { color: #006bd6; font-size: 12px; text-decoration: none; }.candidate-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; color: #8a8c93; font-size: 11px; }.source-badge { padding: 4px 7px; color: #7b4b08; background: #fff3d6; border-radius: 999px; }.source-badge.official { color: #17663a; background: #e8f7ee; }
@media(max-width:900px) { .career-grid { grid-template-columns: 1fr; } } @media(max-width:540px) { .career-column,.candidate-panel { padding: 19px; }.career-form-row,.candidate-search { grid-template-columns: 1fr; }.career-item,.candidate-item { align-items: stretch; grid-template-columns: 1fr; flex-direction: column; }.career-item .career-actions,.candidate-item .career-actions { justify-content: flex-start; }.career-form input,.career-form select,.career-form textarea,.candidate-search input { font-size: 16px; } }
</style>
