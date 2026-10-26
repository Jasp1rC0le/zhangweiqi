import {
  courseKey,
  normalizeCourse,
  normalizeCourses,
  parseCourseWeeks,
  validateCourseMetadata,
  courseConflicts,
  courseTimeLabel,
} from './courseSchedule.js'
import { validatedCourseSnapshot } from './privateCourseSchedule.js'
const day = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('日期须为完整的年-月-日。')
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value)
    throw new Error('日期不存在。')
  return Math.floor(+date / 86400000)
}
const rows = (value) => (value.length ? normalizeCourses(value) : [])
const dto = (snapshot) => ({
  revision: snapshot.revision,
  semester: snapshot.semester,
  firstMonday: snapshot.firstMonday,
  remindDays: snapshot.remindDays,
  courses: rows(snapshot.courses),
})
export function planPersonalOperation(source, keys, form, destination = null) {
  const snapshot = validatedCourseSnapshot(source),
    selected = snapshot?.courses.filter((c) => keys.includes(courseKey(c))) || []
  if (!selected.length || selected.length !== new Set(keys).size)
    throw new Error('请先勾选准确的本人安排；目标已经变化时须重读。')
  if (!['DATE', 'BATCH', 'DELETE', 'MOVE_TERM', 'COPY_TERM'].includes(form.operation))
    throw new Error('请选择修改方式。')
  const reason = String(form.reason || '').trim()
  if (!reason || reason.length > 500) throw new Error('请填写500字以内的修改原因。')
  let remaining = snapshot.courses.filter((c) => !keys.includes(courseKey(c))),
    changed = [],
    target = destination ? validatedCourseSnapshot(destination) : null
  const describe = (c) =>
    `${c.name} · 周${'一二三四五六日'[c.weekday - 1]} ${courseTimeLabel(c)} · ${c.room || '未填教室'} · 任课教师${c.teacher || '未录入'} · 第${c.weeks.join('、')}周`
  const before = selected.map((c) => `原：${describe(c)}`)
  if (form.operation === 'DATE') {
    const date = day(form.fromDate),
      originalWeek = Math.floor((date - day(snapshot.firstMonday)) / 7) + 1,
      weekday = ((((date + 3) % 7) + 7) % 7) + 1
    if (selected.some((c) => c.weekday !== weekday || !c.weeks.includes(originalWeek)))
      throw new Error('所选原安排并不都在这个日期上课；没有猜测上课周。')
    const next = day(form.toDate),
      week = Math.floor((next - day(snapshot.firstMonday)) / 7) + 1,
      newDay = ((((next + 3) % 7) + 7) % 7) + 1
    if (week < 1 || week > 30) throw new Error('新日期不在本学期30周范围，请使用跨学期操作。')
    for (const original of selected) {
      const weeks = original.weeks.filter((w) => w !== originalWeek)
      if (weeks.length) remaining.push({ ...original, weeks })
      changed.push(
        normalizeCourse({
          ...original,
          weekday: newDay,
          weeks: [week],
          ...(form.room.trim() ? { room: form.room.trim() } : {}),
          ...((form.teacher || '').trim() ? { teacher: form.teacher.trim() } : {}),
          ...(form.startTime || form.endTime
            ? {
                startPeriod: undefined,
                endPeriod: undefined,
                startTime: form.startTime,
                endTime: form.endTime,
              }
            : {}),
        }),
      )
    }
  } else if (form.operation === 'BATCH') {
    const scope = form.weeks.trim() ? parseCourseWeeks(form.weeks) : null
    for (const original of selected) {
      const weeks = scope || original.weeks
      if (weeks.some((w) => !original.weeks.includes(w)))
        throw new Error('批量修改的周次必须存在于每一项所选安排。')
      const keep = original.weeks.filter((w) => !weeks.includes(w))
      if (keep.length) remaining.push({ ...original, weeks: keep })
      changed.push(
        normalizeCourse({
          ...original,
          weeks,
          ...(form.room.trim() ? { room: form.room.trim() } : {}),
          ...((form.teacher || '').trim() ? { teacher: form.teacher.trim() } : {}),
          ...(form.weekday ? { weekday: Number(form.weekday) } : {}),
          ...(form.startTime || form.endTime
            ? {
                startPeriod: undefined,
                endPeriod: undefined,
                startTime: form.startTime,
                endTime: form.endTime,
              }
            : {}),
        }),
      )
    }
  } else if (form.operation.endsWith('_TERM')) {
    const meta = target || {
      revision: 0,
      semester: form.semester,
      firstMonday: form.firstMonday,
      remindDays: 7,
      courses: [],
    }
    validateCourseMetadata(meta)
    if (meta.firstMonday === snapshot.firstMonday) throw new Error('目标必须是另一个明确学期。')
    target = meta
    const weeks = parseCourseWeeks(form.targetWeeks)
    changed = selected.map((c) => ({ ...c, weeks }))
  }
  const unique = (courses) => {
    if (courses.length > 120 || new Set(courses.map(courseKey)).size !== courses.length)
      throw new Error('结果超120项或包含重复安排；没有截断、合并或覆盖。')
    return rows(courses)
  }
  let terms
  if (target) {
    const merged = unique([...target.courses, ...changed])
    if (courseConflicts(merged).length > courseConflicts(target.courses).length)
      throw new Error('目标学期出现新时间冲突，请先核对。')
    terms = [
      ...(form.operation === 'MOVE_TERM' ? [{ ...dto(snapshot), courses: unique(remaining) }] : []),
      { ...dto(target), courses: merged },
    ]
  } else {
    const updated = unique([...remaining, ...changed])
    // Compare conflicting pairs, not just the total number of conflicts.
    const conflictKey = course => courseKey({ ...course, teacher: '' })
    const oldPairs = new Set(
      courseConflicts(snapshot.courses).map((c) =>
        [conflictKey(snapshot.courses[c.a]), conflictKey(snapshot.courses[c.b]), c.weeks.join(',')]
          .sort()
          .join('|'),
      ),
    )
    if (
      courseConflicts(updated).some(
        (c) =>
          !oldPairs.has(
            [conflictKey(updated[c.a]), conflictKey(updated[c.b]), c.weeks.join(',')].sort().join('|'),
          ),
      )
    )
      throw new Error('结果新增或改变时间冲突，请先核对。')
    terms = [{ ...dto(snapshot), courses: updated }]
  }
  if (
    terms.length === 1 &&
    terms[0].firstMonday === snapshot.firstMonday &&
    JSON.stringify(terms[0].courses) === JSON.stringify(rows(snapshot.courses))
  )
    throw new Error('内容没有变化。')
  return {
    payload: { terms, reason },
    lines: [
      `原学期：${snapshot.semester}（${snapshot.firstMonday}起）`,
      ...before,
      ...changed.map((c) => `新：${describe(c)}`),
      form.operation === 'DATE'
        ? `仅${form.fromDate} → ${form.toDate}；其他日期保留。`
        : form.operation === 'DELETE'
          ? `删除所选${selected.length}项的全部已列周次；旧版本仍保留，可恢复。`
          : target
            ? `${form.operation === 'MOVE_TERM' ? '移动' : '复制'}到${target.semester}（${target.firstMonday}起），第${form.targetWeeks}周；不改正式教学。`
            : `修改所选${selected.length}项，未选安排保留。`,
      ...terms.map((t) => `${t.semester}：保存后${t.courses.length}项安排`),
      `原因：${reason}`,
    ],
  }
}
export function planPersonalRestore(historical, current) {
  const value = validatedCourseSnapshot(historical)
  return {
    terms: [{ ...dto(value), revision: current?.revision || 0 }],
    reason: `本人恢复历史版本${value.revision}；当前版本与全部历史继续保留`,
  }
}
