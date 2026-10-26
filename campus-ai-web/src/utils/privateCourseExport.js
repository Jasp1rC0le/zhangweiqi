import { validatedCourseSnapshot } from './privateCourseSchedule.js'
import { parseCourseJson } from './courseImport.js'

const encoder = new TextEncoder()
export function privateCourseReadState(state) {
  if (state.loading) return 'waiting'
  if (state.error || !state.loaded) return 'error'
  return state.schedule ? 'saved' : 'empty'
}
export async function privateCourseDigest(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不能完成文件校验，请使用支持本地校验的浏览器；未导出')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
}
export function privateCourseFile(snapshot) {
  const checked = validatedCourseSnapshot(snapshot)
  if (!checked) throw new Error('当前账号还没有已保存的个人课表，请先导入并确认保存')
  // Never spread an API response into a file: no owner, account, token, roster or future unknown field.
  const value = { semester: checked.semester, firstMonday: checked.firstMonday, remindDays: checked.remindDays,
    revision: checked.revision, importedAt: checked.importedAt, checkedAt: checked.checkedAt, courses: checked.courses }
  const text = JSON.stringify(value) + '\n'
  const bytes = encoder.encode(text)
  if (bytes.byteLength > 100000) throw new Error('完整课表超过100KB导入文件上限，未截断或生成不完整文件')
  const restored = parseCourseJson(text)
  if (restored.courses.length !== checked.courses.length) throw new Error('课表往返校验不一致，未生成文件')
  return { text, bytes, count: checked.courses.length, semester: checked.semester, revision: checked.revision, firstMonday: checked.firstMonday }
}

export function createPrivateCourseExport({ owner, active = () => true, state, read, onFile,
  now = () => Date.now(), digest = privateCourseDigest }) {
  let generation = 0, controller, prepared
  function reset() {
    generation++
    controller?.abort()
    prepared = null
    Object.assign(state, { busy: false, preview: null, error: '', notice: '' })
  }
  async function step(download) {
    if (state.busy || !owner() || !active()) return false
    if (download && (!prepared || prepared.owner !== owner() || now() >= prepared.expiresAt)) {
      reset(); state.error = '准备已失效，请重新读取本人课表后再导出'; return false
    }
    const original = download ? prepared : null
    if (!download) reset()
    const principal = owner(), started = ++generation
    controller = new AbortController()
    const signal = controller.signal
    const current = () => !signal.aborted && started === generation && principal === owner() && active()
    state.busy = true; state.error = ''; state.notice = ''
    try {
      const response = await read(signal) // Existing normal authenticated GET; never accept a user id from chat/query.
      if (!current()) return false
      const file = privateCourseFile(response?.data?.schedule)
      const sha256 = await digest(file.bytes)
      if (!current()) return false
      if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('本机文件校验未完成，未交给下载')
      if (download) {
        if (now() >= original.expiresAt) throw new Error('准备已到期，请重新准备；没有下载旧文件')
        if (original.sha256 !== sha256 || original.text !== file.text) throw new Error('已保存课表发生变化，请重新准备并核对；没有下载旧文件')
        // There are no awaits between the final owner check and the explicit browser handoff.
        if (!current()) return false
        onFile(new Blob([file.bytes], { type: 'application/json;charset=utf-8' }), '我的课表.json')
        prepared = null; state.preview = null
        state.notice = `已核验 ${file.count} 项安排并交给浏览器下载，请检查文件。未修改课表，也未归档。`
      } else {
        prepared = { owner: principal, text: file.text, sha256, expiresAt: now() + 300000 }
        state.preview = { count: file.count, semester: file.semester, revision: file.revision,
          firstMonday: file.firstMonday, sha256, expiresAt: prepared.expiresAt }
      }
      return true
    } catch (failure) {
      if (current()) {
        prepared = null; state.preview = null
        const status = failure?.response?.status
        const network = /Network|timeout|offline|aborted|canceled/i.test(failure?.message || '')
        state.error = status === 401 || status === 403 ? '登录或读取权限已失效，未导出；请重新登录后核对' : status === 429 || status === 503 ? '读取暂时繁忙，未导出；请稍后重新准备' : network ? '网络中断或读取超时，未导出；请重新准备' : failure?.response ? '无法重新读取本人课表，未导出；请保留当前数据并稍后重试' : failure?.message || '未能读取和校验本人课表，未导出，请重新准备'
      }
      return false
    } finally {
      if (started === generation) state.busy = false
    }
  }
  return { reset, prepare: () => step(false), download: () => step(true) }
}
