// A non-secret change marker only. Never distribute credentials or restore an
// identity from browser storage/messages; every recipient must reauthenticate.
export const SESSION_REVISION_KEY = 'campthink-session-revision-v1'
export function createSessionSync({ storage, events, channel, changed, nonce = () => crypto.randomUUID() }) {
  const read = () => { try { return storage?.getItem(SESSION_REVISION_KEY) } catch { return undefined } }
  let revision = read()
  let storageRevision = revision
  const accept = next => {
    if (next === undefined || next === revision) return false
    revision = next
    changed()
    return true
  }
  const check = () => {
    const next = read()
    if (next === undefined || next === storageRevision) return false
    storageRevision = next
    return accept(next)
  }
  const receive = event => {
    const message = event.data
    if (message?.type !== 'session-changed' || typeof message.revision !== 'string'
      || !/^[a-zA-Z0-9-]{1,100}$/.test(message.revision)) return
    // Persistent latest state wins over delayed messages from an earlier login.
    if (message.persisted === false || read() === undefined) accept(message.revision)
    else check()
  }
  const storageChanged = event => {
    if (event.key === SESSION_REVISION_KEY || event.key === null) check()
  }
  events?.addEventListener('storage', storageChanged)
  events?.addEventListener('focus', check)
  events?.addEventListener('pageshow', check)
  channel?.addEventListener('message', receive)
  return {
    check,
    publish() {
      revision = nonce()
      let persisted = false
      try {
        if (storage) { storage.setItem(SESSION_REVISION_KEY, revision); storageRevision = revision; persisted = true }
      } catch { /* Channel still invalidates active peers. */ }
      try { channel?.postMessage({type:'session-changed', revision, persisted}) } catch { /* Storage remains the fallback. */ }
    },
    close() {
      events?.removeEventListener('storage', storageChanged)
      events?.removeEventListener('focus', check)
      events?.removeEventListener('pageshow', check)
      channel?.removeEventListener('message', receive)
      channel?.close()
    },
  }
}
