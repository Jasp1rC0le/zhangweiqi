import { createSessionClient } from './sessionClient.js'
import { createAuthLock } from './authLock.js'
import { createSessionSync } from './sessionSync.js'
import { nextTick, ref } from 'vue'
import { sessionDraftRecovery } from '../utils/sessionDraftRecovery.js'

// Older releases persisted tokens. Refresh cookies now restore sessions.
try { localStorage.removeItem('token'); localStorage.removeItem('user') } catch { /* Storage may be unavailable. */ }
try { sessionStorage.removeItem('adminToken'); sessionStorage.removeItem('adminUser') } catch { /* No persistent fallback. */ }

export const withUserAuthLock = createAuthLock(navigator.locks)
export const userSessionEnded = ref(false)
// Public lifecycle counter only, never an access token. Renewal keeps the epoch.
export const userSessionGeneration = ref(0)
let sync
const session = createSessionClient({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  withAuthLock: withUserAuthLock,
  checkExternal: () => sync?.check(),
  onExpired: () => {
    userSessionGeneration.value++
    sessionDraftRecovery.suspend()
    userSessionEnded.value = true
    // Remove private views and their unload guards before attempting navigation.
    void nextTick(() => {
      if (window.location.pathname !== '/login') window.location.replace('/login?reauth=1')
    })
  },
})
let sharedStorage, channel
try { sharedStorage = window.localStorage } catch { /* Restricted browser storage. */ }
try { channel = new BroadcastChannel('campthink-session-v1') } catch { /* Storage events can still synchronize. */ }
sync = createSessionSync({storage:sharedStorage, events:window, channel, changed:() => {
  sessionDraftRecovery.reset()
  session.expire()
}})
if (import.meta.hot) import.meta.hot.dispose(() => sync.close())
export const publishUserSessionChange = () => sync.publish()
export const adminHttp = session.http
export const getUserAccessToken = session.getToken
export const setUserAccessToken = (token, user) => {
  session.setToken(token, user)
  userSessionGeneration.value++
  if (token) userSessionEnded.value = false
}
export const refreshUserAccess = session.refreshAccess
export const expireUserSession = session.expire
export const requestWithUserSession = session.requestWithSession
export { isSessionExpired } from './sessionClient.js'
export default session.http
