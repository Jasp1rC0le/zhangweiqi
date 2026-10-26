import { createConfigPager } from './teachingConfigPage.js'
import { isEnrollmentId } from './teachingIds.js'
const views = new Set(['STUDENT', 'TEACHER', 'COUNSELOR', 'SECRETARY', 'ADMIN'])

// Reuse the authenticated bounded selected lookup, never guess from a label or first-page item.
export function createGovernanceClassSelection({ scope, state, read }) {
  let generation = 0, disposed = false
  const pager = createConfigPager({ owner: scope, state, read })
  function reset() { generation++; pager.reset() }
  async function resolve(view, classId) {
    reset()
    const started = generation, principal = scope()
    if (disposed || !principal) return null
    if (!views.has(view) || !isEnrollmentId(classId)) { state.error = '班级或查看身份无效，请重新选择；未读取其他班级'; return null }
    const ok = await pager.load({ kind: 'CLASS', view, page: 0, size: 25, search: '', selected: classId })
    if (disposed || generation !== started || principal !== scope()) return null
    if (!ok) return null
    if (state.selected?.value !== classId) { state.error = '所选班级没有得到明确确认，请重新选择；未读取其他班级'; state.selected = null; return null }
    return { ...state.selected }
  }
  return { resolve, reset, dispose() { disposed = true; reset() } }
}
