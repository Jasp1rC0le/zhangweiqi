import { shallowRef } from 'vue'
import { createDraftRecovery } from './draftRecovery.js'
import { SESSION_REVISION_KEY } from '../api/sessionSync.js'

let storage
try { storage = window.sessionStorage } catch { /* No silent persistent fallback. */ }
// Development fixtures use a separate namespace and never read a real draft.
const fixture = import.meta.env.DEV && window.location.pathname === '/design-review.html'
export const chatDraftRecoveryState = shallowRef({enabled:false, error:''})
export const chatDraftRecovery = createDraftRecovery({
  storage,
  ...(fixture ? {key:'campthink-design-chat-drafts-v1'} : {}),
  revision: () => fixture ? 'design-only' : window.localStorage.getItem(SESSION_REVISION_KEY),
  changed: state => { chatDraftRecoveryState.value = state },
})
