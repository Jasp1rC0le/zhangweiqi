export const DRAFT_RECOVERY_KEY = 'campthink-chat-drafts-v1'
export const DRAFT_TTL_MS = 30 * 60 * 1000
const models = new Set(['standard', 'kimi', 'glm'])
const MAX_RECORD_CHARS = 260000
const MAX_TEXT_CHARS = 200000
const MAX_DRAFTS = 20

function ownerKey(user) {
  const id = String(user?.id ?? ''), school = String(user?.schoolId ?? '')
  return /^[1-9]\d*$/.test(id) && /^[1-9]\d*$/.test(school) ? `${id}:${school}` : null
}
function validSlot(value) {
  return value && models.has(value.model)
    && (value.conversationId === null || (Number.isSafeInteger(value.conversationId) && value.conversationId > 0))
}
const slotKey = value => `${value.model}:${value.conversationId ?? 'new'}`

const chatSchema = {
  maxRecordChars: MAX_RECORD_CHARS,
  active(value) {
    if (value === null) return null
    if (!validSlot(value)) throw new Error('slot')
    return {model:value.model, conversationId:value.conversationId}
  },
  entries(values) {
    if (!Array.isArray(values) || values.length > MAX_DRAFTS) throw new Error('count')
    let total = 0
    const slots = new Set(), clean = []
    for (const entry of values) {
      if (!validSlot(entry) || typeof entry.text !== 'string'
        || entry.text.length > (entry.model === 'kimi' ? 50000 : 10000)
        || slots.has(slotKey(entry))) throw new Error('entry')
      slots.add(slotKey(entry)); total += entry.text.length
      if (entry.text.trim()) clean.push({model:entry.model, conversationId:entry.conversationId, text:entry.text})
    }
    if (total > MAX_TEXT_CHARS) throw new Error('size')
    return clean
  },
}

// Opt-in, tab-local convenience, NOT encryption or an authorization boundary.
// bind() must only receive a server-confirmed identity, never cached user data.
export function createDraftRecovery({ storage, revision, now = Date.now, key = DRAFT_RECOVERY_KEY, changed = () => {}, schema = chatSchema }) {
  let owner = null, enabled = false, record = null, error = '', suspended = true
  const readRevision = () => { try { return revision() } catch { return undefined } }
  function remove() {
    try { storage?.removeItem(key); return true } catch { return false }
  }
  function notify() { changed({ enabled, error }) }
  function reset() {
    const removed = remove()
    owner = null; enabled = false; record = null; suspended = true
    error = removed ? '' : '浏览器未允许清理暂存，请关闭此标签页并清除网站数据'
    notify()
  }
  function load() {
    try {
      const raw = storage?.getItem(key)
      if (!raw) return null
      if (raw.length > schema.maxRecordChars) throw new Error('size')
      const value = JSON.parse(raw), time = now(), currentRevision = readRevision()
      if (currentRevision === undefined || value?.version !== 1 || value.revision !== currentRevision
        || !/^[1-9]\d*:[1-9]\d*$/.test(value.owner)
        || !Number.isSafeInteger(value.savedAt) || time < value.savedAt || time - value.savedAt >= DRAFT_TTL_MS
        ) throw new Error('invalid')
      // Reconstruct only allowed fields. No passwords, tokens, attachments or extra data.
      return { version: 1, owner: value.owner, revision: value.revision, savedAt: value.savedAt,
        active: schema.active(value.active), entries: schema.entries(value.entries) }
    } catch {
      remove()
      return null
    }
  }
  function persist(entries, active, savedAt = now()) {
    if (!owner || suspended || !enabled) return false
    const currentRevision = readRevision()
    const failure = message => {
      // Never leave an older snapshot claiming that a newer edit was saved.
      const removed = remove()
      record = null; enabled = false
      error = removed ? message : '暂存失败且旧副本未能清理，请清除网站数据；输入仍在当前页'
      notify()
      return false
    }
    if (!storage || currentRevision === undefined) return failure('浏览器限制了暂存，输入仍在当前页；刷新前请自行复制')
    if (record && record.revision !== currentRevision) { reset(); return false }
    let next
    try {
      next = {version:1, owner, revision:currentRevision, savedAt, entries:schema.entries(entries), active:schema.active(active)}
    } catch { return failure('草稿超出暂存范围，输入仍在当前页；刷新前请自行复制或导出') }
    try {
      const encoded = JSON.stringify(next)
      if (encoded.length > schema.maxRecordChars) return failure('草稿超出暂存大小，输入仍在当前页；刷新前请自行复制或导出')
      storage.setItem(key, encoded)
      record = next; error = ''; notify()
      return true
    } catch { return failure('浏览器未能暂存，输入仍在当前页；刷新前请自行复制') }
  }
  function snapshot() {
    if (!owner || suspended || !enabled) return null
    const saved = load()
    if (!saved || saved.owner !== owner) {
      record = null; enabled = false; notify(); return null
    }
    record = saved
    return structuredClone(record)
  }
  return {
    bind(user) {
      const nextOwner = ownerKey(user)
      if (!nextOwner) { reset(); return }
      const saved = load()
      if (saved && saved.owner !== nextOwner) reset()
      owner = nextOwner; suspended = false
      record = saved?.owner === nextOwner ? saved : null
      enabled = Boolean(record); notify()
    },
    suspend() { owner = null; suspended = true; record = null; enabled = false; notify() },
    reset,
    setEnabled(value, entries = [], active = null) {
      if (!value) {
        const removed = remove()
        record = null; enabled = false
        error = removed ? '' : '浏览器未允许清理暂存，请清除网站数据；当前输入未删除'
        notify(); return removed
      }
      if (!owner || suspended) return false
      enabled = true
      return persist(entries, active)
    },
    save: (entries, active) => persist(entries, active),
    snapshot,
    matches(entries, active = null) {
      const saved = snapshot()
      try {
        return Boolean(saved && JSON.stringify(saved.entries) === JSON.stringify(schema.entries(entries))
          && JSON.stringify(saved.active) === JSON.stringify(schema.active(active)))
      } catch { return false }
    },
    // Called only after this tab's successful login has published a new revision.
    // External login/logout instead calls reset() and never rebinds old content.
    rebindRevision() {
      if (record && owner && !suspended && enabled) {
        record.revision = readRevision()
        persist(record.entries, record.active, record.savedAt)
      }
    },
    status: () => ({ enabled, error }),
  }
}
