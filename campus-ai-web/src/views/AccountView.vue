<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import http from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import CampMark from '@/components/CampMark.vue'
import TokenActivityPanel from '@/components/TokenActivityPanel.vue'
import AccountIdentityPanel from '@/components/AccountIdentityPanel.vue'
import { createDraftCheckpoint } from '@/utils/draftCheckpoint'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'

const router = useRouter()
const auth = useAuthStore()
const verifiedEmail = ref('')
const busy = ref(false)
const deleteBusy = ref(false)
const profileBusy = ref(false)
const profileLoading = ref(true), profileLoaded = ref(false), profileError = ref(''), profileStatus = ref('')
const exportBusy = ref(false), emailLoading = ref(true), emailError = ref('')
const accountDeleted = ref(false)
const sessions = ref([]), sessionsBusy = ref(false), sessionsError = ref('')
const sessionDate = value => new Date(value).toLocaleString('zh-CN', { hour12: false })
async function loadSessions() {
  sessionsBusy.value = true; sessionsError.value = ''
  try { sessions.value = (await http.get('/api/account/sessions')).data }
  catch { sessionsError.value = '登录记录暂时无法读取。请检查后端是否已更新，再重试'; sessions.value = [] }
  finally { sessionsBusy.value = false }
}
async function revokeOthers() {
  try { await ElMessageBox.confirm('其他登录会话会立即失效，当前页面保持登录。继续？', '退出其他会话', { confirmButtonText: '退出其他会话', cancelButtonText: '取消' }) }
  catch { return }
  sessionsBusy.value = true
  try {
    const { data } = await http.post('/api/account/sessions/revoke-others')
    ElMessage.success(`已退出 ${data.revoked} 个其他会话`)
    await loadSessions()
  } catch { sessionsError.value = '操作未确认成功，请重试'; sessionsBusy.value = false }
}
const emailForm = reactive({ email: '', password: '' })
const deletion = reactive({ password: '' })
const profile = reactive({ major: '', grade: '', skillsText: '', careerDirection: '', bio: '' })
const checkpoint = createDraftCheckpoint(() => profile)
useUnsavedChanges(
  () => !accountDeleted.value && (checkpoint.isDirty() || Boolean(emailForm.email || emailForm.password || deletion.password)),
  () => !accountDeleted.value && (profileBusy.value || busy.value || deleteBusy.value),
)

async function loadProfile() {
  profileLoading.value = true
  profileError.value = ''
  try {
    const { data } = await http.get('/api/account/profile')
    Object.assign(profile, {
      major: data.major || '', grade: data.grade || '', skillsText: (data.skills || []).join('、'),
      careerDirection: data.careerDirection || '', bio: data.bio || '',
    })
    checkpoint.accept()
    profileLoaded.value = true
  } catch { profileError.value = '暂时无法读取个人信息，重试成功后才能编辑，避免覆盖已有资料' }
  finally { profileLoading.value = false }
}

async function saveProfile() {
  if (profileBusy.value || profileLoading.value || !profileLoaded.value) return
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
    })
    checkpoint.accept()
    profileStatus.value = '已保存，后续建议会参考这些信息'
  } catch (error) { profileError.value = error.response?.data?.message || '未能确认保存成功，填写内容已保留，请稍后重试' }
  finally { profileBusy.value = false }
}

async function loadEmail() {
  emailLoading.value = true; emailError.value = ''
  try { verifiedEmail.value = (await http.get('/api/account/email')).data.email || '' }
  catch { emailError.value = '暂时无法读取邮箱状态，请重试' }
  finally { emailLoading.value = false }
}

async function requestVerification() {
  if (busy.value) return
  if (!emailForm.email.trim() || !emailForm.password) return ElMessage.warning('请填写邮箱和当前密码')
  busy.value = true
  try {
    await http.post('/api/account/email/verification', emailForm)
    emailForm.password = ''
    emailForm.email = ''
    ElMessage.success('验证邮件已发送，请在30分钟内打开邮件中的链接')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '发送失败，请稍后再试')
  } finally { busy.value = false }
}

async function exportData() {
  if (exportBusy.value) return
  exportBusy.value = true
  try {
    const response = await http.get('/api/account/export', { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = 'campus-ai-account-data.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch { ElMessage.error('导出失败，请稍后重试') }
  finally { exportBusy.value = false }
}

async function deleteAccount() {
  if (deleteBusy.value) return
  if (!deletion.password) return ElMessage.warning('请输入当前密码')
  try {
    await ElMessageBox.confirm('删除后聊天记录、反馈和提交资料无法恢复。确认永久删除？',
      '再次确认', { confirmButtonText: '永久删除', cancelButtonText: '取消', type: 'warning' })
  } catch { return }
  deleteBusy.value = true
  try {
    await http.delete('/api/account', { data: { password: deletion.password } })
    deletion.password = ''
    accountDeleted.value = true
    auth.clearLocalSession()
    ElMessage.success('账户已删除')
    await router.replace('/login')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '删除失败，请检查密码')
  } finally { deleteBusy.value = false }
}

onMounted(() => Promise.all([loadEmail(), loadProfile(), loadSessions()]))
</script>

<template>
  <main class="account-page">
    <header class="account-header">
      <RouterLink to="/chat" class="back-link">← 返回对话</RouterLink>
      <span class="brand"><CampMark /> Campthink.</span>
    </header>
    <div class="account-content">
      <div class="account-intro"><p class="eyebrow">YOUR OWN SPACE / 个人空间</p>
      <h1>关于你，<br /><em>由你决定</em></h1>
      <p class="lede">你的偏好、账户与数据。<br />只保留你愿意分享的部分。</p>
      <nav class="account-nav" aria-label="账户设置目录"><a href="#personal">个人信息</a><a href="#security">找回邮箱</a><a href="#token-activity">额度记录</a><a href="#my-data">我的数据</a><a href="#sessions">登录会话</a><a href="#close-account">注销账户</a></nav></div>

      <div class="account-sections"><AccountIdentityPanel /><section id="personal" class="account-card">
        <div class="card-index">01 / 个性化</div>
        <h2>让建议更适合你</h2>
        <p>这些信息完全自愿填写，只用于调整解释深度、例子和求职建议，不会被当作校园事实来源。</p>
        <p v-if="profileLoading" role="status">正在读取个人信息…</p>
        <p v-if="profileError" class="form-error" role="alert">{{ profileError }}</p>
        <button v-if="!profileLoaded && !profileLoading" class="secondary" type="button" @click="loadProfile">重新读取</button>
        <form :aria-busy="profileLoading || profileBusy" @submit.prevent="saveProfile" @input="profileStatus = ''">
          <fieldset class="account-form profile-form" :disabled="profileLoading || profileBusy || !profileLoaded">
          <legend class="sr-only">个人信息</legend>
          <div class="form-pair">
            <label for="profile-major">专业<input id="profile-major" v-model.trim="profile.major" maxlength="100" placeholder="例如：软件工程" /></label>
            <label for="profile-grade">年级<input id="profile-grade" v-model.trim="profile.grade" maxlength="50" placeholder="例如：大二" /></label>
          </div>
          <label for="profile-skills">技能标签<input id="profile-skills" v-model="profile.skillsText" maxlength="819" placeholder="Java、Vue、机械制图，用顿号分隔" /></label>
          <label for="profile-direction">发展方向<input id="profile-direction" v-model.trim="profile.careerDirection" maxlength="200" placeholder="例如：后端开发、考研、智能制造" /></label>
          <label for="profile-bio">补充说明<textarea id="profile-bio" v-model.trim="profile.bio" maxlength="500" rows="3" placeholder="可选，不要填写身份证号、密码等敏感信息"></textarea></label>
          <p v-if="profileStatus && !checkpoint.isDirty()" role="status">{{ profileStatus }}</p>
          <small v-else-if="profileLoaded && checkpoint.isDirty()">有未保存的修改</small>
          <button type="submit" :disabled="profileBusy || !profileLoaded || !checkpoint.isDirty()">{{ profileBusy ? '正在保存…' : '保存个性化资料' }}</button>
          </fieldset>
        </form>
      </section>

      <section id="security" class="account-card">
        <div class="card-index">02 / 安全</div>
        <h2>找回邮箱</h2>
        <p v-if="emailLoading" role="status">正在读取邮箱状态…</p>
        <p v-else-if="emailError" role="alert">{{ emailError }} <button class="secondary" type="button" @click="loadEmail">重试</button></p>
        <p v-else-if="verifiedEmail">已验证：{{ verifiedEmail }}</p>
        <p v-else>尚未绑定邮箱。绑定后，忘记密码时才能通过邮件找回。</p>
        <form class="account-form" @submit.prevent="requestVerification">
          <label for="account-email">邮箱地址</label>
          <input id="account-email" v-model.trim="emailForm.email" :disabled="busy" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com" />
          <label for="account-current-password">当前密码</label>
          <input id="account-current-password" v-model="emailForm.password" :disabled="busy" type="password" autocomplete="current-password" required />
          <button type="submit" :disabled="busy">{{ busy ? '正在发送…' : verifiedEmail ? '更换验证邮箱' : '发送验证邮件' }}</button>
        </form>
      </section>

      <section id="my-data" class="account-card">
        <div class="card-index">03 / 数据</div>
        <h2>下载我的数据</h2>
        <p>导出个人资料、对话、反馈、评分、私有项目及保留版本。下载文件包含你的原文，请勿转发给不可信对象。</p>
        <button class="secondary" type="button" :disabled="exportBusy" @click="exportData">{{ exportBusy ? '正在准备下载…' : '下载 JSON 文件' }}</button>
      </section>

      <section id="sessions" class="account-card" aria-labelledby="sessions-title">
        <h2 id="sessions-title">管理登录会话</h2>
        <p>查看最近100个有效会话。不采集设备指纹，因此不推测设备名称或位置。</p>
        <p v-if="sessionsError" role="alert">{{ sessionsError }}</p>
        <p v-else-if="sessionsBusy" role="status">正在更新会话…</p>
        <ul class="session-list"><li v-for="(session, index) in sessions" :key="index"><strong>{{ session.current ? '当前会话' : '其他会话' }}</strong><span>登录于 {{ sessionDate(session.createdAt) }}</span><small>到期 {{ sessionDate(session.expiresAt) }}</small></li></ul>
        <div class="session-actions"><button class="secondary" :disabled="sessionsBusy" @click="loadSessions">刷新记录</button><button :disabled="sessionsBusy || Boolean(sessionsError) || !sessions.some(s => !s.current)" @click="revokeOthers">退出其他会话</button></div>
      </section>

      <TokenActivityPanel />
      <section id="close-account" class="account-card danger-card">
        <div class="card-index">04 / 注销</div>
        <h2>永久删除账户</h2>
        <p>此操作不可撤销。已发布的公共校园资料可能仍保留，详见隐私说明。</p>
        <form class="account-form" @submit.prevent="deleteAccount">
          <label for="account-delete-password">输入当前密码确认身份</label>
          <input id="account-delete-password" v-model="deletion.password" type="password" autocomplete="current-password" required />
          <button class="danger" type="submit" :disabled="deleteBusy">{{ deleteBusy ? '正在处理…' : '删除我的账户' }}</button>
        </form>
      </section>
      <RouterLink to="/privacy" class="privacy-link">查看隐私说明 →</RouterLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.account-card .form-error { color: #a43434; }
.account-page { min-height: 100svh; background: #f7f8fa; color: #1d1d1f; }
.session-list { padding:0; list-style:none; }.session-list li { display:grid; gap:6px; padding:16px 0; border-bottom:1px solid #dce1d4; }.session-list span,.session-list small { color:#525e64; font-size:14px; }.session-actions { display:flex; flex-wrap:wrap; gap:12px; }
.account-header { height: 72px; padding: 0 max(24px, calc((100vw - 960px)/2)); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; background: #fff; }
.back-link, .privacy-link { color: #3565ae; text-decoration: none; font-size: 14px; }
.brand { font-weight: 700; letter-spacing: -.03em; }
.account-content { max-width: 720px; padding: 68px 24px 100px; margin: auto; }
.eyebrow, .card-index { color: #78808c; font-size: 12px; font-weight: 700; letter-spacing: .15em; }
h1 { font-size: clamp(40px, 7vw, 64px); letter-spacing: -.07em; margin: 12px 0; }
.lede { color: #6e7580; font-size: 18px; margin: 0 0 38px; }
.account-card { padding: clamp(24px, 4vw, 38px); background: #fff; border: 1px solid #e7e9ec; border-radius: 28px; margin-bottom: 18px; box-shadow: 0 12px 32px rgba(30, 40, 60, .035); }
h2 { font-size: 25px; margin: 12px 0 8px; letter-spacing: -.035em; }
.account-card p { color: #69717c; line-height: 1.65; margin: 0 0 22px; }
.account-form { display: grid; gap: 10px; max-width: 390px; }.profile-form { max-width: none; }.form-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
label { font-size: 13px; color: #555e6b; font-weight: 600; }
input,textarea { box-sizing: border-box; display: block; width: 100%; min-height: 48px; padding: 0 15px; margin-top: 8px; border-radius: 13px; border: 1px solid #d9dde4; background: #fbfcfe; color: #1d1d1f; font: inherit; outline: 0; }textarea { min-height: 90px; padding-top: 13px; resize: vertical; }
input:focus-visible,textarea:focus-visible { border-color: #4079d5; box-shadow: 0 0 0 3px #4079d522; }
button { border: 0; cursor: pointer; border-radius: 13px; background: #1967d2; color: #fff; font-weight: 600; min-height: 46px; padding: 0 22px; margin-top: 10px; transition: transform .2s ease, background .2s ease; }
button:hover:not(:disabled) { transform: translateY(-2px); background: #0f55b6; }
button:disabled { opacity: .55; cursor: wait; }
button.secondary { background: #edf3fc; color: #245da6; }
.danger-card { border-color: #f0dfdf; }
button.danger { background: #ae313a; }
button.danger:hover:not(:disabled) { background: #92242c; }
.privacy-link { display: inline-block; margin-top: 10px; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
@media (max-width: 560px) { .form-pair { grid-template-columns: 1fr; } input,textarea { font-size: 16px; } }
</style>
