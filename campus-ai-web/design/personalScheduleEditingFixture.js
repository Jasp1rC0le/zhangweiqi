import { normalizeCourses, validateCourseMetadata } from '../src/utils/courseSchedule.js'
export function createPersonalScheduleEditingFixture({ actor, schedules, time }) {
  const terms = new Map(),
    history = new Map(),
    receipts = new Map()
  const copy = (value) => structuredClone(value),
    fail = (status, message) => {
      throw { response: { status, data: { message } } }
    }
  function sync(user) {
    const key = `${user.schoolId}:${user.id}`
    if (!terms.has(key)) {
      terms.set(key, new Map())
      history.set(key, new Map())
    }
    const current = schedules.get(user.id)
    if (current) {
      terms.get(key).set(current.firstMonday, copy(current))
      if (!history.get(key).has(current.revision))
        history.get(key).set(current.revision, {
          snapshot: copy(current),
          reason: '模拟已有副本基线',
          action: 'BASELINE',
        })
    }
    return key
  }
  const handle = (config, data, reply) => {
    if (!config.url.startsWith('/api/timetable/personal-editing')) return null
    const user = actor()
    if (!user?.id) fail(401, '请登录模拟账号')
    const key = sync(user),
      owned = terms.get(key),
      past = history.get(key)
    if (config.url === '/api/timetable/personal-editing' && config.method === 'get')
      return reply({
        historyEnabled: true,
        terms: [...owned.values()].sort((a, b) => b.firstMonday.localeCompare(a.firstMonday)),
      })
    if (config.url === '/api/timetable/personal-editing/history') {
      const page = Number(config.params?.page || 0),
        items = [...past.values()]
          .sort((a, b) => b.snapshot.revision - a.snapshot.revision)
          .map((r) => ({
            revision: r.snapshot.revision,
            semester: r.snapshot.semester,
            firstMonday: r.snapshot.firstMonday,
            action: r.action,
            reason: r.reason,
            createdAt: r.snapshot.importedAt,
          }))
      return reply({
        items: items.slice(page * 25, (page + 1) * 25),
        total: items.length,
        page,
        size: 25,
      })
    }
    if (config.url.includes('/history/')) {
      const row = past.get(Number(config.url.split('/').at(-1)))
      if (!row) fail(404, '没有本人的模拟历史')
      return reply(row.snapshot)
    }
    if (config.url.includes('/requests/')) {
      const row = receipts.get(`${key}:${config.url.split('/').at(-1)}`)
      if (!row) fail(404, '原模拟回执尚未找到')
      return reply(row.receipt)
    }
    if (config.url === '/api/timetable/personal-editing' && config.method === 'post') {
      if (
        !data?.requestId ||
        !data.payload?.reason?.trim() ||
        !Array.isArray(data.payload.terms) ||
        data.payload.terms.length < 1 ||
        data.payload.terms.length > 2
      )
        fail(400, '模拟编辑内容不完整')
      const fingerprint = JSON.stringify(data.payload),
        requestKey = `${key}:${data.requestId}`,
        previous = receipts.get(requestKey)
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail(409, '模拟同一请求内容已变')
        return reply(previous.receipt)
      }
      const planned = data.payload.terms.map((term) => {
        validateCourseMetadata(term)
        if (term.revision !== (owned.get(term.firstMonday)?.revision || 0))
          fail(409, '模拟原学期版本已变化')
        return { ...term, courses: term.courses.length ? normalizeCourses(term.courses) : [] }
      })
      if (new Set(planned.map((t) => t.firstMonday)).size !== planned.length)
        fail(400, '模拟重复学期')
      let revision = Math.max(0, ...past.keys()),
        last
      for (const term of planned) {
        last = {
          ...term,
          revision: ++revision,
          importedAt: time(),
          checkedAt: time(),
          emptyConfirmed: term.courses.length === 0,
        }
        owned.set(term.firstMonday, copy(last))
        past.set(revision, { snapshot: copy(last), reason: data.payload.reason, action: 'SAVE' })
      }
      schedules.set(user.id, copy(last))
      const receipt = {
        requestId: data.requestId,
        kind: 'PERSONAL_SCHEDULE',
        result: { schedule: copy(last) },
      }
      receipts.set(requestKey, { fingerprint, receipt })
      return reply(receipt)
    }
    fail(405, '模拟课表接口不接受这个操作')
  }
  handle.forWeek = (user, monday) => {
    const key = sync(user),
      all = [...terms.get(key).values()]
    if (!all.length) return null
    const start = Date.parse(`${monday}T00:00:00Z`),
      courses = []
    for (const term of all) {
      const week = Math.floor((start - Date.parse(`${term.firstMonday}T00:00:00Z`)) / 604800000) + 1
      for (const c of term.courses)
        if (c.weeks.includes(week)) courses.push({ ...copy(c), weeks: [1] })
    }
    return {
      ...copy(all[0]),
      firstMonday: monday,
      courses,
      revision: Math.max(...all.map((t) => t.revision)),
      emptyConfirmed: courses.length === 0,
    }
  }
  handle.nextRevision = (user) => {
    const key = sync(user)
    return Math.max(0, ...history.get(key).keys()) + 1
  }
  handle.hasSavedTerm = (user) => terms.get(sync(user)).size > 0
  handle.clearCurrent = (user) => {
    const key = sync(user),
      current = schedules.get(user.id)
    if (!current) return
    const empty = {
      ...copy(current),
      revision: handle.nextRevision(user),
      courses: [],
      emptyConfirmed: true,
      importedAt: time(),
      checkedAt: time(),
    }
    terms.get(key).set(current.firstMonday, empty)
    history
      .get(key)
      .set(empty.revision, {
        snapshot: copy(empty),
        reason: '模拟本人清空副本，历史保留',
        action: 'SAVE',
      })
  }
  return handle
}
