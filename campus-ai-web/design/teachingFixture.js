import { attendanceSummary, ATTENDANCE_STATUSES } from '../src/utils/teaching.js'
import { chinaDate, addDays } from '../src/utils/timetable.js'
// DEV-only synthetic data. Never seed a real account, roster or teaching grant.
export function createTeachingFixture(initialView = 'TEACHER') {
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const today = chinaDate(), now = new Date()
  const members = Array.from({ length: 6 }, (_, i) => ({ studentId: id(100 + i), studentNumber: `demo-${String(i + 1).padStart(3, '0')}`, name: `示例同学${String(i + 1).padStart(2, '0')}`, status: i === 0 ? 'ON_TIME' : i === 1 ? 'LATE' : 'UNKNOWN' }))
  const courses = [
    { id: id(1), course: '计算机网络基础（模拟）', className: '物联网示例班一', college: '示例学院甲', teacher: '示例教师甲', room: 'F5-511（示例）', startsAt: new Date(now.getTime() - 20 * 60000).toISOString(), endsAt: new Date(now.getTime() + 80 * 60000).toISOString(), revision: 0, finalized: false, cancelled: false },
    { id: id(2), course: '微处理器原理（模拟）', className: '物联网示例班二', college: '示例学院甲', teacher: '示例教师甲', room: 'F2-306（示例）', startsAt: `${addDays(today, 1)}T10:00:00+08:00`, endsAt: `${addDays(today, 1)}T11:40:00+08:00`, revision: 0, finalized: false, cancelled: false },
    { id: id(3), course: '设计基础（模拟）', className: '设计示例班', college: '示例学院乙', teacher: '示例教师乙', room: '教室示例B', startsAt: `${today}T14:00:00+08:00`, endsAt: `${today}T15:40:00+08:00`, revision: 0, finalized: false, cancelled: false },
  ]
  const entries = new Map(courses.map((l, i) => [l.id, structuredClone(members).map(m => ({ ...m, status: i === 0 ? m.status : 'UNKNOWN' }))]))
  const views = ['STUDENT', 'TEACHER', 'COUNSELOR', 'SECRETARY']
  let selectedView = views.includes(initialView) ? initialView : 'TEACHER'
  const notices = []
  const classes = courses.map((l, i) => ({ id: id(1000 + i), college: l.college, name: l.className, members: 6, linked: 1 }))
  const classMembers = new Map(classes.map(c => [c.id, members.map((m, i) => ({ id: m.studentId, studentNumber: m.studentNumber, name: m.name, userId: i === 0 ? 2 : null }))]))
  const canRead = (l, view) => view === 'SECRETARY' ? l.college === '示例学院甲' : view === 'TEACHER' ? l.teacher === '示例教师甲' : l.className === '物联网示例班一'
  const selectedEntries = (l, view) => view === 'STUDENT' ? entries.get(l.id).slice(0, 1) : entries.get(l.id)
  function enrich(l, view) {
    const counts = { unknown: 0, onTime: 0, late: 0, absent: 0, excused: 0 }
    const keys = { UNKNOWN: 'unknown', ON_TIME: 'onTime', LATE: 'late', ABSENT: 'absent', EXCUSED: 'excused' }
    for (const row of selectedEntries(l, view)) counts[keys[row.status]]++
    return { ...l, counts }
  }
  const failure = (status, message) => { throw { response: { status, data: { message } } } }
  async function adapter(config) {
    const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    const response = value => ({ data: value, status: 200, statusText: 'OK', headers: {}, config })
    if (config.url === '/api/admin/teaching/classes') {
      if (config.method === 'post') { classes.push({ id: data.id, college: data.college, name: data.name, members: data.members.length, linked: 0 }); classMembers.set(data.id, data.members.map((m, i) => ({ ...m, id: id(2000 + i) }))); return response({ id: data.id }) }
      return response(structuredClone(classes))
    }
    const configMembers = /^\/api\/admin\/teaching\/classes\/([0-9a-f-]+)\/members$/.exec(config.url)
    if (configMembers) return response(structuredClone(classMembers.get(configMembers[1]) || []))
    if (config.url === '/api/admin/teaching/courses' || config.url === '/api/admin/teaching/grants') return response({ id: data.id })
    const binding = /^\/api\/admin\/teaching\/members\/([0-9a-f-]+)\/account$/.exec(config.url)
    if (binding) { const member = [...classMembers.values()].flat().find(m => m.id === binding[1]); if (!member) failure(404, '模拟名单目标不存在'); if (member.userId !== data.expectedUserId) failure(409, '模拟绑定版本变化'); member.userId = data.userId; return response(null) }
    if (config.url === '/api/teaching/access') return response({ enabled: true, views: [selectedView, ...views.filter(v => v !== selectedView)] })
    if (config.url === '/api/teaching/lessons') {
      selectedView = config.params.view
      return response(courses.filter(l => canRead(l, selectedView) && chinaDate(new Date(l.startsAt)) >= config.params.from && chinaDate(new Date(l.startsAt)) <= config.params.to).map(l => enrich(l, selectedView)))
    }
    if (config.url === '/api/teaching/notices') return response(notices)
    if (config.url.startsWith('/api/teaching/notices/')) return response(null)
    if (config.url === '/api/teaching/my-day') return response({ date: config.params.date, source: '本人教学课程安排（模拟）', answer: `模拟课程安排：\n\n- 计算机网络基础；F5-511（示例）；任课教师：示例教师甲\n\n只用于布局与流程验收，不是真实课表。` })
    const match = /^\/api\/teaching\/lessons\/([0-9a-f-]+)(\/attendance)?$/.exec(config.url)
    if (!match) return null
    const l = courses.find(l => l.id === match[1])
    if (!l) failure(404, '模拟课程不存在')
    const role = config.method === 'put' ? selectedView : config.params.view
    if (!canRead(l, role)) failure(404, '不在模拟负责范围')
    if (config.method === 'put') {
      if (role !== 'TEACHER') failure(403, '只有模拟任课教师可以点名')
      if (data.revision !== l.revision) failure(409, '模拟版本冲突')
      const previous = entries.get(l.id)
      if (data.marks.some(m => !(m.status in ATTENDANCE_STATUSES) || !previous.some(e => e.studentId === m.studentId))) failure(400, '模拟状态或目标无效')
      if (data.marks.some(m => { const p = previous.find(e => e.studentId === m.studentId); return p.status !== 'UNKNOWN' && p.status !== m.status }) && !data.reason) failure(400, '更正需要原因')
      const next = previous.map(e => ({ ...e, status: data.marks.find(m => m.studentId === e.studentId)?.status || e.status }))
      if (data.finish && next.some(e => e.status === 'UNKNOWN')) failure(400, '仍有待点名同学')
      const finalized=(l.finalized || data.finish) && !next.some(e=>e.status==='UNKNOWN')
      const changed=finalized!==l.finalized || next.some((e,i)=>e.status!==previous[i].status)
      entries.set(l.id, next); if(changed) l.revision++; l.finalized=finalized
      // Real database audit and timed reminders are tested in the backend, not claimed by this fixture.
      attendanceSummary([enrich(l, role)])
    }
    const canMark=role==='TEACHER' && !l.cancelled && Date.now()>=Date.parse(l.startsAt)-300000
    return response({ lesson: enrich(l, role), entries: structuredClone(selectedEntries(l, role)),canMark,canRecordAbsence:canMark && Date.now()>=Date.parse(l.startsAt) })
  }
  return { adapter }
}
