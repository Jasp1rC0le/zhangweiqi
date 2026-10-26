import { dayNumber } from '../src/utils/timetable.js'
import { privateCourseDigest } from '../src/utils/privateCourseExport.js'
import { lessonChangeInput, lessonChangeQuery } from '../src/utils/teachingLessonChanges.js'
const digest = (value) => privateCourseDigest(new TextEncoder().encode(JSON.stringify(value)))
const dateMonday = (date) => {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay() || 7
  return new Date(Date.parse(date + 'T00:00:00Z') - (weekday - 1) * 86400000)
    .toISOString()
    .slice(0, 10)
}
// Actual DEV in-memory state transitions; never a fixed success or a production role grant.
export function createLessonChangeFixture({
  actor,
  time,
  courses,
  classes,
  actors,
  approved,
  lifecycle,
  administrativeClassFor,
  memberFor,
  dispatch,
  audit,
  fail,
}) {
  const root = '/api/admin/teaching/lesson-changes',
    receipts = new Map()
  const stamp = (c, end = false) => `${c.date}T${end ? c.end : c.start}:00+08:00`
  const label = (id) => {
    const a = actors.find((a) => a.id === id)
    return a ? `${a.username} · ${a.nickname}` : '原教师账号不可用'
  }
  const authorize = () => {
    if (actor().role !== 'ADMIN') fail(403, '需要正常本校模拟管理员')
    return actor().id
  }
  const sourceKey = (c) =>
    JSON.stringify([
      c,
      [...c.entries]
        .sort((a, b) => a.studentId.localeCompare(b.studentId))
        .map((e) => [e, lifecycle.get(e.studentId) || null]),
    ])
  async function target(id) {
    const c = courses.find((c) => c.id === id)
    if (!c) fail(404, '课程不在模拟本校范围')
    const b = classes.find((b) => b.id === c.classId)
    if (!b) fail(503, '原主办班基线缺失')
    for (const e of c.entries) {
      const admin = classes.find(
        (b) => b.id === (e.adminClassId || administrativeClassFor(e.studentId)?.id),
      )
      if (!admin || (e.college && e.college !== admin.college))
        fail(503, '原成员归属缺失，没有返回部分名单')
    }
    const value = {
      lessonId: c.id,
      courseId: c.courseId || c.id,
      revision: c.revision,
      rosterRevision: c.rosterRevision || 0,
      name: c.name,
      semester: c.semester || '模拟学期',
      firstMonday: c.firstMonday || dateMonday(c.date),
      classId: c.classId,
      classLabel: `${b.college} · ${b.name}`,
      groupName: c.groupName || b.name,
      teacherId: c.teacherId,
      teacherLabel: label(c.teacherId),
      date: c.date,
      startTime: c.start,
      endTime: c.end,
      room: c.room,
      members: c.entries.filter((e) => !e.withdrawn).length,
      enrollmentMode: c.mode || 'LEGACY',
      sourceHash: '',
    }
    value.sourceHash = await digest([value, sourceKey(c)])
    return { c, target: value, key: sourceKey(c) }
  }
  function conflicts(c, p) {
    const overlaps = courses.filter(
        (x) =>
          x.id !== c.id &&
          !x.cancelled &&
          Date.parse(stamp(x)) < Date.parse(`${p.date}T${p.endTime}:00+08:00`) &&
          Date.parse(stamp(x, true)) > Date.parse(`${p.date}T${p.startTime}:00+08:00`),
      ),
      people = new Set(c.entries.filter((e) => !e.withdrawn).map((e) => e.studentId))
    return [
      ['TEACHER', overlaps.filter((x) => x.teacherId === p.teacherId).length],
      [
        'ROOM',
        overlaps.filter(
          (x) => x.room.trim().toLocaleLowerCase() === p.room.trim().toLocaleLowerCase(),
        ).length,
      ],
      [
        'MEMBERS',
        overlaps.filter((x) => x.entries.some((e) => !e.withdrawn && people.has(e.studentId)))
          .length,
      ],
    ]
      .filter(([, n]) => n)
      .map(([kind, arrangements]) => ({ kind, arrangements }))
  }
  async function inspect(input) {
    const s = await target(input.lessonId)
    if (input.revision !== s.target.revision || input.sourceHash !== s.target.sourceHash)
      fail(409, '原课程、名单或归属已变化')
    const raw = lessonChangeInput(s.target, { ...input }, input.requestId)
    if (
      s.c.cancelled ||
      s.c.finalized ||
      Date.parse(stamp(s.c)) <= Date.parse(time()) + 300000 ||
      s.c.entries.some((e) => e.status !== 'UNKNOWN')
    )
      fail(409, '已记录、取消或进入课前5分钟，原课程保留')
    if (
      (raw.action === 'RESCHEDULE' && !s.target.members) ||
      s.target.members > 2000 ||
      s.c.entries.some((e) => !e.withdrawn && lifecycle.get(e.studentId)?.status === 'LEFT')
    )
      fail(409, '有效名单或学籍需先核对')
    let proposed = null,
      list = []
    if (raw.action === 'RESCHEDULE') {
      if (s.target.enrollmentMode === 'LEGACY')
        fail(409, '先核定历史课程为整班或逐人来源，不能借调课改变类型')
      if (
        s.target.enrollmentMode === 'ADMIN_CLASS' &&
        s.c.entries.some(
          (e) =>
            !e.withdrawn &&
            (e.adminClassId || administrativeClassFor(e.studentId)?.id) !== s.target.classId,
        )
      )
        fail(409, '整班成员行政归属需先核对')
      const teacher = actors.find((a) => a.id === raw.teacherId && a.schoolId === actor().schoolId)
      if (!teacher || !approved(teacher.id, 'TEACHER')) fail(403, '任课教师尚未通过审核')
      const week = Math.floor((dayNumber(raw.date) - dayNumber(s.target.firstMonday)) / 7) + 1
      if (week < 1 || week > 30) fail(400, '不能跨原学期30周调课')
      if (Date.parse(`${raw.date}T${raw.startTime}:00+08:00`) <= Date.parse(time()) + 300000)
        fail(409, '目标已进入课前5分钟或过去，未补造')
      if (
        raw.date === s.c.date &&
        raw.startTime === s.c.start &&
        raw.endTime === s.c.end &&
        raw.teacherId === s.c.teacherId &&
        raw.room === s.c.room
      )
        fail(409, '安排没有变化')
      proposed = {
        date: raw.date,
        startTime: raw.startTime,
        endTime: raw.endTime,
        teacherId: raw.teacherId,
        teacherLabel: label(raw.teacherId),
        room: raw.room,
      }
      list = conflicts(s.c, proposed)
    }
    const value = {
      original: s.target,
      proposed,
      action: raw.action,
      reason: raw.reason,
      fingerprint: await digest([raw.requestId, s.target, raw.action, proposed, raw.reason, list]),
      conflicts: list,
      warnings: [
        '仅这一节；原其他周次和旧考勤保留。',
        '保留原课程类型：整班按学籍规则联动，逐人选修不自动拉入整班。',
        '仅核本站教学，不含他人私人导入或外部教务。',
      ],
    }
    return { ...s, input: raw, preview: value }
  }
  return {
    async handle(config) {
      if (!config.url.startsWith(root)) return null
      const principal = authorize(),
        still = () => {
          if (principal !== actor().id || config.signal?.aborted)
            fail(409, '模拟账号已变化，旧请求没有保存')
        },
        reply = (data) => ({
          data: structuredClone(data),
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }),
        data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
        p = config.params || {}
      if (config.url === root + '/access')
        return reply({ enabled: true, maxMembers: 2000, changeScope: 'ONE_FUTURE_LESSON' })
      if (config.url === root + '/page') {
        const q = lessonChangeQuery({
            from: p.from,
            to: p.to,
            page: Number(p.page || 0),
            size: Number(p.size || 25),
            search: String(p.search || ''),
          }),
          items = courses
            .filter(
              (c) =>
                !c.cancelled &&
                c.date >= q.from &&
                c.date <= q.to &&
                Date.parse(stamp(c)) > Date.parse(time()) + 300000 &&
                (!q.search ||
                  [
                    c.name,
                    c.semester || '模拟学期',
                    c.groupName || '',
                    c.room,
                    label(c.teacherId),
                  ].some((v) => v.toLocaleLowerCase().includes(q.search.toLocaleLowerCase()))),
            )
            .sort((a, b) => stamp(a).localeCompare(stamp(b)) || a.id.localeCompare(b.id)),
          total = items.length,
          totalPages = Math.ceil(total / q.size)
        if (q.page && q.page >= totalPages) fail(409, '清单已变化，请回第一页')
        return reply({
          ...q,
          total,
          totalPages,
          items: items.slice(q.page * q.size, (q.page + 1) * q.size).map((c) => ({
            lessonId: c.id,
            course: c.name,
            semester: c.semester || '模拟学期',
            className: c.groupName || classes.find((b) => b.id === c.classId)?.name || '',
            teacher: label(c.teacherId),
            room: c.room,
            startsAt: stamp(c),
            endsAt: stamp(c, true),
            revision: c.revision,
            blockedReason:
              c.finalized || c.entries.some((e) => e.status !== 'UNKNOWN')
                ? '已有点名记录，不能直接调停课'
                : '',
          })),
        })
      }
      const read = /\/target\/([a-f0-9-]{36})$/.exec(config.url),
        request = /\/requests\/([a-f0-9-]{36})$/.exec(config.url)
      if (read) {
        const s = await target(read[1])
        still()
        return reply(s.target)
      }
      if (request) {
        const saved = receipts.get(request[1])
        if (!saved || saved.actor !== principal) fail(404, '尚未查到本次回执，不证明没有执行')
        return reply(saved.receipt)
      }
      if (!['post'].includes(config.method)) fail(404, '模拟调停课接口不存在')
      if (
        !data ||
        Object.keys(data).some(
          (k) =>
            ![
              'requestId',
              'lessonId',
              'revision',
              'sourceHash',
              'action',
              'date',
              'startTime',
              'endTime',
              'teacherId',
              'room',
              'reason',
              'previewHash',
            ].includes(k),
        )
      )
        fail(400, '模拟变更字段无效')
      const saved = receipts.get(data.requestId),
        key = JSON.stringify(data)
      if (config.url === root && saved) {
        if (saved.actor !== principal || saved.key !== key) fail(409, '请求编号已用于其他内容')
        return reply(saved.receipt)
      }
      const s = await inspect(data)
      still()
      if (config.url === root + '/preview') return reply(s.preview)
      if (config.url !== root) fail(404, '模拟调停课接口不存在')
      if (
        data.previewHash !== s.preview.fingerprint ||
        s.key !== sourceKey(s.c) ||
        s.preview.conflicts.length ||
        (s.preview.proposed && conflicts(s.c, s.preview.proposed).length)
      )
        fail(409, '目标、名单或冲突已变化，没有保存')
      const recipientMap=new Map()
      for(const entry of s.c.entries.filter(e=>!e.withdrawn&&(lifecycle.get(e.studentId)?.status||'ACTIVE')==='ACTIVE')){
        const id=memberFor(entry.studentId)?.userId
        if(id&&actors.some(a=>a.id===id))recipientMap.set(id,'STUDENT')
      }
      const nextTeacher=s.preview.proposed?.teacherId??s.target.teacherId
      if(nextTeacher&&approved(nextTeacher,'TEACHER'))recipientMap.set(nextTeacher,recipientMap.has(nextTeacher)?'BOTH':'TEACHER')
      if(s.target.teacherId!==nextTeacher&&approved(s.target.teacherId,'TEACHER')&&!recipientMap.has(s.target.teacherId))recipientMap.set(s.target.teacherId,'RELEASED')
      const changeRecipients=[...recipientMap].map(([userId,kind])=>({id:crypto.randomUUID(),userId,kind}))
      let replacementCourseId = null,
        replacementLessonId = null
      if (data.action === 'RESCHEDULE') {
        replacementCourseId = crypto.randomUUID()
        replacementLessonId = crypto.randomUUID()
        courses.push({
          ...structuredClone(s.c),
          id: replacementLessonId,
          courseId: replacementCourseId,
          date: data.date,
          start: data.startTime,
          end: data.endTime,
          teacherId: data.teacherId,
          room: data.room.trim(),
          semester: s.target.semester,
          firstMonday: s.target.firstMonday,
          groupName: s.target.groupName,
          mode: s.target.enrollmentMode,
          revision: 0,
          rosterRevision: 0,
          cancelled: false,
          finalized: false,
          entries: structuredClone(s.c.entries.filter((e) => !e.withdrawn)).map((e) => ({
            ...e,
            status: 'UNKNOWN',
            withdrawn: false,
          })),
        })
      }
      s.c.cancelled = true
      s.c.revision++
      const receipt = {
        requestId: data.requestId,
        actorId: principal,
        action: data.action,
        original: s.target,
        replacementCourseId,
        replacementLessonId,
        proposed: s.preview.proposed,
        revision: s.c.revision,
        reason: data.reason.trim(),
        recordedAt: new Date(time()).toISOString(),
      }
      receipts.set(data.requestId, { actor: principal, key, receipt })
      audit.push({
        action: 'LESSON_CHANGE',
        actorId: principal,
        requestId: data.requestId,
        lessonId: s.c.id,
        reason: receipt.reason,
        at: receipt.recordedAt,
        receipt: structuredClone(receipt),
        changeRecipients,
      })
      dispatch()
      return reply(receipt)
    },
  }
}
