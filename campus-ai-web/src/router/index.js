import { createRouter, createWebHistory } from 'vue-router'
import { getUserAccessToken, refreshUserAccess, isSessionExpired } from '@/api/http'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { adminDestination } from '@/utils/adminAccess'
import PageRecovery from '@/components/PageRecovery.vue'
import { recordRouteFailure, clearRouteFailure } from '@/utils/routeRecovery'

const LoginView = () => import('@/views/LoginView.vue')
const ChatView = () => import('@/views/ChatView.vue')
const AdminView = () => import('@/views/AdminView.vue')
const AccountView = () => import('@/views/AccountView.vue')
const AccountActionView = () => import('@/views/AccountActionView.vue')
const PrivacyView = () => import('@/views/PrivacyView.vue')
const CanteenView = () => import('@/views/CanteenView.vue')
const ProjectStudioView = () => import('@/views/ProjectStudioView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),

  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },

  routes: [
    { path: '/connection-error', name: 'connection-error', component: () => import('@/views/ConnectionIssueView.vue') },
    {
      path: '/',
      redirect: '/chat',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: {
        guestOnly: true,
      },
    },
    {
      path: '/chat',
      name: 'workspace',
      component: ChatView,
      meta: {
        requiresAuth: true,
      },
      children: [
        { path: '', name: 'chat', component: { render: () => null } },
        { path: '/canteens', name: 'canteens', component: CanteenView },
        { path: '/projects/:id?', name: 'projects', component: ProjectStudioView },
        { path: '/reviews/:id?', name: 'reviews', component: () => import('@/views/ProjectReviewsView.vue') },
        { path: '/account', name: 'account', component: AccountView },
        { path: '/wall', name: 'wall', component: () => import('@/views/WallView.vue') },
        { path: '/instruments', name: 'instruments', component: () => import('@/views/InstrumentView.vue') },
        { path: '/study', name: 'study', component: () => import('@/views/StudyView.vue') },
        { path: '/timetable', name: 'timetable', component: () => import('@/views/TimetableView.vue') },
        { path: '/teaching', name: 'teaching', component: () => import('@/views/TeachingView.vue') },
        { path: '/feedback', name: 'feedback', component: () => import('@/views/FeedbackView.vue') },
        { path: '/pro', name: 'pro', redirect: { path: '/chat', query: { pro: '1' } } },
        { path: '/admin', name: 'admin', component: AdminView, meta: { requiresAdmin: true } },
      ],
    },
    { path: '/forgot-password', name: 'forgot-password', component: AccountActionView },
    { path: '/reset-password', name: 'reset-password', component: AccountActionView },
    { path: '/verify-email', name: 'verify-email', component: AccountActionView },
    { path: '/privacy', name: 'privacy', component: PrivacyView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: PageRecovery },
    {
      path: '/admin/login',
      name: 'admin-login',
      redirect: '/admin',
    },
  ],
})

const removeFailureHandler = router.onError((error, to, from) => recordRouteFailure(error, to, from, path => router.resolve(path)))
const removeRecoveryHandler = router.afterEach((_to, _from, failure) => { if (!failure) clearRouteFailure() })
if (import.meta.hot) import.meta.hot.dispose(() => { removeFailureHandler(); removeRecoveryHandler() })

router.beforeEach(async (to, from) => {
  const hasToken = Boolean(getUserAccessToken())
  const unavailable = error => {
    if (isSessionExpired(error)) return '/login?reauth=1'
    if (!from.matched.length || from.name === 'connection-error') {
      return { name: 'connection-error', query: { retry: to.fullPath } }
    }
    ElMessage.error('暂时无法连接服务，当前页面和内容已保留，请稍后重试')
    return false
  }

  if (to.meta.requiresAuth && !hasToken) {
    try { await refreshUserAccess() }
    catch (error) { return unavailable(error) }
  }

  if (to.meta.guestOnly && to.query.reauth !== '1') {
    if (hasToken) return '/chat'
    try { await refreshUserAccess(); return '/chat' }
    catch { /* No active login session. */ }
  }

  const auth = useAuthStore()
  if (to.meta.requiresAdmin) {
    try {
      const destination = await adminDestination(() => auth.loadCurrentUser())
      return destination === '/login' ? '/login?reauth=1' : destination || undefined
    } catch (error) { return unavailable(error) }
  }
  if (to.meta.requiresAuth && !auth.user) {
    try { await auth.loadCurrentUser() }
    catch (error) { return unavailable(error) }
  }
})

export default router
