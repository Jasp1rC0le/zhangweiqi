import { chatDraftRecovery } from './chatDraftRecovery.js'
import { projectFormRecovery, wallFormRecovery, feedbackFormRecovery, reviewFormRecovery } from './formDraftRecovery.js'

// A single auth lifecycle for every private local draft. Never bind from cached profile data.
const recoveries = [chatDraftRecovery,projectFormRecovery.recovery,wallFormRecovery.recovery,feedbackFormRecovery.recovery,reviewFormRecovery.recovery]
export const sessionDraftRecovery = Object.fromEntries(['bind','suspend','reset','rebindRevision'].map(method =>
  [method,(...args) => { for (const recovery of recoveries) recovery[method](...args) }],
))
