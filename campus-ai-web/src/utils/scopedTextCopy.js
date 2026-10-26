// A browser write cannot be retracted. The lease controls feedback and fallback text only.
export function createScopedTextCopy({ key, available, text, state, write, successNotice, failureNotice }) {
  let generation = 0, disposed = false
  function reset() { generation++; Object.assign(state, { busy: false, notice: '', manualText: '' }) }
  async function copy() {
    if (disposed || !available() || !key() || state.busy) return false
    const captured = text()
    if (!captured) return false
    const started = ++generation, scope = key()
    const current = () => !disposed && generation === started && key() === scope && available()
    state.busy = true; state.notice = ''; state.manualText = ''
    try {
      await write(captured)
      if (!current()) return false
      state.notice = successNotice
      return true
    } catch {
      if (current()) { state.manualText = captured; state.notice = failureNotice }
      return false
    } finally { if (started === generation) state.busy = false }
  }
  return { copy, reset, dispose() { reset(); disposed = true } }
}
