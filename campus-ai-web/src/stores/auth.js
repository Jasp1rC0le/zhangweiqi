import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import http, { getUserAccessToken, setUserAccessToken, withUserAuthLock, publishUserSessionChange, userSessionEnded } from '@/api/http'
import { PRIVACY_POLICY_VERSION } from '@/utils/privacyPolicy'
import { sessionDraftRecovery } from '@/utils/sessionDraftRecovery.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getUserAccessToken())
  const user = ref(null)
  watch(userSessionEnded, ended => {
    if (ended) { token.value = ''; user.value = null }
  }, {flush:'sync'})

  const isLoggedIn = computed(() => Boolean(token.value))

  async function login(username, password) {
    return withUserAuthLock(async () => {
      const response = await http.post('/api/auth/login', { username, password })
      if (typeof response.data?.token !== 'string' || !response.data.token) {
        throw new Error('登录响应异常，请稍后重试')
      }
      setUserAccessToken(response.data.token, response.data.user)
      token.value = response.data.token
      user.value = response.data.user
      sessionDraftRecovery.bind(response.data.user)
      publishUserSessionChange()
      sessionDraftRecovery.rebindRevision()
    })
  }

  async function register(username, nickname, password, schoolId, privacyAccepted, teachingIdentity = 'STUDENT') {
    const response = await http.post('/api/users', {
      username,
      nickname,
      password,
      schoolId,
      teachingIdentity,
      privacyAccepted,
      policyVersion: PRIVACY_POLICY_VERSION,
    })

    return response.data
  }

  async function loadCurrentUser() {
    const response = await http.get('/api/auth/me')

    token.value = getUserAccessToken()
    user.value = response.data
    sessionDraftRecovery.bind(response.data)
    return user.value
  }

  function clearLocalSession() {
    sessionDraftRecovery.reset()
    token.value = ''
    user.value = null
    setUserAccessToken('')
    userSessionEnded.value = true
    publishUserSessionChange()
  }

  async function logout() {
    return withUserAuthLock(async () => {
      await http.post('/api/auth/logout')
      clearLocalSession()
    })
  }

  return {
    token,
    user,
    isLoggedIn,
    login,
    register,
    loadCurrentUser,
    logout,
    clearLocalSession,
  }
})
