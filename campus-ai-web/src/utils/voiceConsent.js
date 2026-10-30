const VERSION = 1
const PREFIX = 'campthink.voice.consent.v1:'
export function voiceConsentOwner(scope) {
  if (typeof scope !== 'string') return ''
  const match = /^([1-9]\d{0,18}):([1-9]\d{0,18})(?::|$)/.exec(scope)
  return match ? `${match[1]}:${match[2]}` : ''
}
function key(owner) { return /^([1-9]\d{0,18}):([1-9]\d{0,18})$/.test(owner || '') ? PREFIX + owner : '' }
export function readVoiceConsent(storage, owner) {
  const name = key(owner)
  if (!name) return false
  try {
    const raw = storage?.getItem(name)
    if (typeof raw !== 'string' || raw.length > 128) return false
    const value = JSON.parse(raw)
    return value?.version === VERSION && value.allowed === true
  } catch { return false }
}
export function storeVoiceConsent(storage, owner, allowed) {
  const name = key(owner)
  if (!name || !storage) return false
  try {
    if (allowed) storage.setItem(name, JSON.stringify({version:VERSION,allowed:true}))
    else storage.removeItem(name)
    return true
  } catch { return false }
}
