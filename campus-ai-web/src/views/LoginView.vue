<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowRight, Close } from '@element-plus/icons-vue'
import { submitContactMessage } from '@/api/contact'
import { getSchools } from '@/api/school'
import { useAuthStore } from '@/stores/auth'
import { loginFailureMessage } from '@/utils/loginFeedback'
import { createExamplePlayback } from '@/utils/examplePlayback'
import CampMark from '@/components/CampMark.vue'
import { IDENTITY_ROLES } from '@/utils/teachingIdentity'
import LegalNotice from '@/components/LegalNotice.vue'
import WorkspaceIcon from '@/components/WorkspaceIcon.vue'
import NavigationIcon from '@/components/NavigationIcon.vue'
import CanteenPreview from '@/components/CanteenPreview.vue'
import '@/styles/landing-onboarding.css'
import '@/styles/landing-polish.css'
import '@/styles/landing-apple.css'

const router = useRouter()
const authStore = useAuthStore()
const usernameInput = ref()
const registerUsernameInput = ref()
const contactNameInput = ref()
const loading = ref(false)
const loginError = ref('')
const registerLoading = ref(false)
const schoolsLoading = ref(false)
const schools = ref([])
const schoolsError = ref('')
const loginVisible = ref(false)
const contactVisible = ref(false)
const loginPresent = ref(false)
const contactPresent = ref(false)
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
const reducedMotion = ref(motionPreference.matches)
const modalDuration = computed(() => reducedMotion.value ? 0 : { enter: 700, leave: 340 })
const modalOrigin = ref({})
const destination = ref('/chat')
const destinationLabel = computed(() => ({ '/canteens': '食堂评分', '/study': '实验与作业', '/projects': '我的项目', '/wall': '校园墙' })[destination.value] || `${heroExample.value.label}工作台`)
const documentHidden = ref(document.hidden)
const authBusy = computed(() => loading.value || registerLoading.value)
let previousBodyOverflow = ''
let contactReturnFocusElement
const contactLoading = ref(false)
const authMode = ref('login')
const authStageHeight = ref(null)
const authDirection = ref(1)
let pendingRecovery = false
let disposed = false
let authFormObserver
watch([loginVisible, authMode], async ([visible]) => {
  authFormObserver?.disconnect()
  if (!visible) return
  await nextTick()
  if (disposed || !loginVisible.value) return
  const formElement = document.getElementById(authMode.value === 'login' ? 'login-title' : 'register-title')?.closest('.auth-form')
  if (!formElement) return
  const measure = () => { authStageHeight.value = formElement.scrollHeight + 4 }
  measure()
  authFormObserver = new ResizeObserver(measure)
  authFormObserver.observe(formElement)
})
const showIntro = ref(true)
const introReady = ref(false)
const activePage = ref(0)
const tallPages = ref([])
let chapterObserver
const entryMode = ref('standard')
const heroExamples = [
  { key: 'standard', label: '问答', purpose: '查校园', question: '图书馆周末几点关门？', output: '先核对资料，再给你有依据的回答', details: ['校内资料优先', '提供参考来源'], hint: '开放时间、办事流程、学习计划，都可以直接问' },
  { key: 'kimi', label: '论文', purpose: '理思路', question: '这个选题，怎么搭建论文提纲？', output: '把一个大问题，拆成清楚的研究结构', details: ['梳理研究问题', '整理章节与证据'], hint: '描述选题或粘贴材料，从提纲、阅读到文献整理' },
  { key: 'glm', label: '代码', purpose: '解报错', question: '这段 Java 代码为什么报错？', output: '顺着错误找原因，再一起验证修改', details: ['解释关键逻辑', '给出验证步骤'], hint: '粘贴报错和相关代码，说明预期结果就能开始' },
]
const heroExample = computed(() => heroExamples.find((item) => item.key === entryMode.value) || heroExamples[0])
const heroDemo = ref()
const demoInView = ref(false)
const demoPlaying = ref(false)
let demoVisibilityObserver
const canPlayDemo = () => demoInView.value && !showIntro.value && !reducedMotion.value && !documentHidden.value && !loginPresent.value && !contactPresent.value && activePage.value === 0
const demoPlayback = createExamplePlayback({
  canPlay: canPlayDemo,
  onPlayingChange: playing => { demoPlaying.value = playing },
  onStep: () => { entryMode.value = heroExamples[(heroExamples.findIndex(item => item.key === entryMode.value) + 1) % heroExamples.length].key },
})
function selectExample(key) { demoPlayback.stop(); entryMode.value = key }
watch([demoInView, showIntro, reducedMotion, documentHidden, loginPresent, contactPresent, activePage], () => {
  if (!canPlayDemo()) demoPlayback.stop()
}, { flush: 'sync' })
let introTimer
let introFallbackTimer
let introMinimumTimer
let readyListener
let pageScrollFrame
let returnFocusElement

const pages = [
  { id: 'top', title: '开始' },
  { id: 'experience', title: '三种能力' },
  { id: 'canteen', title: '校园生活' },
  { id: 'closing', title: '即刻体验' },
]

const form = reactive({ username: '', password: '' })
watch(() => [form.username, form.password], () => { loginError.value = '' })
const registerForm = reactive({
  schoolId: null,
  username: '',
  nickname: '',
  password: '',
  confirmPassword: '',
  privacyAccepted: false,
  teachingIdentity: 'STUDENT',
})
const contactForm = reactive({ name: '', contact: '', subject: '', message: '' })

const capabilities = [
  {
    number: '01',
    title: '问答',
    english: 'ASK',
    description: '查校园资料，看到答案，也看到它从哪里来。',
  },
  {
    number: '02',
    title: '论文',
    english: 'RESEARCH',
    description: '把选题、资料和长文本，梳理成清楚的结构。',
  },
  {
    number: '03',
    title: '代码',
    english: 'BUILD',
    description: '理解报错、拆解思路，把想法写成能验证的代码。',
  },
]
const campusTools = [
  { route: '/study', icon: 'study', title: '实验与作业', description: '写下题目与卡住的步骤，拆解下一步' },
  { route: '/projects', icon: 'projects', title: '我的项目', description: '集中整理材料，提交前检查遗漏' },
  { route: '/wall', icon: 'wall', title: '校园墙', description: '交流课程经验，向同学发起求助' },
]

function resolveErrorMessage(error, fallback) {
  const response = error.response?.data
  const fieldError = response?.fieldErrors ? Object.values(response.fieldErrors)[0] : undefined
  return response?.message || fieldError || response?.error || fallback
}

async function openLogin(mode = 'login', event, target = '/chat') {
  if (loginPresent.value || contactPresent.value) return
  returnFocusElement = event?.currentTarget || document.activeElement
  const origin = returnFocusElement?.getBoundingClientRect?.()
  modalOrigin.value = origin ? {
    '--entry-x': `${Math.max(-48, Math.min(48, (origin.left + origin.width / 2 - innerWidth / 2) * .12))}px`,
    '--entry-y': `${Math.max(-36, Math.min(36, (origin.top + origin.height / 2 - innerHeight / 2) * .12))}px`,
  } : {}
  destination.value = target
  loginError.value = ''
  pendingRecovery = false
  previousBodyOverflow = document.body.style.overflow
  authMode.value = mode
  loginPresent.value = true
  loginVisible.value = true
  document.body.style.overflow = 'hidden'
  if (mode === 'register') await loadSchools()
}

function focusLogin() {
  if (!loginVisible.value) return
  if (authMode.value === 'register') registerUsernameInput.value?.focus({ preventScroll: true })
  else usernameInput.value?.focus({ preventScroll: true })
}

function openWorkspace(key, event) {
  entryMode.value = key
  openLogin('login', event)
}

function closeLogin() {
  if (loading.value || registerLoading.value) return
  loginVisible.value = false
}

async function finishLoginClose() {
  loginPresent.value = false
  authStageHeight.value = null
  document.body.style.overflow = previousBodyOverflow
  await nextTick()
  if (pendingRecovery) {
    pendingRecovery = false
    await router.push('/forgot-password')
    return
  }
  returnFocusElement?.focus?.({ preventScroll: true })
}

function openRecovery() {
  if (authBusy.value) return
  pendingRecovery = true
  closeLogin()
}

async function switchAuthMode(mode) {
  if (loading.value || registerLoading.value || authMode.value === mode) return
  authDirection.value = mode === 'register' ? 1 : -1
  authMode.value = mode
  if (mode === 'register') void loadSchools()
  await nextTick()
  document.getElementById(`auth-tab-${mode}`)?.focus({ preventScroll: true })
}

function navigateAuthTabs(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const mode = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : authMode.value === 'login' ? 'register' : 'login'
  switchAuthMode(mode)
}

function deactivateAuthForm(element) {
  element.inert = true
  element.setAttribute('aria-hidden', 'true')
}
function activateAuthForm(element) {
  element.inert = false
  element.removeAttribute('aria-hidden')
}

async function loadSchools() {
  if (schoolsLoading.value || schools.value.length) return
  schoolsLoading.value = true
  schoolsError.value = ''
  try {
    const availableSchools = await getSchools()
    const uniqueSchools = new Map()
    for (const school of [...availableSchools].sort((a, b) => a.id - b.id)) {
      if (!uniqueSchools.has(school.name)) uniqueSchools.set(school.name, school)
    }
    schools.value = [...uniqueSchools.values()]
    if (schools.value.length === 1 && !registerForm.schoolId)
      registerForm.schoolId = schools.value[0].id
    if (!schools.value.length) schoolsError.value = '暂时没有可选择的学校，请稍后重试'
  } catch (error) {
    schoolsError.value = resolveErrorMessage(error, '学校列表未能加载，你填写的内容已保留')
  } finally {
    schoolsLoading.value = false
  }
}

async function submitLogin() {
  if (authBusy.value) return
  loginError.value = ''
  if (!form.username.trim() || !form.password) {
    loginError.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  let authenticated = false
  try {
    await authStore.login(form.username.trim(), form.password)
    authenticated = true
    try { localStorage.setItem('preferredModel', entryMode.value) } catch { /* Login does not depend on browser storage. */ }
    await new Promise((resolve, reject) => {
      window.dispatchEvent(new CustomEvent('campus:navigate', { detail: { to: destination.value, resolve, reject } }))
    })
  } catch (error) {
    loginError.value = authenticated
      ? '登录已成功，但工作台暂时未能打开，请刷新页面重试'
      : loginFailureMessage(error)
  } finally {
    loading.value = false
  }
}

async function submitRegistration() {
  if (authBusy.value) return
  const username = registerForm.username.trim()
  const nickname = registerForm.nickname.trim()
  if (!registerForm.schoolId) return ElMessage.warning('请选择你的学校')
  if (username.length < 3 || username.length > 50)
    return ElMessage.warning('用户名长度需要为 3 到 50 个字符')
  if (!nickname || nickname.length > 50) return ElMessage.warning('请输入不超过 50 个字符的昵称')
  if (registerForm.password.length < 6 || registerForm.password.length > 72)
    return ElMessage.warning('密码长度需要为 6 到 72 个字符')
  if (registerForm.password !== registerForm.confirmPassword)
    return ElMessage.warning('两次输入的密码不一致')
  if (!registerForm.privacyAccepted) return ElMessage.warning('请先阅读并同意隐私说明')
  registerLoading.value = true
  try {
    await authStore.register(
      username,
      nickname,
      registerForm.password,
      registerForm.schoolId,
      registerForm.privacyAccepted,
      registerForm.teachingIdentity,
    )
    form.username = username
    form.password = ''
    registerForm.password = ''
    registerForm.confirmPassword = ''
    ElMessage.success(registerForm.teachingIdentity === 'STUDENT' ? '账户创建成功，请登录' : '账户已创建，教学身份待管理员审核。可先登录使用基础功能')
    authDirection.value = -1
    authMode.value = 'login'
    await nextTick()
    usernameInput.value?.focus({ preventScroll: true })
  } catch (error) {
    ElMessage.error(resolveErrorMessage(error, '注册失败，请稍后重试'))
  } finally {
    registerLoading.value = false
  }
}

async function openContact() {
  if (loginPresent.value || contactPresent.value) return
  contactReturnFocusElement = document.activeElement
  previousBodyOverflow = document.body.style.overflow
  contactPresent.value = true
  contactVisible.value = true
  document.body.style.overflow = 'hidden'
}

function closeContact() {
  if (contactLoading.value) return
  contactVisible.value = false
}

async function finishContactClose() {
  contactPresent.value = false
  document.body.style.overflow = previousBodyOverflow
  await nextTick()
  contactReturnFocusElement?.focus?.({ preventScroll: true })
}

async function submitContact() {
  if (contactLoading.value) return
  const payload = Object.fromEntries(
    Object.entries(contactForm).map(([key, value]) => [key, value.trim()]),
  )
  if (Object.values(payload).some((value) => !value)) return ElMessage.warning('请完整填写意见信息')
  if (payload.name.length > 80 || payload.contact.length > 120)
    return ElMessage.warning('称呼或联系方式过长')
  if (payload.subject.length > 120 || payload.message.length > 5000)
    return ElMessage.warning('主题或内容超过长度限制')
  contactLoading.value = true
  try {
    await submitContactMessage(payload)
    contactForm.subject = ''
    contactForm.message = ''
    ElMessage.success('意见已收到，我们会认真查看')
    contactVisible.value = false
  } catch (error) {
    ElMessage.error(resolveErrorMessage(error, '提交失败，请稍后重试'))
  } finally {
    contactLoading.value = false
  }
}

function handleEscape(event) {
  if (event.key === 'Tab' && (loginPresent.value || contactPresent.value)) {
    const dialog = document.querySelector(contactPresent.value ? '.contact-dialog' : '.auth-dialog')
    const controls = [...(dialog?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || [])]
      .filter(element => element.tabIndex >= 0 && !element.closest('[inert]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden')
    const first = controls[0]
    const last = controls.at(-1)
    if (!dialog?.contains(document.activeElement)) { event.preventDefault(); first?.focus() }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  if (event.key !== 'Escape') return
  if (contactVisible.value) closeContact()
  else if (loginVisible.value) closeLogin()
}

function goToPage(index) {
  document.getElementById(`chapter-${pages[index]?.id}`)?.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  })
}

function trackChapter() {
  if (pageScrollFrame != null) return
  pageScrollFrame = requestAnimationFrame(() => {
    pageScrollFrame = null
    let current = 0
    pages.forEach((page, index) => {
      if (document.getElementById(`chapter-${page.id}`)?.getBoundingClientRect().top <= innerHeight * .35) current = index
    })
    activePage.value = current
  })
}

function measureChapters() {
  // Sticky chapters must fit the viewport, otherwise their lower controls are
  // covered by the next chapter before the reader can reach them.
  tallPages.value = [...document.querySelectorAll('.landing .story-page')]
    .filter(element => element.offsetHeight > innerHeight + 1)
    .map(element => element.id)
  trackChapter()
}

async function preparePage() {
  if (reducedMotion.value) { introReady.value = true; showIntro.value = false; return }
  const ready = Promise.all([
    document.readyState === 'complete' ? Promise.resolve() : new Promise((resolve) => { readyListener = resolve; window.addEventListener('load', readyListener, { once: true }) }),
    document.fonts?.ready || Promise.resolve(),
    new Promise((resolve) => { introMinimumTimer = window.setTimeout(resolve, 620) }),
  ])
  await Promise.race([ready, new Promise((resolve) => { introFallbackTimer = window.setTimeout(resolve, 4200) })])
  if (disposed) return
  window.clearTimeout(introFallbackTimer)
  introReady.value = true
  introTimer = window.setTimeout(() => { showIntro.value = false }, 460)
}

function updateMotionPreference(event) { reducedMotion.value = event.matches }
function updateVisibility() { documentHidden.value = document.hidden }

onMounted(() => {
  demoVisibilityObserver = new IntersectionObserver(entries => { demoInView.value = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .2) }, { threshold: [0, .2] })
  if (heroDemo.value) demoVisibilityObserver.observe(heroDemo.value)
  motionPreference.addEventListener('change', updateMotionPreference)
  document.addEventListener('visibilitychange', updateVisibility)
  window.addEventListener('keydown', handleEscape)
  preparePage()
  window.addEventListener('scroll', trackChapter, { passive:true })
  window.addEventListener('resize', measureChapters)
  chapterObserver = new ResizeObserver(measureChapters)
  document.querySelectorAll('.landing .story-page').forEach(element => chapterObserver.observe(element))
  trackChapter()
})
onBeforeUnmount(() => {
  demoPlayback.stop()
  demoVisibilityObserver?.disconnect()
  disposed = true
  document.removeEventListener('visibilitychange', updateVisibility)
  motionPreference.removeEventListener('change', updateMotionPreference)
  authFormObserver?.disconnect()
  chapterObserver?.disconnect()
  window.removeEventListener('keydown', handleEscape)
  window.removeEventListener('scroll', trackChapter)
  window.removeEventListener('resize', measureChapters)
  if (pageScrollFrame != null) cancelAnimationFrame(pageScrollFrame)
  window.clearTimeout(introTimer)
  window.clearTimeout(introFallbackTimer)
  window.clearTimeout(introMinimumTimer)
  if (readyListener) window.removeEventListener('load', readyListener)
  if (loginPresent.value || contactPresent.value) document.body.style.overflow = previousBodyOverflow
})
</script>

<template>
  <main class="landing apple-home" :class="{ 'is-ready': !showIntro, 'motion-paused': documentHidden || loginPresent || contactPresent || activePage !== 0 || !demoInView }" :inert="loginPresent || contactPresent">
    <Transition name="intro">
      <div v-if="showIntro" class="intro-curtain" :class="{ 'is-ready': introReady }" aria-hidden="true">
        <div class="intro-brand"><CampMark /><span>Campthink.</span></div>
        <p class="intro-status">{{ introReady ? 'READY' : 'PREPARING YOUR CAMPUS' }}</p>
        <span class="intro-line"></span>
      </div>
    </Transition>
    <nav class="page-index" :class="{ 'at-start':activePage === 0 }" aria-label="介绍页面">
      <button v-for="(page, index) in pages" :key="page.id" type="button"
        :aria-label="`第 ${index + 1} 章：${page.title}`" :title="page.title"
        :class="{ active: activePage === index }" :aria-current="activePage === index ? 'step' : undefined"
        @click="goToPage(index)"><span>{{ String(index + 1).padStart(2, '0') }}</span><b>{{ page.title }}</b></button>
      <small>{{ String(activePage + 1).padStart(2, '0') }} / {{ String(pages.length).padStart(2, '0') }}</small>
    </nav>
    <span id="chapter-top" class="story-anchor" aria-hidden="true"></span>
    <div id="top" class="hero-wrap story-page" :class="{ 'is-current': activePage === 0, 'is-tall': tallPages.includes('top') }">
      <nav class="site-nav" aria-label="主导航">
        <a class="brand" href="/" aria-label="Campus AI 首页">
          <CampMark />
          <span>Campthink<span class="brand-period">.</span></span>
        </a>
        <div class="nav-links">
          <a href="#experience" @click.prevent="goToPage(1)">探索能力</a>
          <a href="#canteen" @click.prevent="goToPage(2)">校园生活</a>
          <RouterLink to="/privacy">隐私说明</RouterLink>
          <button type="button" @click="openContact">提交意见</button>
        </div>
        <button class="nav-action" type="button" @click="openLogin('login', $event)">
          登录 / 注册 <ArrowRight aria-hidden="true" />
        </button>
      </nav>

      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <div class="hero-intro">
          <h1 id="hero-title">校园问题，随时问<br /><em>论文代码，一起解</em></h1>
          <p class="hero-subtitle">查校内信息、梳理论文、调试代码。</p>
          </div>
          <div class="hero-actions">
            <button class="hero-cta" type="button" @click="openLogin('login', $event)">
              登录，开始使用 <span class="action-circle"><ArrowRight aria-hidden="true" /></span>
            </button>
            <button class="explore-cue" type="button" @click="goToPage(1)">
              <span>向下探索 <small>看看它能帮你做什么</small></span>
              <span class="explore-cue-arrow" aria-hidden="true"><ArrowRight /></span>
            </button>
          </div>
        </div>
        <div class="hero-visual">
          <span class="orb-ambient orb-ambient-blue" aria-hidden="true"></span>
          <span class="orb-ambient orb-ambient-pink" aria-hidden="true"></span>
          <span class="orb-orbit orb-orbit-outer" aria-hidden="true"></span>
          <span class="orb-orbit orb-orbit-inner" aria-hidden="true"></span>
          <div class="hero-orb-stage" aria-hidden="true"><span class="intelligence-orb"><span class="orb-light"></span></span></div>
        </div>
          <div ref="heroDemo" class="hero-demo" :class="{ 'demo-playing': demoPlaying }">
            <div class="hero-demo-choice">
              <div class="hero-demo-toolbar">
              <div class="hero-example-modes" role="group" aria-label="选择使用示例" aria-describedby="home-example-note">
                <button v-for="item in heroExamples" :key="item.key" type="button" :aria-pressed="entryMode === item.key" @click="selectExample(item.key)">{{ item.label }}</button>
              </div>
              <button v-if="!reducedMotion" type="button" class="hero-demo-play" :aria-pressed="demoPlaying" :aria-label="demoPlaying ? '暂停示例演示' : '播放一次三种能力演示'" @click="demoPlayback.toggle()">
                <svg viewBox="0 0 20 20" aria-hidden="true"><path v-if="demoPlaying" d="M7 5v10M13 5v10" /><path v-else d="m7 4 9 6-9 6Z" /></svg>{{ demoPlaying ? '暂停' : '播放演示' }}
              </button>
              </div>
              <div class="hero-question-stage"><Transition name="hero-question"><p :key="heroExample.key" class="hero-example-question"><WorkspaceIcon :mode="heroExample.key" /><span>{{ heroExample.question }}</span></p></Transition></div>
              <small id="home-example-note" class="hero-demo-note">使用示例 · 非实时回答</small>
            </div>
            <div class="hero-demo-answer" :aria-live="demoPlaying ? 'off' : 'polite'" aria-atomic="true">
            <div class="hero-demo-stage"><Transition name="hero-example">
              <div :key="heroExample.key" class="hero-demo-content">
                <strong class="hero-demo-result">{{ heroExample.output }}</strong>
                <ul class="hero-demo-details"><li v-for="detail in heroExample.details" :key="detail"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>{{ detail }}</li></ul>
                <p class="hero-demo-hint">{{ heroExample.hint }}</p>
              </div>
            </Transition></div>
            </div>
            <div v-if="demoPlaying" :key="entryMode" class="hero-demo-progress" aria-hidden="true"><span></span></div>
          </div>
      </section>
    </div>

    <span id="chapter-experience" class="story-anchor" aria-hidden="true"></span>
    <section id="experience" class="experience story-page" :class="{ 'is-current': activePage === 1, 'is-tall': tallPages.includes('experience') }" aria-labelledby="experience-title">
      <div class="section-intro">
        <h2 id="experience-title">每一种好奇，都有它的工作台</h2>
        <p>问清楚，想深入，做出来。<br />三种入口，始终由你选择。</p>
      </div>
      <div class="capability-grid">
        <article v-for="item in capabilities" :key="item.number" class="capability-card">
          <WorkspaceIcon class="capability-icon" :mode="item.number === '01' ? 'standard' : item.number === '02' ? 'kimi' : 'glm'" />
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
          <button type="button" :aria-label="`登录后使用${item.title}功能`" @click="openWorkspace(item.number === '01' ? 'standard' : item.number === '02' ? 'kimi' : 'glm', $event)">
            <span>进入{{ item.title }}</span
            ><ArrowRight aria-hidden="true" />
          </button>
        </article>
      </div>
      <div class="campus-tools" aria-label="更多校园工具">
        <p>从一个问题，到真正完成一件事</p>
        <div class="campus-tool-links">
          <button v-for="tool in campusTools" :key="tool.route" type="button" @click="openLogin('login', $event, tool.route)">
            <NavigationIcon :name="tool.icon" /><span><strong>{{ tool.title }}</strong><small>{{ tool.description }}</small></span><ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>

    <span id="chapter-canteen" class="story-anchor" aria-hidden="true"></span>
    <section id="canteen" class="life-section story-page" :class="{ 'is-current': activePage === 2, 'is-tall': tallPages.includes('canteen') }" aria-labelledby="life-title">
      <CanteenPreview />
      <div class="life-content">
        <h2 id="life-title">认真学习<br /><i>也好好吃饭</i></h2>
        <p>
          商家资料由管理员核实发布。查看同学们的真实评分，也留下自己的体验。
        </p>
        <div class="life-status">
          <span class="status-light"></span> 商家资料由本校管理员审核发布
        </div>
        <button type="button" @click="openLogin('login', $event, '/canteens')">
          登录后查看 <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </section>

    <span id="chapter-closing" class="story-anchor" aria-hidden="true"></span>
    <section id="closing" class="closing story-page" :class="{ 'is-current': activePage === 3, 'is-tall': tallPages.includes('closing') }" aria-labelledby="closing-title">
      <h2 id="closing-title">带上好奇心<br /><i>剩下的，一起想</i></h2>
      <button type="button" @click="openLogin('login', $event)">
        开始我的第一段对话 <ArrowRight aria-hidden="true" />
      </button>
    </section>

    <footer class="site-footer">
      <span>© 2026 Campthink / Campus AI</span>
      <div>
        <RouterLink to="/privacy">隐私说明</RouterLink
        ><a href="mailto:contact@campthinkhub.cn">contact@campthinkhub.cn</a><button type="button" @click="openContact">提交意见</button>
      </div>
    </footer>
    <LegalNotice />

    <Teleport to="body">
      <Transition name="campus-modal" :duration="modalDuration" @after-enter="focusLogin" @after-leave="finishLoginClose">
        <div v-if="loginVisible" class="overlay campus-overlay login-overlay" :class="{ 'motion-paused': documentHidden }" :style="modalOrigin" @mousedown.self="closeLogin">
          <section
            class="auth-dialog"
            :class="{ 'is-register': authMode === 'register' }"
            :style="{ '--auth-direction': authDirection }"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="authMode === 'login' ? 'login-title' : 'register-title'"
          >
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭登录窗口"
              :disabled="authBusy"
              @click="closeLogin"
            >
              <Close />
            </button>
            <div class="auth-art" aria-hidden="true">
              <span class="art-brand"><CampMark /> Campthink.</span>
              <span class="auth-mini-orb"></span>
              <p>好奇心，<br />{{ authMode === 'login' ? '欢迎回来' : '欢迎加入' }}<small>A little clarity. Every day.</small></p>
            </div>
            <div class="auth-body">
              <div class="auth-tabs" :class="{ 'is-register': authMode === 'register' }" role="tablist" aria-label="账户操作" @keydown="navigateAuthTabs">
                <button
                  id="auth-tab-login"
                  aria-controls="auth-panel-login"
                  :tabindex="authMode === 'login' ? 0 : -1"
                  :disabled="authBusy"
                  type="button"
                  role="tab"
                  :aria-selected="authMode === 'login'"
                  :class="{ active: authMode === 'login' }"
                  @click="switchAuthMode('login')"
                >
                  登录
                </button>
                <button
                  id="auth-tab-register"
                  aria-controls="auth-panel-register"
                  :tabindex="authMode === 'register' ? 0 : -1"
                  :disabled="authBusy"
                  type="button"
                  role="tab"
                  :aria-selected="authMode === 'register'"
                  :class="{ active: authMode === 'register' }"
                  @click="switchAuthMode('register')"
                >
                  创建账户
                </button>
              </div>
              <div class="auth-stage" :class="{ 'is-register': authMode === 'register' }" :style="authStageHeight ? { height: `${authStageHeight}px` } : undefined"><Transition name="auth-step" @before-leave="deactivateAuthForm" @before-enter="activateAuthForm">
                <div v-if="authMode === 'login'" id="auth-panel-login" key="login" class="auth-form" role="tabpanel" aria-labelledby="auth-tab-login">
                  <h2 id="login-title">欢迎回来</h2>
                  <p class="form-lead">登录后进入{{ destinationLabel }}，随时可以切换功能</p>
                  <el-form :model="form" :disabled="loading" :aria-busy="loading" @submit.prevent="submitLogin">
                    <label for="login-username">用户名</label>
                    <el-form-item
                      ><el-input
                        id="login-username"
                        ref="usernameInput"
                        v-model="form.username"
                        size="large"
                        placeholder="输入用户名"
                        autocomplete="username"
                        :aria-describedby="loginError ? 'login-error' : undefined"
                    /></el-form-item>
                    <label for="login-password">密码</label>
                    <el-form-item
                      ><el-input
                        id="login-password"
                        v-model="form.password"
                        type="password"
                        size="large"
                        placeholder="输入密码"
                        autocomplete="current-password"
                        :aria-describedby="loginError ? 'login-error' : undefined"
                        show-password
                    /></el-form-item>
                    <p v-if="loginError" id="login-error" class="login-error" role="alert">{{ loginError }}</p>
                    <button class="form-submit" type="submit" :disabled="loading">
                      <span>{{ loading ? '正在登录…' : '登录' }}</span
                      ><ArrowRight aria-hidden="true" />
                    </button>
                  </el-form>
                  <button
                    class="text-link"
                    type="button"
                    :disabled="loading"
                    @click="openRecovery"
                  >
                    忘记密码？
                  </button>
                </div>
                <div v-else id="auth-panel-register" key="register" class="auth-form" role="tabpanel" aria-labelledby="auth-tab-register">
                  <h2 id="register-title">创建账户</h2>
                  <p class="form-lead">用真实的校园身份，开始你的探索。</p>
                  <el-form :model="registerForm" :disabled="registerLoading" :aria-busy="registerLoading" @submit.prevent="submitRegistration">
                    <label for="register-school">学校</label>
                    <el-form-item
                      ><el-select
                        id="register-school"
                        v-model="registerForm.schoolId"
                        :loading="schoolsLoading"
                        :teleported="false"
                        placeholder="选择学校"
                        size="large"
                        filterable
                        no-data-text="暂无可选择的学校"
                        ><el-option
                          v-for="school in schools"
                          :key="school.id"
                          :label="school.name"
                          :value="school.id" /></el-select
                    ></el-form-item>
                    <div v-if="schoolsError" class="school-error" role="alert">
                      <span>{{ schoolsError }}</span>
                      <button type="button" :disabled="schoolsLoading || registerLoading" @click="loadSchools">{{ schoolsLoading ? '正在重试…' : '重新加载学校' }}</button>
                    </div>
                    <label for="register-identity">你的身份</label>
                    <el-form-item><el-select id="register-identity" v-model="registerForm.teachingIdentity" size="large" :teleported="false" aria-describedby="register-identity-help"><el-option v-for="(label, value) in IDENTITY_ROLES" :key="value" :label="label" :value="value" /></el-select></el-form-item>
                    <p id="register-identity-help" class="identity-registration-help">{{ registerForm.teachingIdentity === 'STUDENT' ? '学生可直接使用基础功能；教学课表由管理员绑定本人账号。' : '此项为身份申请。管理员审核后，仍需单独配置课程、班级或学院范围。' }}</p>
                    <div class="form-columns">
                      <div>
                        <label for="register-username">用户名</label
                        ><el-form-item
                          ><el-input
                            id="register-username"
                            ref="registerUsernameInput"
                            v-model="registerForm.username"
                            size="large"
                            placeholder="3–50 个字符"
                            autocomplete="username"
                        /></el-form-item>
                      </div>
                      <div>
                        <label for="register-nickname">昵称</label
                        ><el-form-item
                          ><el-input
                            id="register-nickname"
                            v-model="registerForm.nickname"
                            size="large"
                            placeholder="想被怎样称呼"
                            autocomplete="nickname"
                        /></el-form-item>
                      </div>
                    </div>
                    <div class="form-columns">
                      <div>
                        <label for="register-password">密码</label
                        ><el-form-item
                          ><el-input
                            id="register-password"
                            v-model="registerForm.password"
                            type="password"
                            size="large"
                            placeholder="6–72 个字符"
                            autocomplete="new-password"
                            show-password
                        /></el-form-item>
                      </div>
                      <div>
                        <label for="register-confirm">确认密码</label
                        ><el-form-item
                          ><el-input
                            id="register-confirm"
                            v-model="registerForm.confirmPassword"
                            type="password"
                            size="large"
                            placeholder="再次输入"
                            autocomplete="new-password"
                            show-password
                        /></el-form-item>
                      </div>
                    </div>
                    <label class="consent"
                      ><input v-model="registerForm.privacyAccepted" :disabled="registerLoading" type="checkbox" /><span
                        >我已阅读并同意
                        <RouterLink to="/privacy" target="_blank" rel="noopener"
                          >隐私说明与使用规则</RouterLink
                        ></span
                      ></label
                    >
                    <button class="form-submit" type="submit" :disabled="registerLoading">
                      <span>{{ registerLoading ? '正在创建…' : '创建账户' }}</span
                      ><ArrowRight aria-hidden="true" />
                    </button>
                  </el-form>
                </div>
              </Transition></div>
              <p class="auth-note">账户信息仅用于提供校园智能服务，不向其他用户展示。</p>
            </div>
          </section>
        </div>
      </Transition>

      <Transition name="campus-modal" :duration="modalDuration" @after-enter="contactNameInput?.focus()" @after-leave="finishContactClose">
        <div v-if="contactVisible" class="overlay campus-overlay" @mousedown.self="closeContact">
          <section
            class="contact-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
          >
            <button
              class="dialog-close"
              type="button"
              aria-label="关闭意见窗口"
              :disabled="contactLoading"
              @click="closeContact"
            >
              <Close />
            </button>
            <p class="form-kicker">意见反馈</p>
            <h2 id="contact-title">让它更好</h2>
            <p class="form-lead">告诉我们哪里需要改进。意见会进入管理员后台。</p>
            <el-form :model="contactForm" :disabled="contactLoading" :aria-busy="contactLoading" @submit.prevent="submitContact">
              <div class="form-columns">
                <div>
                  <label for="contact-name">称呼</label
                  ><el-form-item
                    ><el-input
                      id="contact-name"
                      ref="contactNameInput"
                      v-model="contactForm.name"
                      size="large"
                      maxlength="80"
                      placeholder="怎么称呼你"
                      autocomplete="name"
                  /></el-form-item>
                </div>
                <div>
                  <label for="contact-method">联系方式</label
                  ><el-form-item
                    ><el-input
                      id="contact-method"
                      v-model="contactForm.contact"
                      size="large"
                      maxlength="120"
                      placeholder="邮箱、手机号或微信"
                  /></el-form-item>
                </div>
              </div>
              <label for="contact-subject">主题</label
              ><el-form-item
                ><el-input
                  id="contact-subject"
                  v-model="contactForm.subject"
                  size="large"
                  maxlength="120"
                  placeholder="你想聊什么"
              /></el-form-item>
              <label for="contact-message">具体意见</label
              ><el-form-item
                ><el-input
                  id="contact-message"
                  v-model="contactForm.message"
                  type="textarea"
                  :rows="4"
                  maxlength="5000"
                  show-word-limit
                  resize="none"
                  placeholder="描述问题、建议或期待的能力"
              /></el-form-item>
              <button class="form-submit" type="submit" :disabled="contactLoading">
                <span>{{ contactLoading ? '正在提交…' : '提交意见' }}</span
                ><ArrowRight aria-hidden="true" />
              </button>
            </el-form>
            <p class="auth-note">意见仅用于改进产品。</p>
          </section>
        </div>
      </Transition>
    </Teleport>
  </main>
</template>

<style scoped>
.identity-registration-help{font-size:13px;line-height:1.65;margin:-4px 0 18px;color:#59646f;max-width:65ch}
/* The longer registration form scrolls independently; the existing close control
   and animated art stay inside the viewport instead of scrolling out of reach. */
.auth-dialog.is-register { overflow:hidden; }
.auth-dialog.is-register .auth-body { min-height:0; box-sizing:border-box; overflow-y:auto; overscroll-behavior:contain; max-height:calc(min(94svh,900px) - 2px); }
@media(max-width:760px) { .auth-dialog.is-register .auth-body { max-height:calc(min(94svh,900px) - 147px); } }
.landing {
  --ink: #111311;
  --paper: #f6f5f0;
  --muted: #6f716e;
  background: var(--paper);
  color: var(--ink);
  overflow: hidden;
  font-family: Inter, 'Noto Sans SC', 'PingFang SC', sans-serif;
}
button,
a {
  -webkit-tap-highlight-color: transparent;
}
button {
  font: inherit;
  cursor: pointer;
}
a {
  color: inherit;
  text-decoration: none;
}
button:focus-visible,
a:focus-visible {
  outline: 2px solid #61a5ff;
  outline-offset: 4px;
}
.hero-wrap {
  position: relative;
  background: #111311;
  color: #f6f5f0;
  min-height: min(850px, 95svh);
  isolation: isolate;
  overflow: hidden;
}
.site-nav {
  position: relative;
  z-index: 3;
  max-width: 1480px;
  margin: auto;
  padding: 30px clamp(22px, 5vw, 72px);
  display: flex;
  align-items: center;
  gap: 32px;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-size: 21px;
  font-weight: 750;
  letter-spacing: -0.045em;
  white-space: nowrap;
}
.brand-symbol {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1.4px solid currentColor;
  border-radius: 50%;
  font-weight: 650;
  font-size: 20px;
  line-height: 1;
}
.brand-symbol span {
  position: absolute;
  font-size: 7px;
  transform: translate(9px, -8px);
}
.brand-dot {
  color: #a8ffcf;
}
.nav-links {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: clamp(18px, 2.5vw, 38px);
  font-size: 13px;
  color: #d1d3cf;
}
.nav-links button {
  background: none;
  border: 0;
  color: inherit;
  padding: 0;
}
.nav-links a:hover,
.nav-links button:hover {
  color: white;
}
.nav-action {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 11px 17px 11px 20px;
  border: 1px solid #676966;
  border-radius: 100px;
  color: white;
  background: transparent;
  font-size: 13px;
  white-space: nowrap;
  transition:
    background 0.2s,
    color 0.2s;
}
.nav-action:hover {
  background: #f6f5f0;
  color: #111311;
}
.nav-action svg,
.hero-cta svg,
.capability-card svg,
.life-content svg,
.closing svg,
.form-submit svg {
  width: 17px;
  height: 17px;
}
.hero {
  position: relative;
  z-index: 2;
  max-width: 1480px;
  margin: auto;
  padding: clamp(80px, 12vh, 145px) clamp(22px, 5vw, 72px) 125px;
  min-height: 690px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.hero:before {
  content: '';
  position: absolute;
  right: 7%;
  top: 9%;
  width: min(40vw, 540px);
  aspect-ratio: 1;
  border: 1px solid #3e423e;
  border-radius: 50%;
  opacity: 0.7;
  pointer-events: none;
}
.hero:after {
  content: '';
  position: absolute;
  right: 15%;
  top: 19%;
  width: min(24vw, 340px);
  aspect-ratio: 1;
  border: 1px solid #424642;
  border-radius: 50%;
  pointer-events: none;
}
.hero-eyebrow,
.section-kicker,
.hero-bottom,
.card-head,
.form-kicker {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 0.12em;
  font-size: 11px;
  font-weight: 650;
}
.hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #b4bbb4;
  animation: rise 0.7s both;
}
.eyebrow-line {
  display: block;
  width: 24px;
  height: 1px;
  background: #a8ffcf;
}
.hero h1 {
  margin: 38px 0 25px;
  font-size: clamp(58px, 7.8vw, 125px);
  font-weight: 660;
  line-height: 1.13;
  letter-spacing: -0.075em;
  position: relative;
  z-index: 1;
  animation: rise 0.7s 0.08s both;
}
.hero h1 em {
  font-style: normal;
  color: #c5cdc4;
}
.hero-subtitle {
  max-width: 550px;
  color: #b8bdb8;
  line-height: 1.8;
  font-size: clamp(16px, 1.6vw, 21px);
  animation: rise 0.7s 0.16s both;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 30px;
  margin-top: 35px;
  animation: rise 0.7s 0.24s both;
}
.hero-cta {
  background: #f6f5f0;
  border: 1px solid #f6f5f0;
  color: #111311;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 58px;
  border-radius: 100px;
  padding: 18px 21px 18px 25px;
  font-size: 15px;
  font-weight: 700;
  transition:
    transform 0.2s,
    background 0.2s;
}
.hero-cta:hover {
  transform: translateY(-3px);
  background: #baffd8;
}
.hero-actions > a {
  font-size: 14px;
  color: #b8bdb8;
}
.hero-actions > a span {
  display: inline-block;
  margin-left: 8px;
  transition: transform 0.2s;
}
.hero-actions > a:hover span {
  transform: translate(2px, 2px);
}
.hero-bottom {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  position: absolute;
  bottom: 92px;
  left: clamp(22px, 5vw, 72px);
  right: clamp(22px, 5vw, 72px);
  color: #919890;
}
.hero-curve {
  position: absolute;
  z-index: 1;
  right: -12%;
  bottom: -12vw;
  width: 80%;
  height: 20vw;
  background: var(--paper);
  border-radius: 60% 0 0 0/100% 0 0 0;
  transform: rotate(-2deg);
  pointer-events: none;
}
.experience {
  max-width: 1480px;
  margin: auto;
  padding: 95px clamp(22px, 5vw, 72px) 145px;
}
.section-intro {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 330px);
  column-gap: 80px;
  align-items: end;
}
.section-intro .section-kicker {
  grid-column: 1/-1;
  color: #6e7770;
  margin-bottom: 24px;
}
.section-intro h2,
.life-content h2,
.closing h2 {
  font-size: clamp(43px, 5.4vw, 76px);
  letter-spacing: -0.065em;
  line-height: 1.18;
  font-weight: 650;
  margin: 0;
}
.section-intro > p:last-child {
  font-size: 15px;
  color: #6f716e;
  line-height: 1.8;
  margin: 0 0 7px;
}
.capability-grid {
  margin-top: 62px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid #cbd0c8;
  border-bottom: 1px solid #cbd0c8;
}
.capability-card {
  min-height: 330px;
  padding: 30px 34px 34px 0;
  display: flex;
  flex-direction: column;
}
.capability-card + .capability-card {
  border-left: 1px solid #cbd0c8;
  padding-left: 34px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  color: #7a807a;
}
.capability-card h3 {
  font-size: clamp(40px, 5vw, 70px);
  line-height: 1;
  margin: 48px 0 17px;
  letter-spacing: -0.08em;
}
.capability-card p {
  color: #686e68;
  line-height: 1.7;
  margin: 0 0 37px;
  max-width: 250px;
  min-height: 50px;
}
.capability-card button {
  margin-top: auto;
  border: 0;
  padding: 0;
  background: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 14px;
  font-weight: 650;
  text-align: left;
}
.capability-card button svg {
  transition: transform 0.2s;
}
.capability-card button:hover svg {
  transform: translateX(5px);
}
.life-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 570px;
  background: #e7e9e2;
}
.life-image {
  background: #40423f url('/campus-architecture.jpg') center/cover no-repeat;
  filter: grayscale(1);
}
.life-content {
  padding: clamp(55px, 6vw, 100px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}
.life-content .section-kicker {
  margin: 0 0 33px;
  color: #6f7770;
}
.life-content h2 {
  font-size: clamp(39px, 4.4vw, 66px);
}
.life-content > p:not(.section-kicker) {
  max-width: 465px;
  color: #555d55;
  line-height: 1.9;
  font-size: 15px;
  margin: 26px 0;
}
.life-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #5b655b;
  margin: 0 0 28px;
}
.status-light {
  height: 7px;
  width: 7px;
  border-radius: 50%;
  background: #4e8263;
}
.life-content button {
  display: flex;
  gap: 30px;
  align-items: center;
  background: none;
  border: 0;
  border-bottom: 1px solid #111311;
  padding: 0 0 8px;
  font-size: 14px;
  font-weight: 650;
}
.life-content button svg {
  transition: transform 0.2s;
}
.life-content button:hover svg {
  transform: translateX(5px);
}
.closing {
  padding: 125px 22px 145px;
  text-align: center;
}
.closing .section-kicker {
  color: #7b827b;
}
.closing h2 {
  margin: 26px 0 42px;
}
.closing h2 i {
  font-style: normal;
  color: #777e75;
}
.closing button {
  display: inline-flex;
  gap: 36px;
  align-items: center;
  border: 1px solid #111311;
  border-radius: 100px;
  padding: 16px 22px;
  background: #111311;
  color: #fff;
  font-size: 14px;
  transition:
    transform 0.2s,
    background 0.2s;
}
.closing button:hover {
  transform: translateY(-3px);
  background: #303530;
}
.site-footer {
  padding: 27px clamp(22px, 5vw, 72px);
  border-top: 1px solid #d9dcd6;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  color: #737a73;
  font-size: 12px;
}
.site-footer div {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}
.site-footer button {
  border: 0;
  background: none;
  color: inherit;
  padding: 0;
}
.site-footer a:hover,
.site-footer button:hover {
  color: #111311;
}
.overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  padding: 24px;
  display: grid;
  place-items: center;
  background: rgba(8, 10, 8, 0.72);
  backdrop-filter: blur(10px);
  overflow: auto;
}
.auth-dialog,
.contact-dialog {
  position: relative;
  background: #f8f8f4;
  color: #141714;
  box-shadow: 0 30px 90px #0005;
  width: min(100%, 510px);
  max-height: min(94svh, 900px);
  overflow: auto;
  border-radius: 24px;
}
.auth-dialog.is-register {
  width: min(100%, 640px);
}
.dialog-close {
  position: absolute;
  z-index: 4;
  right: 19px;
  top: 19px;
  width: 38px;
  height: 38px;
  border: 1px solid #fff6;
  border-radius: 50%;
  background: #ffffff22;
  color: white;
  display: grid;
  place-items: center;
}
.dialog-close svg {
  width: 17px;
  height: 17px;
}
.dialog-close:hover {
  background: #ffffff40;
}
.auth-art {
  position: relative;
  height: 215px;
  background: #111311;
  color: white;
  overflow: hidden;
  padding: 29px 35px;
}
.auth-art:after {
  content: '';
  position: absolute;
  left: -15%;
  right: -22%;
  height: 100px;
  bottom: -72px;
  border-radius: 50% 50% 0 0;
  background: #f8f8f4;
  transform: rotate(-5deg);
}
.art-brand {
  position: relative;
  z-index: 1;
  font-size: 21px;
  font-weight: 720;
  letter-spacing: -0.05em;
}
.art-brand span {
  color: #a8ffcf;
}
.art-orbit {
  position: absolute;
  width: 300px;
  height: 300px;
  border: 1px solid #414841;
  border-radius: 50%;
  right: -40px;
  top: -150px;
}
.auth-art p {
  position: absolute;
  left: 35px;
  bottom: 57px;
  margin: 0;
  color: #b6c0b6;
  font:
    600 10px/1.6 ui-monospace,
    SFMono-Regular,
    monospace;
  letter-spacing: 0.13em;
}
.auth-body {
  padding: 19px 52px 34px;
}
.auth-tabs {
  display: flex;
  gap: 27px;
  border-bottom: 1px solid #d6d9d2;
  margin-bottom: 26px;
}
.auth-tabs button {
  padding: 0 0 15px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: #7b817b;
  font-weight: 650;
  font-size: 13px;
}
.auth-tabs button.active {
  border-color: #141714;
  color: #141714;
}
.form-kicker {
  color: #6b776d;
  margin: 0 0 12px;
}
.auth-form h2,
.contact-dialog h2 {
  font-size: clamp(35px, 5vw, 48px);
  font-weight: 650;
  letter-spacing: -0.065em;
  margin: 0 0 4px;
}
.form-lead {
  color: #747c75;
  font-size: 13px;
  line-height: 1.65;
  margin: 0 0 28px;
}
.login-error {
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid #ebd1c8;
  border-radius: 14px;
  background: #fff6f0;
  color: #833e2d;
  font-size: 14px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.auth-form label:not(.consent),
.contact-dialog label {
  display: block;
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 650;
}
.auth-form :deep(.el-form-item),
.contact-dialog :deep(.el-form-item) {
  margin-bottom: 16px;
}
.auth-form :deep(.el-input__wrapper),
.contact-dialog :deep(.el-input__wrapper),
.auth-form :deep(.el-select__wrapper) {
  min-height: 45px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 0 0 1px #d8dcd5 inset;
  padding: 0 14px;
}
.auth-form :deep(.el-input__wrapper.is-focus),
.contact-dialog :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--ct-blue, #334bdb) inset, 0 0 0 3px #334bdb12;
}
.contact-dialog :deep(.el-textarea__inner) {
  border-radius: 10px;
  box-shadow: 0 0 0 1px #d8dcd5 inset;
}
.auth-form :deep(.el-select) {
  width: 100%;
}
.form-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.form-submit {
  width: 100%;
  margin-top: 7px;
  border: 0;
  border-radius: 100px;
  min-height: 49px;
  padding: 0 20px 0 23px;
  background: #111311;
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 650;
  font-size: 14px;
  transition:
    background 0.2s,
    transform 0.2s;
}
.form-submit:hover:not(:disabled) {
  background: #344138;
  transform: translateY(-2px);
}
.form-submit:disabled {
  opacity: 0.55;
  cursor: wait;
}
.text-link {
  border: 0;
  background: none;
  color: #555e55;
  padding: 15px 0 0;
  font-size: 12px;
}
.text-link:hover {
  text-decoration: underline;
}
.consent {
  display: flex !important;
  align-items: center;
  gap: 9px;
  font-size: 12px !important;
  line-height: 1.5;
  margin: 3px 0 15px !important;
}
.consent input {
  accent-color: #111311;
  width: 15px;
  height: 15px;
}
.consent a {
  text-decoration: underline;
}
.auth-note {
  font-size: 11px;
  line-height: 1.6;
  color: #969d95;
  margin: 21px 0 0;
}
.contact-dialog {
  padding: 60px 45px 35px;
  width: min(100%, 610px);
}
.contact-dialog .dialog-close {
  color: #141714;
  border-color: #d8ddd7;
  background: #fff;
}
.contact-dialog .form-lead {
  margin-bottom: 27px;
}
.auth-change-enter-active,
.auth-change-leave-active {
  transition:
    opacity 0.18s,
    transform 0.18s;
}
.auth-change-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.auth-change-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (max-width: 900px) {
  .nav-links {
    display: none;
  }
  .site-nav {
    justify-content: space-between;
  }
  .hero {
    min-height: 660px;
  }
  .hero:before {
    right: -20%;
    top: 8%;
    width: 55vw;
  }
  .hero:after {
    right: -10%;
    top: 16%;
    width: 35vw;
  }
  .section-intro {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  .section-intro .section-kicker {
    margin: 0;
  }
  .section-intro > p:last-child {
    max-width: 430px;
  }
  .life-content {
    padding: 55px 35px;
  }
}
@media (max-width: 650px) {
  .hero-wrap {
    min-height: 740px;
    min-height: 93svh;
  }
  .site-nav {
    padding: 22px;
    gap: 8px;
  }
  .brand {
    font-size: 18px;
  }
  .brand-symbol {
    width: 30px;
    height: 30px;
    font-size: 17px;
  }
  .nav-action {
    padding: 10px 12px;
    gap: 7px;
    font-size: 12px;
  }
  .nav-action svg {
    width: 14px;
  }
  .hero {
    padding: clamp(95px, 16svh, 170px) 23px 125px;
    min-height: 650px;
  }
  .hero h1 {
    font-size: clamp(42px, 10.8vw, 65px);
    margin-top: 28px;
    line-height: 1.18;
  }
  .hero-subtitle {
    max-width: 360px;
    font-size: 16px;
  }
  .hero-actions {
    align-items: flex-start;
    flex-direction: column;
    gap: 21px;
  }
  .hero-cta {
    padding: 16px 20px;
    gap: 65px;
  }
  .hero-bottom {
    left: 23px;
    right: 23px;
    bottom: 78px;
    font-size: 9px;
  }
  .hero-bottom span:last-child {
    display: none;
  }
  .hero-curve {
    right: -25%;
    bottom: -55px;
    width: 115%;
    height: 160px;
    border-radius: 65% 0 0 0/100% 0 0 0;
  }
  .experience {
    padding: 62px 23px 80px;
  }
  .section-intro h2 {
    font-size: 43px;
  }
  .capability-grid {
    grid-template-columns: 1fr;
    margin-top: 44px;
  }
  .capability-card {
    min-height: 240px;
    padding: 22px 0;
  }
  .capability-card + .capability-card {
    border-left: 0;
    border-top: 1px solid #cbd0c8;
    padding-left: 0;
  }
  .capability-card h3 {
    font-size: 55px;
    margin: 27px 0 12px;
  }
  .capability-card p {
    margin-bottom: 20px;
    min-height: 0;
  }
  .life-section {
    grid-template-columns: 1fr;
  }
  .life-image {
    height: 260px;
  }
  .life-content {
    padding: 45px 23px 55px;
  }
  .closing {
    padding: 90px 22px 105px;
  }
  .closing h2 {
    font-size: 49px;
  }
  .site-footer {
    flex-direction: column;
    padding: 25px 23px;
  }
  .overlay {
    padding: 0;
    align-items: end;
  }
  .auth-dialog,
  .auth-dialog.is-register,
  .contact-dialog {
    width: 100%;
    max-height: 96svh;
    border-radius: 22px 22px 0 0;
  }
  .auth-art {
    height: 172px;
    padding: 22px 25px;
  }
  .auth-art p {
    left: 25px;
    bottom: 45px;
  }
  .auth-body {
    padding: 14px 25px 25px;
  }
  .auth-tabs {
    margin-bottom: 22px;
  }
  .auth-form h2,
  .contact-dialog h2 {
    font-size: 37px;
  }
  .form-columns {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .contact-dialog {
    padding: 60px 25px 28px;
  }
  .dialog-close {
    right: 15px;
    top: 15px;
  }
}
.auth-dialog,
.contact-dialog {
  scrollbar-width: none;
}
.auth-dialog::-webkit-scrollbar,
.contact-dialog::-webkit-scrollbar {
  display: none;
}
/* Bright campus palette: glass is reserved for navigation and light surfaces. */
.landing { --ink:#182b49; --paper:#f8faff; --muted:#5c708b; background:var(--paper); color:var(--ink); }
.hero-wrap { min-height:min(780px,94svh); color:var(--ink); background:radial-gradient(circle at 77% 38%,#e9e7ff 0,transparent 35%),radial-gradient(circle at 15% 80%,#e6f4ff 0,transparent 38%),#f8faff; }
.site-nav { max-width:1400px; margin:18px auto 0; padding:15px clamp(20px,3vw,38px); width:calc(100% - 44px); border:1px solid #ffffffdb; border-radius:22px; background:#ffffffab; box-shadow:0 10px 35px #47609613,inset 0 1px 1px #fff; backdrop-filter:blur(24px) saturate(1.35); -webkit-backdrop-filter:blur(24px) saturate(1.35); }
.brand-symbol { border:0; width:36px; height:36px; background:linear-gradient(145deg,#378df3,#7a66db 62%,#f5a462); color:#fff; font-size:18px; box-shadow:0 5px 14px #4d75cf40; }.brand-symbol span { color:white; }.brand-dot { color:#3984ee; }
.nav-links { color:#4e6180; }.nav-links a:hover,.nav-links button:hover { color:#0d5ec1; }
.nav-action { border-color:#d6e1f4; color:#24517e; background:#ffffffaa; }.nav-action:hover { color:#0c5cbb; background:#fff; }
.hero { max-width:1400px; min-height:680px; padding:clamp(90px,12vh,140px) clamp(25px,6vw,84px) 115px; justify-content:center; }
.hero:before,.hero:after,.hero-curve,.hero-bottom { display:none; }
.hero-eyebrow { color:#4d75a5; }.eyebrow-line { background:#5a9df2; }
.hero h1 { max-width:840px; font-size:clamp(58px,6.65vw,104px); line-height:1.16; margin:32px 0 22px; }.hero h1 em { color:#3b74bc; }
.hero-subtitle { color:#526983; max-width:520px; }.hero-actions > a { color:#486483; }.hero-cta { background:#176bd3; border-color:#176bd3; color:#fff; box-shadow:0 14px 28px #176bd32e; }.hero-cta:hover { background:#0a5dc6; }
.hero-visual { position:absolute; top:52%; right:clamp(18px,6vw,110px); width:min(32vw,440px); aspect-ratio:1; display:grid; place-items:center; transform:translateY(-50%); pointer-events:none; isolation:isolate; }
.orb-ambient { position:absolute; z-index:-1; width:80%; height:80%; border-radius:50%; filter:blur(55px); opacity:.36; }.orb-ambient-blue { background:#7ecaff; left:-16%; top:13%; }.orb-ambient-pink { background:#f4a3d8; right:-12%; bottom:-8%; }
.intelligence-orb { position:relative; width:86%; aspect-ratio:1; overflow:hidden; border:1px solid #ffffffed; border-radius:45% 55% 52% 48%/48% 43% 57% 52%; background:radial-gradient(circle at 30% 22%,#fff 0 5%,transparent 25%),radial-gradient(circle at 78% 72%,#ff9d24 0 12%,transparent 53%),radial-gradient(circle at 22% 75%,#238afb 0 15%,transparent 55%),radial-gradient(circle at 72% 24%,#b452eb 0 14%,transparent 51%),#e9f5ff; box-shadow:inset 0 0 30px #ffffff70,0 42px 95px #6170b041; animation:orb-float 8s ease-in-out infinite; }
.intelligence-orb:after { position:absolute; inset:18%; border:1px solid #ffffff75; border-radius:50%; background:#ffffff10; box-shadow:inset 0 0 22px #ffffff6b; backdrop-filter:blur(5px); content:''; }.orb-light { position:absolute; inset:-20%; background:linear-gradient(115deg,transparent 36%,#ffffff57 50%,transparent 64%); animation:orb-shine 9s ease-in-out infinite; }
@keyframes orb-float { 50% { transform:translateY(-14px) rotate(3deg); } }@keyframes orb-shine { 50% { transform:translateX(18%); } }
.experience { padding-top:108px; }.section-intro .section-kicker,.life-content .section-kicker,.closing .section-kicker { color:#6488b9; }.section-intro > p:last-child { color:#61738c; }
.capability-grid { grid-template-columns:1.15fr .95fr .95fr; border-color:#d8e3f2; }.capability-card + .capability-card { border-color:#d8e3f2; }.card-head { color:#7690b1; }.capability-card p { color:#61738c; }.capability-card button:hover { color:#1269ce; }
.life-section { background:#eaf1ff; }.life-image { position:relative; display:grid; place-items:center; min-height:520px; filter:none; background:radial-gradient(circle at 30% 27%,#d9ccff 0,transparent 40%),radial-gradient(circle at 77% 70%,#a6dbfa 0,transparent 37%),linear-gradient(130deg,#b8d8fa,#f1ebfa); }.life-image:before { content:''; position:absolute; width:46%; aspect-ratio:1; border-radius:49% 51% 46% 54%; background:linear-gradient(130deg,#ffffffa6,#ffffff28); box-shadow:inset 0 1px 1px #fff,0 25px 70px #668ec233; transform:translate(44%,-15%); }.life-glass { position:relative; width:min(72%,430px); display:grid; gap:26px; padding:36px; border:1px solid #ffffffd9; border-radius:28px; color:#23446c; background:#ffffff9c; box-shadow:0 24px 50px #5579a72c,inset 0 1px 1px #fff; backdrop-filter:blur(25px) saturate(1.4); }.life-glass span,.life-glass small { font-size:12px; font-weight:650; }.life-glass strong { font-size:clamp(36px,4vw,58px); line-height:1.25; letter-spacing:-.06em; }
.life-content > p:not(.section-kicker),.life-status { color:#526a88; }.life-content button { border-color:#2a5e9c; }.status-light { background:#258f77; }
.closing h2 i { color:#4f8fd5; }.closing button { border-color:#176bd3; background:#176bd3; }.closing button:hover { background:#0a5dc6; }.site-footer { border-color:#dbe4f0; color:#63758d; }
.overlay { background:#6681aa7d; }.auth-dialog,.contact-dialog { background:#fbfcff; box-shadow:0 30px 90px #17335340; }.auth-art { height:165px; color:#244771; background:radial-gradient(circle at 82% 65%,#e7d9ff,transparent 40%),radial-gradient(circle at 32% 66%,#c5e5ff,transparent 47%),#f0f5ff; }.auth-art:after { display:none; }.art-brand span { color:#4286df; }.auth-art p { bottom:30px; color:#496989; font-size:12px; font-weight:600; line-height:1.5; font-family:inherit; letter-spacing:0; }.auth-mini-orb { position:absolute; width:140px; aspect-ratio:1; right:75px; top:28px; border-radius:48% 52% 43% 57%; background:radial-gradient(circle at 70% 25%,#c580f2,transparent 45%),radial-gradient(circle at 25% 75%,#489ef5,transparent 48%),radial-gradient(circle at 78% 78%,#ffb062,transparent 46%),#fff; box-shadow:0 16px 38px #7391bd4f,inset 0 0 20px #fff9; }.form-submit { background:#176bd3; }.form-submit:hover:not(:disabled) { background:#0a5dc6; }.consent input { accent-color:#176bd3; }.dialog-close { color:#3a5879; border-color:#ffffffdd; background:#ffffffa8; }.dialog-close:hover { background:#fff; }
@media (prefers-reduced-transparency:reduce) { .site-nav,.life-glass { background:#fff; backdrop-filter:none; -webkit-backdrop-filter:none; } }
@media (max-width:1000px) { .hero-visual { opacity:.82; right:-5%; }.hero h1,.hero-subtitle,.hero-actions { position:relative; z-index:2; } }
@media (max-width:650px) { .hero-wrap { min-height:91svh; }.site-nav { width:calc(100% - 22px); margin-top:10px; padding:12px; border-radius:17px; }.hero { min-height:650px; padding:75px 23px 135px; justify-content:center; }.hero-visual { width:310px; top:auto; right:-78px; bottom:-75px; transform:none; opacity:.55; }.hero h1 { font-size:clamp(44px,10.5vw,66px); }.life-image { min-height:320px; }.life-glass { width:min(84%,420px); padding:26px; }.capability-grid { grid-template-columns:1fr; }.site-footer div { flex-wrap:wrap; gap:12px 22px; } }
/* Restore the original light, split-hero identity without rolling back newer features. */
.landing {
  --ink: #1d1d1f;
  --paper: #fbfbfd;
  --muted: #6e6e73;
  background: var(--paper);
  color: var(--ink);
}
.hero-wrap {
  min-height: 100svh;
  background: #fbfbfd;
  color: #1d1d1f;
}
.site-nav {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  width: min(1240px, calc(100% - 64px));
  max-width: none;
  height: 76px;
  margin: 0 auto;
  padding: 0;
  border: 0;
  border-bottom: 1px solid rgba(29, 29, 31, .09);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.brand {
  gap: 10px;
  width: fit-content;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -.03em;
}
.brand-image {
  display: block;
  width: 24px;
  height: 22px;
  object-fit: contain;
}
.nav-links {
  margin: 0;
  gap: 32px;
  color: #6e6e73;
  font-size: 12px;
}
.nav-links a:hover,
.nav-links button:hover { color: #1d1d1f; }
.nav-action {
  justify-self: end;
  gap: 7px;
  padding: 10px 17px;
  border: 0;
  color: #fff;
  background: #1d1d1f;
  font-size: 12px;
  font-weight: 600;
}
.nav-action:hover { color: #fff; background: #000; transform: translateY(-1px); }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(420px, .95fr);
  gap: 30px;
  align-items: center;
  width: min(1240px, calc(100% - 64px));
  max-width: none;
  min-height: calc(100svh - 76px);
  margin: 0 auto;
  padding: 70px 0 100px;
}
.hero-copy { position: relative; z-index: 2; }
.hero-eyebrow { gap: 12px; color: #86868b; letter-spacing: .16em; }
.eyebrow-line { width: 34px; background: #86868b; }
.hero h1 {
  max-width: none;
  margin: 25px 0 0;
  font-size: clamp(62px, 7vw, 104px);
  font-weight: 650;
  line-height: .99;
  letter-spacing: -.075em;
  white-space: nowrap;
}
.hero h1 em {
  display: inline-block;
  padding: 5px 7px 10px 0;
  color: transparent;
  background: linear-gradient(90deg, #007aff, #5856d6 36%, #af52de 69%, #ff375f);
  background-clip: text;
  -webkit-background-clip: text;
}
.hero-subtitle {
  max-width: 530px;
  margin: 28px 0 0;
  color: #6e6e73;
  font-size: 18px;
  line-height: 1.7;
  letter-spacing: -.02em;
}
.hero-actions { margin-top: 38px; gap: 26px; }
.hero-cta {
  gap: 24px;
  padding: 7px 7px 7px 22px;
  border: 0;
  color: #fff;
  background: #1d1d1f;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 14px 34px rgba(0, 0, 0, .14);
}
.hero-cta:hover { background: #000; box-shadow: 0 18px 42px rgba(0, 0, 0, .2); }
.action-circle {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  color: #1d1d1f;
  background: #fff;
}
.hero-actions > a { color: #424245; font-size: 13px; }
.hero-visual {
  position: relative;
  top: auto;
  right: auto;
  width: 100%;
  min-height: 560px;
  transform: none;
  opacity: 1;
}
.orb-ambient { width: 360px; height: 360px; filter: blur(70px); opacity: .32; }
.orb-ambient-blue { top: 14%; left: 8%; background: #5ac8fa; }
.orb-ambient-pink { right: 0; bottom: 10%; background: #ff9fcb; }
.orb-orbit {
  position: absolute;
  width: min(41vw, 500px);
  aspect-ratio: 1;
  border: 1px solid rgba(29, 29, 31, .07);
  border-radius: 50%;
}
.orb-orbit-inner { width: min(36vw, 445px); }
.intelligence-orb {
  width: min(31vw, 390px);
  background:
    radial-gradient(circle at 34% 24%, rgba(255, 255, 255, .95) 0 8%, transparent 31%),
    radial-gradient(circle at 75% 68%, #ff9f0a 0, transparent 36%),
    radial-gradient(circle at 25% 72%, #0a84ff 0, transparent 44%),
    radial-gradient(circle at 72% 27%, #bf5af2 0, transparent 40%), #fff;
  box-shadow: inset 0 0 42px rgba(255, 255, 255, .7), 0 42px 100px rgba(65, 72, 138, .24);
  animation-duration: 7s;
}
.visual-label {
  position: absolute;
  bottom: 25px;
  color: #86868b;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .2em;
  text-transform: uppercase;
}
.overlay { background: rgba(30, 36, 56, .55); }
.auth-dialog,
.auth-dialog.is-register {
  display: grid;
  grid-template-columns: minmax(0, .82fr) minmax(0, 1fr);
  width: min(880px, 100%);
  max-height: min(94svh, 900px);
  background: #fff;
  border-radius: 30px;
}
.auth-art {
  height: auto;
  min-height: 560px;
  padding: 34px;
  color: #1d1d1f;
  background: radial-gradient(circle at 75% 25%, #f4d8ff, transparent 41%),
    radial-gradient(circle at 12% 75%, #b9ddff, transparent 48%),
    radial-gradient(circle at 80% 80%, #ffe2bd, transparent 37%), #f7f8ff;
}
.auth-dialog.is-register .auth-art { min-height: 640px; }
.art-brand { color: #1d1d1f; font-size: 18px; font-weight: 650; }
.auth-mini-orb {
  width: min(58%, 215px);
  top: 34%;
  right: 21%;
  border: 1px solid rgba(255,255,255,.9);
  background: radial-gradient(circle at 34% 24%, #fff 0 7%, transparent 32%),
    radial-gradient(circle at 75% 68%, #ff9f0a, transparent 39%),
    radial-gradient(circle at 25% 72%, #0a84ff, transparent 46%),
    radial-gradient(circle at 72% 27%, #bf5af2, transparent 42%), #fff;
  box-shadow: inset 0 0 28px #ffffffaa, 0 35px 65px #6774ad36;
}
.auth-art p { bottom: 34px; left: 34px; color: #62677c; font-size: 13px; }
.auth-body { align-self: center; padding: 38px 44px; }
.dialog-close { color: #424245; background: #f2f2f7; border-color: transparent; }
.form-submit { background: #1d1d1f; }
.form-submit:hover:not(:disabled) { background: #000; }
@media (max-width: 1000px) {
  .hero { grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr); }
  .hero h1 { font-size: clamp(54px, 6.5vw, 78px); }
  .hero-visual { right: auto; opacity: 1; }
  .intelligence-orb { width: min(35vw, 350px); }
}
@media (max-width: 760px) {
  .site-nav { display: flex; justify-content: space-between; width: calc(100% - 40px); }
  .nav-links { display: none; }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    width: calc(100% - 48px);
    min-height: 0;
    padding: clamp(75px, 11svh, 110px) 0 60px;
    gap: 30px;
  }
  .hero h1 { font-size: clamp(46px, 8.9vw, 70px); }
  .hero-visual { align-self: center; width: min(100%, 480px); min-height: 390px; }
  .intelligence-orb { width: min(62vw, 315px); }
  .orb-orbit-outer { width: min(76vw, 370px); }
  .orb-orbit-inner { width: min(69vw, 340px); }
  .visual-label { bottom: 0; }
  .auth-dialog, .auth-dialog.is-register { grid-template-columns: 1fr; }
  .auth-art, .auth-dialog.is-register .auth-art { min-height: 170px; height: 170px; }
  .auth-mini-orb { width: 130px; top: 20px; right: 15%; }
  .auth-art p { bottom: 25px; }
}
@media (max-width: 650px) {
  .hero-wrap { min-height: 0; }
  .site-nav { width: calc(100% - 40px); margin: 0 auto; padding: 0; border-radius: 0; }
  .brand { font-size: 16px; }
  .nav-action { padding: 10px 14px; }
  .hero { min-height: 0; padding: 75px 0 50px; }
  .hero h1 { margin-top: 25px; font-size: clamp(42px, 8.5vw, 58px); line-height: 1.06; }
  .hero-subtitle { max-width: 420px; font-size: 16px; }
  .hero-actions { flex-direction: row; align-items: center; flex-wrap: wrap; }
  .hero-visual { top: auto; right: auto; bottom: auto; width: 100%; transform: none; opacity: 1; }
  .auth-dialog, .auth-dialog.is-register { border-radius: 22px 22px 0 0; }
  .auth-body { padding: 24px 25px 28px; }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *:before,
  *:after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Opening sequence and four connected chapters. */
.intro-curtain { position:fixed; inset:0; z-index:2000; display:grid; place-items:center; background:#111113; }
.intro-brand { display:flex; align-items:center; gap:12px; color:#fff; font-size:20px; font-weight:650; letter-spacing:-.03em; transition:opacity .32s ease,transform .52s cubic-bezier(.22,1,.36,1); }
.intro-brand img { width:30px; height:30px; object-fit:contain; }
.intro-status { position:absolute; bottom:36px; color:#ffffff80; font-size:10px; font-weight:650; letter-spacing:.2em; transition:opacity .22s ease; }
.intro-line { position:absolute; bottom:0; left:0; width:100%; height:2px; background:linear-gradient(90deg,#0a84ff,#bf5af2,#ff375f,#ff9f0a); transform-origin:left; animation:intro-progress 1.35s ease-in-out infinite; }
.intro-curtain.is-ready .intro-brand { opacity:0; transform:translateY(-14px) scale(.98); }
.intro-curtain.is-ready .intro-status { opacity:0; }
.intro-curtain.is-ready .intro-line { animation:none; transform:scaleX(1); }
.intro-leave-active { transition:opacity .5s ease,transform .7s cubic-bezier(.76,0,.24,1); }
.intro-leave-to { opacity:0; transform:translateY(-100%); }
@keyframes intro-progress { 0% { transform:scaleX(.08); } 55% { transform:scaleX(.68); } 100% { transform:scaleX(.97); } }
.page-index { position:fixed; top:auto; right:24px; bottom:18px; z-index:40; display:flex; align-items:center; gap:12px; padding:5px 13px; border:1px solid #ffffffd9; border-radius:999px; background:#ffffffda; box-shadow:0 10px 28px #2538581a; backdrop-filter:blur(18px); transform:none; }
.page-index button { display:flex; align-items:center; justify-content:flex-end; gap:6px; border:0; padding:8px 0; color:#66758b; background:none; cursor:pointer; font-size:11px; transition:color .3s ease,transform .3s ease; }
.page-index button span { font-variant-numeric:tabular-nums; }
.page-index button b { width:0; overflow:hidden; white-space:nowrap; text-align:left; font-weight:650; opacity:0; transition:width .4s cubic-bezier(.22,1,.36,1),opacity .3s ease; }
.page-index button:after { content:''; width:12px; height:2px; background:#a5b1c1; transition:width .4s cubic-bezier(.22,1,.36,1),background .3s ease; }
.page-index button.active { color:#176bd3; transform:translateX(-3px); }
.page-index button.active b,.page-index button:hover b { width:66px; opacity:1; }
.page-index button.active:after { width:20px; background:#176bd3; }
.page-index small { margin:0 0 0 4px; color:#79889d; text-align:right; font-size:10px; font-variant-numeric:tabular-nums; letter-spacing:.1em; }
.story-page { isolation:isolate; }
.story-anchor { display:block; height:0; pointer-events:none; }
.story-page .section-intro,.story-page .capability-grid,.story-page .life-content,.story-page .life-image,.story-page.closing > * { transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .85s cubic-bezier(.22,1,.36,1); }
.story-page.is-current .section-intro,.story-page.is-current .capability-grid,.story-page.is-current .life-content,.story-page.is-current .life-image,.story-page.closing.is-current > * { opacity:1; transform:translateY(0); }
.story-page:not(.is-current) .section-intro,.story-page:not(.is-current) .capability-grid,.story-page:not(.is-current) .life-content,.story-page:not(.is-current) .life-image,.story-page.closing:not(.is-current) > * { opacity:.45; transform:translateY(26px); }
@media (min-width:901px) {
  .landing { overflow:clip; }
  .story-page { position:sticky; top:0; min-height:100svh; box-shadow:0 -24px 65px #26384b0e; }
  .hero-wrap { z-index:1; }
  .experience { z-index:2; display:flex; flex-direction:column; justify-content:center; width:100%; max-width:none; padding:clamp(72px,8vh,120px) max(6vw,calc((100vw - 1240px)/2)); background:#f3f7ff; border-radius:28px 28px 0 0; }
  .life-section { z-index:3; border-radius:28px 28px 0 0; overflow:hidden; }
  .closing { z-index:4; display:flex; min-height:100svh; flex-direction:column; justify-content:center; border-radius:28px 28px 0 0; background:#fbfbfd; }
  .site-footer { position:relative; z-index:5; background:#fbfbfd; }
}

/* A visible chapter handoff makes the first viewport an introduction, not a dead end. */
.hero-wrap { background:radial-gradient(ellipse at 83% 42%,#eee9fa 0,transparent 47%),radial-gradient(ellipse at 8% 90%,#e9f0fa 0,transparent 46%),#fbfbfd; }
.hero-eyebrow { color:#465973; letter-spacing:.07em; }
.hero-subtitle { text-wrap:balance; }
.hero-chapter { margin-left:6px; padding-left:16px; border-left:1px solid #bfc9d8; color:#7c889a; font-size:10px; letter-spacing:.12em; font-variant-numeric:tabular-nums; }
.chapter-bridge { display:flex; align-items:center; gap:30px; width:min(1240px,calc(100% - 64px)); min-height:88px; margin:0 auto; padding:18px 0 24px; border:0; border-top:1px solid #ccd5e2; color:#26364c; background:transparent; text-align:left; cursor:pointer; }
.bridge-caption { flex:1; color:#617086; font-size:12px; letter-spacing:.06em; }
.bridge-next { display:grid; gap:6px; }
.bridge-next small { color:#6b7d96; font-size:10px; letter-spacing:.09em; }
.bridge-next strong { font-size:14px; font-weight:550; }
.bridge-arrow { display:grid; place-items:center; width:38px; height:38px; margin-right:0; border:1px solid #c4cfdf; border-radius:50%; font-size:19px; transition:transform .25s ease,background .25s ease; }
.chapter-bridge:hover .bridge-arrow { background:#e1e9f6; transform:translateY(4px); }
.chapter-bridge:focus-visible { outline:2px solid #176bd3; outline-offset:4px; }
@media (min-width:901px) {
  .hero { min-height:calc(100svh - 230px); padding:46px 0 62px; }
  .hero-visual { min-height:clamp(310px,52svh,560px); }
  .chapter-bridge { min-height:154px; padding-bottom:78px; }
}
@media (max-width:760px) {
  .hero { gap:8px; padding:54px 0 18px; }
  .hero-visual { height:260px; min-height:260px; aspect-ratio:auto; }
  .auth-body :deep(input),.contact-dialog input,.contact-dialog textarea { font-size:16px; }
  .page-index button { min-height:36px; min-width:28px; }
  .page-index.at-start { display:none; }
  .intelligence-orb { width:min(54vw,250px); }
  .orb-orbit-outer { width:min(68vw,300px); }
  .orb-orbit-inner { width:min(60vw,270px); }
  .chapter-bridge { width:calc(100% - 48px); gap:14px; padding-bottom:28px; }
  .bridge-caption { display:none; }
  .bridge-next { flex:1; }
  .hero-chapter { padding-left:10px; margin-left:0; }
}
@media (max-width:650px) { .hero h1 { font-size:clamp(34px,10.6vw,58px); } }

/* Dialog lifecycle motion lives in landing-polish.css; tabs move as one object. */
.auth-dialog,.auth-dialog.is-register { transition:min-height .68s cubic-bezier(.22,1,.36,1); }
.auth-art { transition:background .7s ease,min-height .68s cubic-bezier(.22,1,.36,1); }
.auth-dialog.is-register .auth-art { background:radial-gradient(circle at 25% 25%,#d4e6ff,transparent 42%),radial-gradient(circle at 77% 72%,#f8d6e9,transparent 43%),#f7f8ff; }
.auth-tabs { position:relative; display:grid; grid-template-columns:1fr 1fr; gap:0; padding:4px; border:0; border-radius:13px; background:#f1f3f7; }
.auth-tabs:before { position:absolute; top:4px; bottom:4px; left:4px; width:calc(50% - 4px); border:1px solid #e6e9ef; border-radius:10px; background:#fff; box-shadow:0 3px 12px #17243e12; content:''; transition:transform .42s cubic-bezier(.22,1,.36,1); }
.auth-tabs.is-register:before { transform:translateX(100%); }
.auth-tabs button { position:relative; z-index:1; min-height:40px; padding:0; border:0; color:#6e7787; background:none; transition:color .25s ease; }
.auth-tabs button.active { color:#1d1d1f; }
.auth-stage { position:relative; height:370px; overflow:hidden; transition:height .68s cubic-bezier(.22,1,.36,1); }
.auth-stage.is-register { height:510px; }
.auth-stage .auth-form { position:absolute; inset:0 0 auto; width:100%; }
.auth-step-enter-active { transition:opacity .32s .12s ease,transform .48s cubic-bezier(.22,1,.36,1); }
.auth-step-leave-active { transition:opacity .18s ease,transform .3s cubic-bezier(.22,1,.36,1); }
.auth-step-leave-active { pointer-events:none; }
.auth-step-enter-from { opacity:0; transform:translateX(calc(18px * var(--auth-direction,1))); }
.auth-step-leave-to { opacity:0; transform:translateX(calc(-12px * var(--auth-direction,1))); }
@media (max-width:900px) { .page-index { right:16px; bottom:18px; gap:8px; padding:8px 10px; border-radius:16px; }.page-index button b,.page-index button.active b { display:none; }.page-index small { display:none; } }
@media (max-width:760px) { .auth-stage { height:360px; }.auth-stage.is-register { height:575px; }.auth-dialog.is-register .auth-art { min-height:170px; }.auth-dialog,.auth-dialog.is-register { max-height:95svh; } }
@media (prefers-reduced-motion:reduce) { .intro-curtain,.intro-brand,.intro-line,.story-page *,.page-index *,.auth-dialog,.auth-art,.auth-mini-orb,.auth-stage,.auth-step-enter-active,.auth-step-leave-active { animation:none!important; transition:none!important; } }
</style>
