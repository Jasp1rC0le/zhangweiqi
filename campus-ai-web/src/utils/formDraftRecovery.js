import { shallowRef } from 'vue'
import { createDraftRecovery } from './draftRecovery.js'
import { projectDraftSchema, wallDraftSchema, feedbackDraftSchema, reviewDraftSchema } from './formDraftSchemas.js'
import { SESSION_REVISION_KEY } from '../api/sessionSync.js'

let storage
try { storage = window.sessionStorage } catch { /* No persistent fallback. */ }
const fixture = import.meta.env.DEV && window.location.pathname === '/design-review.html'
function createFormRecovery(name, schema) {
  const state = shallowRef({enabled:false,error:''})
  const recovery = createDraftRecovery({storage, schema,
    key:`campthink-${fixture ? 'design-' : ''}${name}-draft-v1`,
    revision:() => fixture ? 'design-only' : window.localStorage.getItem(SESSION_REVISION_KEY),
    changed:next => { state.value = next },
  })
  return {state, recovery}
}
export const projectFormRecovery = createFormRecovery('project',projectDraftSchema)
export const wallFormRecovery = createFormRecovery('wall',wallDraftSchema)
export const feedbackFormRecovery = createFormRecovery('feedback',feedbackDraftSchema)
export const reviewFormRecovery = createFormRecovery('review',reviewDraftSchema)
