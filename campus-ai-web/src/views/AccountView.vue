<script setup>
import { computed,nextTick,onBeforeUnmount,onMounted, reactive, ref,watch } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import http,{userSessionGeneration} from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import TokenActivityPanel from '@/components/TokenActivityPanel.vue'
import AccountIdentityPanel from '@/components/AccountIdentityPanel.vue'
import AccountCredentials from '@/components/AccountCredentials.vue'
import TeachingIdentityPanel from '@/components/TeachingIdentityPanel.vue'
import ProductUpdates from '@/components/ProductUpdates.vue'
import { wasRouteFailureHandled } from '@/utils/routeRecovery'
import { createDraftCheckpoint } from '@/utils/draftCheckpoint'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import {focusWorkflowElement} from '@/utils/teachingWorkflows'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { createAccountLifecycle } from '@/utils/accountLifecycle'
import { createLatestRequest } from '@/utils/latestRequest'

const router = useRouter()
const route=useRoute(),identityPanel=ref(),updatesPanel=ref(),accountRoot=ref(),credentialsPanel=ref(),accountIdentityPanel=ref()
let focusDisposed=false
const auth = useAuthStore()
const owner = computed(() => auth.user ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const lifecycle = createAccountLifecycle(() => owner.value)
const { confirm, confirming } = useScopedConfirmation(lifecycle.key, () => !focusDisposed)
const verifiedEmail = ref('')
const busy = ref(false)
const deleteBusy = ref(false)
const profileBusy = ref(false)
const profileLoading = ref(true), profileLoaded = ref(false), profileError = ref(''), profileStatus = ref('')
const exportBusy = ref(false), emailLoading = ref(true), emailError = ref('')
const emailStatus = ref(''), emailSubmitError = ref(''), deletionError = ref('')
const accountDeleted = ref(false)
const sessions = ref([]), sessionsLoading = ref(false), revokeBusy = ref(false), sessionsError = ref(''), sessionsStatus = ref('')
const externalAccountBusy = computed(() => profileBusy.value || busy.value || deleteBusy.value || revokeBusy.value || exportBusy.value || confirming.value || Boolean(accountIdentityPanel.value?.busy))
const accountBusy = computed(() => externalAccountBusy.value || Boolean(credentialsPanel.value?.busy))
const sessionsBusy = computed(() => sessionsLoading.value || accountBusy.value)
const sessionDate = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
const sessionsReader = createLatestRequest({
  load: options => http.get('/api/account/sessions', options),
  onStart: () => { sessionsLoading.value = true; sessionsError.value = '' },
  onSuccess: ({ data }) => { sessions.value = data },
  onError: () => { sessionsError.value = '最新登录记录未能读取，下方仅保留上次结果。请重试刷新记录' },
  onFinish: () => { sessionsLoading.value = false },
})
function loadSessions() { if (owner.value && !focusDisposed && !accountBusy.value) return sessionsReader.run() }
async function revokeOthers() {
  if (sessionsBusy.value || sessionsError.value || !sessions.value.some(session => !session.current)) return
  const ticket = lifecycle.capture()
  if (!ticket.current() || !(await confirm('其他登录会话会立即失效，当前页面保持登录。继续？', { title: '退出其他会话', confirmText: '退出其他会话', cancelText: '取消' })) || !ticket.current()) return
  revokeBusy.value = true; sessionsError.value = ''; sessionsStatus.value = ''
  try {
    const { data } = await http.post('/api/account/sessions/revoke-others', undefined, { signal: ticket.signal })
    if (!ticket.current()) return
    sessions.value = sessions.value.filter(session => session.current)
    sessionsStatus.value = `已退出 ${data.revoked} 个其他会话，当前会话保持登录`
    await sessionsReader.run()
  } catch { if (ticket.current()) sessionsError.value = '未能确认退出成功，请先刷新记录核对，再决定是否重试' }
  finally { if (ticket.current()) revokeBusy.value = false }
}
const emailForm = reactive({ email: '', password: '' })
const deletion = reactive({ password: '' })
const profile = reactive({ major: '', grade: '', skillsText: '', careerDirection: '', bio: '' })
const checkpoint = createDraftCheckpoint(() => profile)
useUnsavedChanges(
  () => !accountDeleted.value && (checkpoint.isDirty() || Boolean(emailForm.email || emailForm.password || deletion.password) || Boolean(credentialsPanel.value?.dirty)),
  () => !accountDeleted.value && accountBusy.value,
)

function applyNickname(result) {
  if (!focusDisposed && result.owner === owner.value && auth.user) auth.user.nickname = result.nickname
}
async function finishPasswordChange(principal) {
  if (focusDisposed || principal !== owner.value) return
  auth.clearLocalSession()
  ElMessage.success('密码已更新，请重新登录')
  try { await router.replace('/login?reauth=1') }
  catch (error) { if (!wasRouteFailureHandled(error)) ElMessage.error('密码已更新，请返回登录页重新登录') }
}

const profileReader = createLatestRequest({
  load: options => http.get('/api/account/profile', options),
  onStart: () => { profileLoading.value = true; profileError.value = '' },
  onSuccess: ({ data }) => {
    Object.assign(profile, {
      major: data.major || '', grade: data.grade || '', skillsText: (data.skills || []).join('、'),
      careerDirection: data.careerDirection || '', bio: data.bio || '',
    })
    checkpoint.accept()
    profileLoaded.value = true
  },
  onError: () => { profileError.value = '暂时无法读取个人信息，重试成功后才能编辑，避免覆盖已有资料' },
  onFinish: () => { profileLoading.value = false },
})
function loadProfile() { if (owner.value && !focusDisposed && !accountBusy.value) return profileReader.run() }

async function saveProfile() {
  if (accountBusy.value || profileLoading.value || !profileLoaded.value) return
  const ticket = lifecycle.capture()
  if (!ticket.current()) return
  profileError.value = ''; profileStatus.value = ''
  profileBusy.value = true
  const skills = profile.skillsText.split(/[、,，]/).map((item) => item.trim()).filter(Boolean)
  if (skills.length > 20) {
    profileBusy.value = false
    return ElMessage.warning('技能标签最多填写20项')
  }
  try {
    await http.put('/api/account/profile', {
      major: profile.major, grade: profile.grade, skills,
      careerDirection: profile.careerDirection, bio: profile.bio,
    }, { signal: ticket.signal })
    if (!ticket.current()) return
    checkpoint.accept()
    profileStatus.value = '已保存，后续建议会参考这些信息'
  } catch (error) { if (ticket.current()) profileError.value = error.response?.data?.message || '未能确认保存成功，填写内容已保留，请稍后重试' }
  finally { if (ticket.current()) profileBusy.value = false }
}

const emailReader = createLatestRequest({
  load: options => http.get('/api/account/email', options),
  onStart: () => { emailLoading.value = true; emailError.value = '' },
  onSuccess: ({ data }) => { verifiedEmail.value = data.email || '' },
  onError: () => { emailError.value = '暂时无法读取邮箱状态，请重试' },
  onFinish: () => { emailLoading.value = false },
})
function loadEmail() { if (owner.value && !focusDisposed && !accountBusy.value) return emailReader.run() }

async function requestVerification() {
  if (accountBusy.value) return
  const ticket = lifecycle.capture()
  if (!ticket.current()) return
  if (!emailForm.email.trim() || !emailForm.password) return ElMessage.warning('请填写邮箱和当前密码')
  busy.value = true; emailStatus.value = ''; emailSubmitError.value = ''
  try {
    await http.post('/api/account/email/verification', { ...emailForm }, { signal: ticket.signal })
    if (!ticket.current()) return
    emailForm.password = ''
    emailForm.email = ''
    emailStatus.value = '验证邮件已发送，请在30分钟内打开邮件中的链接'
  } catch (error) {
    if (ticket.current()) emailSubmitError.value = error.response?.data?.message || '未能确认发送成功，请先检查邮箱后再决定是否重试'
  } finally { if (ticket.current()) busy.value = false }
}

async function exportData() {
  if (exportBusy.value || accountBusy.value) return
  const ticket = lifecycle.capture()
  if (!ticket.current()) return
  exportBusy.value = true
  try {
    const response = await http.get('/api/account/export', { responseType: 'blob', signal: ticket.signal })
    if (!ticket.current()) return
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = 'campus-ai-account-data.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch { if (ticket.current()) ElMessage.error('导出失败，请稍后重试') }
  finally { if (ticket.current()) exportBusy.value = false }
}

async function deleteAccount() {
  if (accountBusy.value) return
  if (!deletion.password) return ElMessage.warning('请输入当前密码')
  const ticket = lifecycle.capture(), password = deletion.password
  if (!ticket.current() || !(await confirm('删除后聊天记录、反馈和提交资料无法恢复。确认永久删除？',
    { title: '再次确认', confirmText: '永久删除', cancelText: '取消', type: 'warning' })) || !ticket.current()) return
  if (password !== deletion.password) { deletionError.value = '确认期间密码输入发生变化，请重新确认；未提交删除'; return }
  deleteBusy.value = true; deletionError.value = ''
  try {
    await http.delete('/api/account', { data: { password }, signal: ticket.signal })
    if (!ticket.current()) return
    deletion.password = ''
    accountDeleted.value = true
    auth.clearLocalSession()
    ElMessage.success('账户已删除')
    await router.replace('/login')
  } catch (error) {
    if (ticket.current()) deletionError.value = error.response?.data?.message || '未能确认删除结果，请检查连接后重新登录核对'
  } finally { if (ticket.current()) deleteBusy.value = false }
}

async function focusAccountWorkflow() {
  const current = owner.value, hash = route.hash
  if (!current || focusDisposed) return
  if (hash === '#invoice-info') {
    try { await router.replace('/campus#invoice-info') }
    catch (error) { if (!wasRouteFailureHandled(error)) ElMessage.error('校园资料暂未打开，请重试') }
    return
  }
  if (!['#personal','#security','#password-security','#sessions','#my-data','#close-account','#token-activity','#teaching-identity','#product-updates'].includes(hash)) return
  await nextTick()
  if (focusDisposed || owner.value !== current || route.hash !== hash) return
  const target = accountRoot.value?.querySelector(hash)
  let disclosure = target?.closest('details')
  while (disclosure) { disclosure.open = true; disclosure = disclosure.parentElement?.closest('details') }
  await nextTick()
  if (!focusDisposed && owner.value === current && route.hash === hash)
    focusWorkflowElement(target, () => !focusDisposed && owner.value === current && route.hash === hash)
}
async function openProductFeature(item) { if(accountBusy.value||focusDisposed)return;try{await router.push(item.route)}catch(error){if(!wasRouteFailureHandled(error))ElMessage.error('页面暂时没能打开，请再试一次')} }
watch(()=>route.hash,focusAccountWorkflow,{flush:'post'})
watch(owner, () => {
  lifecycle.reset()
  for (const reader of [profileReader, emailReader, sessionsReader]) reader.cancel()
  for (const form of [emailForm, deletion, profile]) for (const key of Object.keys(form)) form[key] = ''
  checkpoint.accept(); profileLoaded.value = false; verifiedEmail.value = ''; sessions.value = []
  for (const value of [profileError, profileStatus, emailError, emailSubmitError, emailStatus, sessionsError, sessionsStatus, deletionError]) value.value = ''
  for (const value of [profileBusy, busy, deleteBusy, revokeBusy, exportBusy, accountDeleted]) value.value = false
  if (owner.value) { emailReader.run(); profileReader.run(); sessionsReader.run() }
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { focusDisposed = true; lifecycle.dispose(); for (const reader of [profileReader, emailReader, sessionsReader]) reader.dispose() })
onMounted(focusAccountWorkflow)
</script>

<template>
  <main ref="accountRoot" class="account-page account-page--profile">
    <div class="account-content">
      <header class="account-intro">
        <h1>个人信息</h1>
        <RouterLink to="/privacy" class="privacy-link">隐私说明</RouterLink>
      </header>

      <AccountIdentityPanel ref="accountIdentityPanel" :blocked="accountBusy" />
      <AccountCredentials ref="credentialsPanel" :owner="owner" :nickname="auth.user?.nickname || ''" :blocked="externalAccountBusy"
        :other-dirty="checkpoint.isDirty() || Boolean(emailForm.email || emailForm.password || deletion.password)"
        :verified-email="verifiedEmail" :email-known="!emailLoading && !emailError" @nickname-saved="applyNickname" @password-changed="finishPasswordChange" />

      <section id="personal" class="account-card account-profile" aria-labelledby="personal-title">
        <div class="account-section-heading"><h2 id="personal-title">个人资料</h2><span>选填</span></div>
        <p v-if="profileLoading" class="form-status" role="status">正在读取资料…</p>
        <p v-if="profileError" class="form-error" role="alert">{{ profileError }}</p>
        <button v-if="!profileLoaded && !profileLoading" class="secondary" type="button" @click="loadProfile">重新读取</button>
        <form :aria-busy="profileLoading || profileBusy" @submit.prevent="saveProfile" @input="profileStatus = ''">
          <fieldset class="account-form profile-form" :disabled="profileLoading || accountBusy || !profileLoaded">
            <legend class="sr-only">个人资料</legend>
            <div class="form-pair">
              <label for="profile-major">专业<input id="profile-major" v-model.trim="profile.major" maxlength="100" placeholder="你的专业" /></label>
              <label for="profile-grade">年级<input id="profile-grade" v-model.trim="profile.grade" maxlength="50" placeholder="例如：大二" /></label>
            </div>
            <div class="form-pair profile-interests">
              <label for="profile-skills">擅长什么<input id="profile-skills" v-model="profile.skillsText" maxlength="819" placeholder="Java、摄影、机械制图" /></label>
              <label for="profile-direction">发展方向<input id="profile-direction" v-model.trim="profile.careerDirection" maxlength="200" placeholder="就业、考研，或正在探索" /></label>
            </div>
            <label for="profile-bio">关于我<textarea id="profile-bio" v-model.trim="profile.bio" maxlength="500" rows="2" placeholder="简单介绍自己，请勿填写敏感信息"></textarea></label>
            <div class="profile-save-row">
              <span class="profile-save-status" aria-live="polite"><template v-if="profileStatus && !checkpoint.isDirty()">{{ profileStatus }}</template><template v-else-if="profileLoaded && checkpoint.isDirty()">尚未保存</template></span>
              <button type="submit" :disabled="accountBusy || !profileLoaded || !checkpoint.isDirty()">{{ profileBusy ? '保存中…' : '保存资料' }}</button>
            </div>
          </fieldset>
        </form>
      </section>

      <section class="account-settings" aria-labelledby="account-settings-title">
        <h2 id="account-settings-title">账户与安全</h2>
        <details id="security" class="account-card account-setting">
          <summary><span class="setting-label">找回邮箱</span><span class="setting-value" :class="{ 'setting-warning': !emailLoading && !verifiedEmail }" :title="verifiedEmail || undefined">{{ emailLoading ? '读取中' : emailError ? '待核对' : verifiedEmail || '未绑定' }}</span><span class="setting-chevron" aria-hidden="true"></span></summary>
          <div class="setting-body">
            <p v-if="emailLoading" role="status">正在读取邮箱…</p>
            <p v-else-if="emailError" class="form-error" role="alert">{{ emailError }} <button class="secondary" type="button" @click="loadEmail">重试</button></p>
            <p v-else-if="!verifiedEmail" class="form-hint">绑定验证邮箱后可找回密码。</p>
            <form class="account-form" :aria-busy="busy" @submit.prevent="requestVerification" @input="emailStatus = ''; emailSubmitError = ''">
              <label for="account-email">邮箱地址<input id="account-email" v-model.trim="emailForm.email" :disabled="accountBusy" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com" /></label>
              <label for="account-current-password">当前密码<input id="account-current-password" v-model="emailForm.password" :disabled="accountBusy" type="password" autocomplete="current-password" required /></label>
              <p v-if="emailSubmitError" class="form-error" role="alert">{{ emailSubmitError }}</p>
              <p v-if="emailStatus" role="status">{{ emailStatus }}</p>
              <button type="submit" :disabled="accountBusy">{{ busy ? '发送中…' : verifiedEmail ? '更换验证邮箱' : '发送验证邮件' }}</button>
            </form>
          </div>
        </details>

        <details id="sessions" class="account-card account-setting" aria-labelledby="sessions-title">
          <summary id="sessions-title"><span class="setting-label">登录会话</span><span class="setting-value">{{ sessionsError ? '待核对' : sessionsLoading ? '读取中' : sessions.length ? `${sessions.length} 条记录` : '暂无记录' }}</span><span class="setting-chevron" aria-hidden="true"></span></summary>
          <div class="setting-body">
            <p v-if="sessionsStatus" role="status">{{ sessionsStatus }}</p>
            <p v-if="sessionsError" class="form-error" role="alert">{{ sessionsError }}</p>
            <p v-else-if="sessionsBusy" role="status">正在更新会话…</p>
            <ul class="session-list"><li v-for="(session, index) in sessions" :key="index"><strong>{{ session.current ? '当前会话' : '其他会话' }}</strong><span>登录于 {{ sessionDate(session.createdAt) }}</span><small>到期 {{ sessionDate(session.expiresAt) }}</small></li></ul>
            <div class="session-actions"><button class="secondary" :disabled="sessionsBusy" @click="loadSessions">刷新记录</button><button :disabled="sessionsBusy || Boolean(sessionsError) || !sessions.some(s => !s.current)" @click="revokeOthers">{{ revokeBusy ? '退出中…' : '退出其他会话' }}</button></div>
          </div>
        </details>

        <details class="account-card account-setting"><summary><span class="setting-label">教学身份</span><span class="setting-chevron" aria-hidden="true"></span></summary><div class="setting-body"><TeachingIdentityPanel ref="identityPanel" tabindex="-1" /></div></details>
        <details class="account-card account-setting"><summary><span class="setting-label">额度记录</span><span class="setting-chevron" aria-hidden="true"></span></summary><div class="setting-body"><TokenActivityPanel /></div></details>
        <section id="my-data" class="account-card account-data-row" aria-labelledby="account-data-title">
          <div><h3 id="account-data-title">我的数据</h3><p>含个人资料与原文，请妥善保管。</p></div>
          <button class="secondary" type="button" :disabled="exportBusy || accountBusy" @click="exportData">{{ exportBusy ? '准备中…' : '下载数据' }}</button>
        </section>
        <ProductUpdates id="product-updates" ref="updatesPanel" :disabled="accountBusy" @activate="openProductFeature" />
        <details id="close-account" class="account-card account-setting danger-card">
          <summary><span class="setting-label">删除账户</span><span class="setting-chevron" aria-hidden="true"></span></summary>
          <div class="setting-body">
            <p>永久删除无法撤销。已发布的公共校园资料可能仍保留，详见隐私说明。</p>
            <form class="account-form" :aria-busy="deleteBusy" @submit.prevent="deleteAccount" @input="deletionError = ''">
              <label for="account-delete-password">当前密码<input id="account-delete-password" v-model="deletion.password" :disabled="accountBusy" type="password" autocomplete="current-password" required /></label>
              <p v-if="deletionError" class="form-error" role="alert">{{ deletionError }}</p>
              <button class="danger" type="submit" :disabled="accountBusy">{{ deleteBusy ? '处理中…' : '永久删除账户' }}</button>
            </form>
          </div>
        </details>
      </section>
    </div>
  </main>
</template>

<style scoped>
fieldset { border:0; padding:0; margin:0; min-width:0; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
.account-page { color:var(--assistant-ink,#29323c); }
:global(html:root body .workspace-page .account-page--profile .account-content) { box-sizing:border-box; width:100%; max-width:840px; margin:auto; padding:32px 32px 64px; }
:global(html:root body .workspace-page .account-page--profile .account-intro) { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:0; margin:0 0 16px; border:0; }
:global(html:root body .workspace-page .account-page--profile .account-intro h1) { margin:0; font-size:28px; font-weight:600; line-height:1.3; letter-spacing:-.025em; }
.privacy-link { flex:none; color:#526984; font-size:13px; text-decoration:none; }
.privacy-link:hover { color:#165dc4; text-decoration:underline; text-underline-offset:4px; }
:global(html:root body .workspace-page .account-page--profile .identity-panel) { padding:16px 0 28px; margin:0; border:0; border-bottom:1px solid var(--assistant-line,#e2e7ec); border-radius:0; box-shadow:none; background:transparent; }
:global(html:root body .workspace-page .account-page--profile .identity-copy h2) { margin:0 0 4px; font-size:24px; font-weight:600; letter-spacing:-.02em; }
:global(html:root body .workspace-page .account-page--profile .identity-copy p) { display:inline; margin:0; font-size:13px; color:#5d6876; }
:global(html:root body .workspace-page .account-page--profile .identity-actions button),
:global(html:root body .workspace-page .account-page--profile .identity-admin-link) { min-height:44px; margin:0; padding:8px 12px; border:0; border-radius:10px; font-size:13px; background:#e8f0fd; color:#245b9e; }
:global(html:root body .workspace-page .account-page--profile .account-card) { min-width:0; padding:0; margin:0; border:0; border-bottom:1px solid var(--assistant-line,#e2e7ec); border-radius:0; box-shadow:none; background:transparent; }
:global(html:root body .workspace-page .account-page--profile .account-card.account-credentials) { padding:22px 0; }
:global(html:root body .workspace-page .account-page--profile .account-card.account-credentials .nickname-form > p) { margin:0; }
:global(html:root body .workspace-page .account-page--profile .account-card.account-credentials p) { margin:0; }
:global(html:root body .workspace-page .account-page--profile .account-profile) { padding:28px 0; }
.account-section-heading { display:flex; align-items:baseline; gap:10px; margin-bottom:20px; }
:global(html:root body .workspace-page .account-page--profile .account-section-heading h2),
:global(html:root body .workspace-page .account-page--profile .account-settings > h2) { margin:0; font-size:16px; line-height:1.4; font-weight:600; }
.account-section-heading > span { color:#5d6876; font-size:12px; }
.account-form { display:grid; gap:16px; max-width:440px; }
.profile-form { max-width:none; }
.form-pair { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
label { display:block; min-width:0; font-size:13px; line-height:1.5; color:#4b5b6e; font-weight:500; }
input,textarea { box-sizing:border-box; display:block; width:100%; min-width:0; min-height:46px; margin-top:7px; padding:10px 12px; border:1px solid #dbe3ec; border-radius:10px; background:#f8fafc; color:var(--assistant-ink,#29323c); font:inherit; font-size:16px; line-height:1.5; caret-color:#165dc4; }
textarea { min-height:84px; resize:vertical; }
input::placeholder,textarea::placeholder { color:#657286; }
input:focus-visible,textarea:focus-visible { outline:2px solid #0b62db; outline-offset:1px; border-color:transparent; background:#fff; }
.profile-save-row { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:44px; }
.profile-save-status { color:#48647f; font-size:13px; line-height:1.5; }
:global(html:root body .workspace-page .account-page--profile .account-card p) { margin:0 0 14px; color:#5d6876; font-size:13px; line-height:1.6; }
:global(html:root body .workspace-page .account-page--profile .account-card p.form-error) { color:#a43434; }
:global(html:root body .workspace-page .account-page--profile .account-card button) { display:inline-flex; align-items:center; justify-content:center; flex:none; min-height:44px; margin:0; padding:10px 16px; border:0; border-radius:10px; background:#0b62db; color:#fff; font:inherit; font-size:14px; font-weight:500; cursor:pointer; transition:background-color 160ms ease,color 160ms ease,box-shadow 160ms ease,scale 180ms cubic-bezier(.22,.8,.24,1); }
:global(html:root body .workspace-page .account-page--profile .account-card button.secondary) { background:#e8f0fd; color:#245b9e; }
:global(html:root body .workspace-page .account-page--profile .account-card button.danger) { background:#b33440; color:#fff; }
button:disabled { opacity:.55; cursor:not-allowed; }
button:focus-visible,.privacy-link:focus-visible { outline:2px solid #0b62db; outline-offset:3px; }
.account-settings { padding-top:28px; }
:global(html:root body .workspace-page .account-page--profile .account-settings > h2) { margin-bottom:8px; }
.account-setting > summary { display:flex; align-items:center; gap:12px; min-height:64px; list-style:none; cursor:pointer; }
.account-setting > summary::-webkit-details-marker { display:none; }
.setting-label { flex:none; font-size:14px; font-weight:500; }
.setting-value { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-left:auto; color:#5d6876; font-size:13px; }
.setting-warning { color:#805617; }
.setting-chevron { flex:none; width:7px; height:7px; margin-left:auto; margin-right:3px; border-top:1.5px solid #708096; border-right:1.5px solid #708096; transform:rotate(45deg); transition:transform 220ms cubic-bezier(.22,.8,.24,1); }
.setting-value + .setting-chevron { margin-left:0; }
.account-setting[open] > summary .setting-chevron { transform:rotate(135deg); }
.account-setting > summary:focus-visible { outline:2px solid #0b62db; outline-offset:-2px; border-radius:8px; }
.setting-body { padding-bottom:22px; }
.setting-body :deep(#token-activity.account-card) { padding:0; margin:0; border:0; }
.setting-body :deep(.teaching-identity) { padding:0; }
.session-list { list-style:none; margin:0 0 16px; padding:0; }
.session-list li { display:grid; gap:4px; padding:12px 0; border-bottom:1px solid var(--assistant-line,#e2e7ec); font-size:13px; }
.session-list span,.session-list small { color:#5d6876; font-size:12px; }
.session-actions { display:flex; flex-wrap:wrap; gap:8px; }
:global(html:root body .workspace-page .account-page--profile .account-data-row) { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 0; }
.account-data-row > div { min-width:0; }
.account-data-row h3 { margin:0 0 4px; font-size:14px; font-weight:500; }
:global(html:root body .workspace-page .account-page--profile .account-data-row p) { margin:0; font-size:12px; }
.danger-card > summary { color:#a43434; }
@media(max-width:600px) {
  :global(html:root body .workspace-page .account-page--profile .account-content) { padding:24px 20px 48px; }
  :global(html:root body .workspace-page .account-page--profile .account-intro h1) { font-size:26px; }
  :global(html:root body .workspace-page .account-page--profile .identity-copy h2) { font-size:22px; }
  .profile-interests { grid-template-columns:minmax(0,1fr); }
  .account-form { gap:14px; }
  .form-pair { gap:12px; }
}
@media(max-width:359px) { .form-pair { grid-template-columns:minmax(0,1fr); }.account-data-row{align-items:flex-start;flex-direction:column} }
@media(prefers-reduced-motion:reduce) { .setting-chevron { transition:none; } :global(html:root body .workspace-page .account-page--profile .account-card button) { transition:none; } }
</style>
