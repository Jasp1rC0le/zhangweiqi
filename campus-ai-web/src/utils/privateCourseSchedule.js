// Account-scoped private state, no localStorage, model or public knowledge requests.
import { normalizeCourses, validateCourseMetadata } from './courseSchedule.js'
export function validatedCourseSnapshot(snapshot) {
  if (snapshot === null) return null
  if (
    !snapshot ||
    !Number.isInteger(snapshot.revision) ||
    snapshot.revision < 1 ||
    snapshot.revision > 1000000 ||
    !Number.isFinite(Date.parse(snapshot.importedAt)) ||
    !Number.isFinite(Date.parse(snapshot.checkedAt))
  )
    throw new Error('课程表格响应不完整')
  validateCourseMetadata(snapshot)
  return { ...snapshot, courses: snapshot.emptyConfirmed === true && Array.isArray(snapshot.courses) && snapshot.courses.length === 0 ? [] : normalizeCourses(snapshot.courses) }
}
export function createPrivateCourseSchedule({ owner, state, read }) {
  let generation = 0,
    controller,
    pending
  function reset() {
    generation++
    controller?.abort()
    pending = null
    Object.assign(state, { schedule: null, loaded: false, loading: false, error: '' })
  }
  function adopt(schedule, principal) {
    if (!principal || principal !== owner()) return false
    const checked = validatedCourseSnapshot(schedule)
    generation++
    controller?.abort()
    pending = null
    Object.assign(state, { schedule: checked, loaded: true, loading: false, error: '' })
    return true
  }
  async function load(force = false) {
    if (!owner()) return
    if (!force && pending) return pending
    if (!force && state.loaded) return
    controller?.abort()
    controller = new AbortController()
    const signal = controller.signal,
      started = ++generation,
      principal = owner()
    state.loading = true
    state.error = ''
    const task = (async () => {
      try {
        const response = await read(signal)
        if (signal.aborted || generation !== started || principal !== owner()) return
        state.schedule = validatedCourseSnapshot(response?.data?.schedule)
        state.loaded = true
      } catch {
        if (signal.aborted || generation !== started || principal !== owner()) return
        state.error = '暂时无法读取课程表格，请重试；已保存数据不会因此删除'
      } finally {
        if (generation === started) {
          state.loading = false
          pending = null
        }
      }
    })()
    pending = task
    return task
  }
  return { reset, adopt, load }
}
