import { chinaDate, mondayOf, addDays, dayNumber } from '../src/utils/timetable.js'
import { createPersonalScheduleEditingFixture } from './personalScheduleEditingFixture.js'
import { createGovernanceFixture } from './teachingGovernanceFixture.js'
import { createCourseModeFixture } from './teachingCourseModeFixture.js'
import { createAdministrativeAuditFixture } from './teachingAdministrativeAuditFixture.js'
import { createResponsibilityFixture } from './teachingResponsibilityFixture.js'
import { createFormalCourseFixture } from './formalCourseFixture.js'
import { createScheduleExportFixture } from './scheduleExportFixture.js'
import { createLessonChangeFixture } from './teachingLessonChangeFixture.js'
import { createChangeNoticeFixture } from './teachingChangeNoticeFixture.js'
import { fixtureScheduleTiming } from './scheduleTimingFixture.js'
import { createTimetableFixture } from './timetableFixture.js'
// A DEV-only simulated backend. Identity, clocks, notices and marks are data, not production grants.
export function createTeachingFlowFixture({ largeScope = false,largeClass=false,legacyCourse=false,managementHistory=false,responsibilities=false,calendarDelayMs=0,privateReadFailure='',privateEditDemo=false,dualRoleDemo=false,sourceDemo='' } = {}) {
  let privateFailurePending = ['network', '401', '403', '503'].includes(privateReadFailure)
  const uid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const today = chinaDate(),
    baseMonday = mondayOf(today)
  const bells = [
    '08:30/09:15',
    '09:20/10:05',
    '10:20/11:05',
    '11:10/11:55',
    '14:00/14:45',
    '14:50/15:35',
    '15:50/16:35',
    '16:40/17:25',
  ].map((s, i) => ({ period: i + 1, start: s.split('/')[0], end: s.split('/')[1] }))
  const actors = [
    { id: 2, nickname: '学生甲（模拟）', role: 'STUDENT', schoolId: 1 },
    { id: 4, nickname: '教师甲（模拟）', role: 'STUDENT', schoolId: 1 },
    { id: 5, nickname: '辅导员甲（模拟）', role: 'STUDENT', schoolId: 1 },
    { id: 6, nickname: '书记甲（模拟）', role: 'STUDENT', schoolId: 1 },
    { id: 1, nickname: '配置管理员（模拟）', role: 'ADMIN', schoolId: 1 },
    { id: 8, nickname: '另一学院学生（模拟）', role: 'STUDENT', schoolId: 1 },
    { id: 10, nickname: '申请教师（模拟）', role: 'STUDENT', schoolId: 1 },
  ].map((a) => ({ ...a, username: `flow-demo-${a.id}` }))
  let actor = actors[0],
    now = `${today}T13:00:00+08:00`
  const classes = [
    { id: uid(10), name: '物联网示例班一', college: '示例学院甲' },
    { id: uid(11), name: '物联网示例班二', college: '示例学院甲' },
    { id: uid(12), name: '设计示例班', college: '示例学院乙' },
  ]
  const members = new Map(
    classes.map((c, i) => [
      c.id,
      Array.from({ length: 3 }, (_, j) => ({
        id: uid(100 + i * 10 + j),
        name: `示例同学${i + 1}-${j + 1}`,
        studentNumber: `demo-${i + 1}-${j + 1}`,
        userId: j === 0 ? [2, 7, 8][i] : null,
      })),
    ]),
  )
  const courses = [
    {
      id: uid(20),
      classId: classes[0].id,
      teacherId: 4,
      name: '计算机网络基础（模拟）',
      room: 'F5-511（示例）',
      date: today,
      start: '14:00',
      end: '15:35',
    },
    {
      id: uid(21),
      classId: classes[1].id,
      teacherId: 4,
      name: '微处理器原理（模拟）',
      room: 'F2-306（示例）',
      date: today,
      start: '08:30',
      end: '10:05',
    },
    {
      id: uid(22),
      classId: classes[2].id,
      teacherId: 9,
      name: '设计基础（模拟）',
      room: '教室B（示例）',
      date: today,
      start: '16:40',
      end: '17:25',
    },
  ].map((c) => ({
    ...c,
    revision: 0,
    finalized: false,
    cancelled: false,
    entries: members
      .get(c.classId)
      .map((m) => ({
        studentId: m.id,
        studentNumber: m.studentNumber,
        name: m.name,
        status: 'UNKNOWN',
      })),
  }))
  const schedules = new Map([
    [
      2,
      {
        revision: 1,
        semester: '模拟学期',
        firstMonday: baseMonday,
        remindDays: 7,
        courses: [
          {
            name: courses[0].name,
            weekday: new Date(today + 'T12:00:00Z').getUTCDay() || 7,
            startPeriod: 5,
            endPeriod: 6,
            weeks: [1],
            room: courses[0].room,
          },
          {
            name: '大学体育（个人导入模拟）',
            weekday: new Date(today + 'T12:00:00Z').getUTCDay() || 7,
            startPeriod: 3,
            endPeriod: 4,
            weeks: [1],
            room: '体育馆（示例）',
          },
        ],
        importedAt: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
      },
    ],
  ])
  const notices = new Map(),
    audit = []
  if(privateEditDemo){const source=schedules.get(2);source.semester='四周个人课表源（模拟）';for(const row of source.courses)row.weeks=[1,2,3,4]}
  const legacyImages=new Map()
  if(['image','cleared'].includes(sourceDemo)){
    legacyImages.set(2,createTimetableFixture({saved:true}))
    if(sourceDemo==='image')schedules.delete(2)
    else schedules.set(2,{...schedules.get(2),courses:[],emptyConfirmed:true})
  }
  const grantRows = [
    { userId: 5, viewRole: 'COUNSELOR', scopeKey: classes[0].id },
    { userId: 6, viewRole: 'SECRETARY', scopeKey: '示例学院甲' },
  ]
  if (largeScope) for (let i = 0; i < 130; i++) {
    const clazz = { id: uid(1000 + i), name: `分页示例班${String(i + 1).padStart(3, '0')}`, college: '示例学院甲' }
    const rows = Array.from({ length: 3 }, (_, j) => ({ id: uid(3000 + i * 3 + j), name: `分页示例同学${i + 1}-${j + 1}`, studentNumber: `demo-paged-${i}-${j}`, userId: null }))
    classes.push(clazz); members.set(clazz.id, rows)
    courses.push({ id: uid(2000 + i), classId: clazz.id, teacherId: 4, name: `分页课程${i + 1}（模拟）`, room: `模拟教室${i + 1}`, date: today, start: '14:00', end: '15:35', revision: 0, finalized: false, cancelled: false, entries: rows.map(m => ({ studentId: m.id, studentNumber: m.studentNumber, name: m.name, status: 'UNKNOWN' })) })
  }
  const stamp = (c, end = false) => `${c.date}T${end ? c.end : c.start}:00+08:00`
  if(largeClass){
    const all=[]
    for(let g=0;g<3;g++){
      const b={id:uid(70000+g),name:`大合班行政${g+1}（模拟）`,college:g===0?'示例学院甲':'示例学院乙'},rows=Array.from({length:234},(_,n)=>({id:uid(71000+g*234+n),name:`合成同学${g+1}-${String(n+1).padStart(3,'0')}`,studentNumber:`big-${g+1}-${String(n+1).padStart(3,'0')}`,userId:null}))
      classes.push(b);members.set(b.id,rows);all.push(...rows.map(m=>({studentId:m.id,studentNumber:m.studentNumber,name:m.name,status:'UNKNOWN',adminClassId:b.id,college:b.college,withdrawn:false})))
    }
    courses.push({id:uid(79000),classId:classes[0].id,teacherId:4,name:'702人大合班（模拟）',room:'合班教学室（模拟）',date:today,start:'14:00',end:'15:35',revision:0,rosterRevision:0,finalized:false,cancelled:false,mode:'EXPLICIT',entries:all})
  }
  for(const c of courses){c.mode ||= 'ADMIN_CLASS';for(const e of c.entries){const b=classes.find(b=>members.get(b.id)?.some(m=>m.id===e.studentId));e.adminClassId ||= b.id;e.college ||= b.college}}
  if(legacyCourse){courses[1].mode='LEGACY';courses[0].mode='LEGACY';courses[0].entries.push({...courses[2].entries[0]})}
  const fail = (status, message) => {
    throw { response: { status, data: { message } } }
  }
  const identityRows = [[4,'TEACHER','APPROVED'],[5,'COUNSELOR','APPROVED'],[6,'SECRETARY','APPROVED'],[10,'TEACHER','PENDING']].map(([userId, requestedRole, status], i) => ({ id: uid(15000 + i), userId, username: actors.find(a => a.id === userId).username, nickname: actors.find(a => a.id === userId).nickname, requestedRole, status, revision: status === 'PENDING' ? 1 : 2, reason: '', requestedAt: now, reviewedAt: status === 'PENDING' ? null : now }))
  if(dualRoleDemo){
    courses.find(c=>c.id===uid(21)).teacherId=2
    identityRows.push({id:uid(15010),userId:2,username:actors[0].username,nickname:actors[0].nickname,requestedRole:'TEACHER',status:'APPROVED',revision:2,reason:'仅本页双身份合成场景',requestedAt:now,reviewedAt:now})
  }
  const identityAudit = []
  const approvedIdentity = (userId, role) => identityRows.some(i => i.userId === userId && i.requestedRole === role && i.status === 'APPROVED')
  const teacherName=id=>actors.find(a=>a.id===id)?.nickname||'教师乙（模拟）'
  function views() {
    const result = []
    if ([...members.values()].flat().some((m) => m.userId === actor.id)) result.push('STUDENT')
    if (approvedIdentity(actor.id, 'TEACHER') && courses.some((c) => c.teacherId === actor.id)) result.push('TEACHER')
    for (const v of ['COUNSELOR', 'SECRETARY'])
      if (approvedIdentity(actor.id, v) && grantRows.some((g) => g.userId === actor.id && g.viewRole === v)) result.push(v)
    return result
  }
  function allows(c, view) {
    if (!views().includes(view)) return false
    return view === 'STUDENT'
      ? entriesFor(c,view).length>0
      : view === 'TEACHER'
        ? c.teacherId === actor.id
        : entriesFor(c,view).length>0
  }
  const withdrawnMembers=new Set()
  const lifecycleStates=new Map(),transitionReceipts=new Map(),enrollmentReceipts=new Map()
  const memberFor=id=>[...members.values()].flat().find(m=>m.id===id)
  const administrativeClassFor=id=>classes.find(b=>members.get(b.id)?.some(m=>m.id===id))
  const entriesFor=(c,view)=>c.entries.filter(e=>!e.withdrawn && (view==='TEACHER' || (view==='STUDENT'?memberFor(e.studentId)?.userId===actor.id:grantRows.some(g=>g.userId===actor.id && g.viewRole===view && g.scopeKey===(view==='COUNSELOR'?(e.adminClassId || administrativeClassFor(e.studentId)?.id):(e.college || administrativeClassFor(e.studentId)?.college))))))
  function counts(entries) {
    const out = { unknown: 0, onTime: 0, late: 0, absent: 0, excused: 0,earlyLeave:0 },
      keys = {
        UNKNOWN: 'unknown',
        ON_TIME: 'onTime',
        LATE: 'late',
        ABSENT: 'absent',
        EXCUSED: 'excused',
        EARLY_LEAVE:'earlyLeave',
      }
    for (const e of entries) out[keys[e.status]]++
    return out
  }
  function lesson(c, view) {
    const b = classes.find((b) => b.id === c.classId)
    return {
      id: c.id,
      course: c.name,
      className: c.groupName || b.name,
      college: new Set(c.entries.filter(e=>!e.withdrawn).map(e=>e.college || administrativeClassFor(e.studentId)?.college)).size>1?'跨学院教学':b.college,
      teacher: teacherName(c.teacherId),
      room: c.room,
      startsAt: stamp(c),
      endsAt: stamp(c, true),
      revision: c.revision,
      finalized: c.finalized,
      cancelled: c.cancelled,
      counts: counts(entriesFor(c, view)),
    }
  }
  function selectedView(request) {
    const actual = views()
    const result = request || actual[0] || 'STUDENT'
    if (result !== 'STUDENT' && !actual.includes(result)) fail(403, '此模拟账号没有该负责范围')
    return result
  }
  function visibleNotices() {
    return [...notices.values()]
      .filter(
        (n) =>
          n.userId === actor.id &&
          !courses.find((c) => c.id === n.lessonId)?.cancelled &&
          (n.kind !== 'TEACHER_ROSTER' || approvedIdentity(actor.id, 'TEACHER')) &&
          Date.parse(n.dueAt) <= Date.parse(now) && (n.kind!=='STUDENT_CLASS' || courses.find(c=>c.id===n.lessonId)?.entries.some(e=>!e.withdrawn && memberFor(e.studentId)?.userId===actor.id)),
      )
      .map((n) => {
        const visible = { ...n }
        delete visible.userId
        return visible
      })
  }
  function dispatch() {
    let added = 0
    for (const c of courses) {
      const seconds = (Date.parse(stamp(c)) - Date.parse(now)) / 1000
      if (c.cancelled || seconds <= 0 || seconds > 3600) continue
      const recipients = c.entries.filter(e=>!e.withdrawn).map(e=>memberFor(e.studentId)).filter(Boolean)
        .filter((m) => m.userId != null)
        .map((m) => ({ userId: m.userId, kind: 'STUDENT_CLASS', before: 3600 }))
      if (seconds <= 300 && approvedIdentity(c.teacherId, 'TEACHER'))
        recipients.push({ userId: c.teacherId, kind: 'TEACHER_ROSTER', before: 300 })
      for (const r of recipients) {
        const key = `${c.id}:${r.userId}:${r.kind}`
        if (notices.has(key)) continue
        notices.set(key, {
          id: uid(10000 + notices.size),
          userId: r.userId,
          lessonId: c.id,
          kind: r.kind,
          course: c.name,
          room: c.room,
          teacher: teacherName(c.teacherId),
          startsAt: stamp(c),
          dueAt: new Date(Date.parse(stamp(c)) - r.before * 1000).toISOString(),
          readAt: null,
        })
        added++
      }
    }
    return added
  }
  function week(params = {}) {
    const view = selectedView(params.view),
      monday = params.monday || baseMonday,
      sunday = addDays(monday, 6),
      classId = params.classId
    const allowedClasses = classes.filter((b) =>
      courses.some((c) => allows(c,view) && (view==='TEACHER' && c.classId===b.id || entriesFor(c,view).some(e=>(e.adminClassId || administrativeClassFor(e.studentId)?.id)===b.id))),
    )
    if (classId && !allowedClasses.some((c) => c.id === classId)) fail(404, '班级不在模拟负责范围')
    const selected = courses.filter(
      (c) =>
        allows(c, view) &&
        c.date >= monday &&
        c.date <= sunday &&
        (!classId || entriesFor(c,view).some(e=>(e.adminClassId || administrativeClassFor(e.studentId)?.id)===classId)),
    )
    const own = personalEditing.forWeek(actor,monday),
      events = []
    if (own && ['STUDENT', 'TEACHER'].includes(view))
      for (const [i, c] of own.courses.entries()) {
        const weekIndex = Math.floor((dayNumber(monday) - dayNumber(own.firstMonday)) / 7) + 1
        if (!c.weeks.includes(weekIndex)) continue
        const date = addDays(monday, c.weekday - 1),
          hasPeriods = c.startPeriod != null,
          a = hasPeriods ? bells[c.startPeriod - 1] : bells.find((slot) => slot.start === c.startTime),
          b = hasPeriods ? bells[c.endPeriod - 1] : bells.find((slot) => slot.end === c.endTime),
          mapped = Boolean(a && b),
          startTime = hasPeriods ? (mapped ? a.start : null) : c.startTime,
          endTime = hasPeriods ? (mapped ? b.end : null) : c.endTime,
          startPeriod = hasPeriods ? c.startPeriod : mapped ? a.period : null,
          endPeriod = hasPeriods ? c.endPeriod : mapped ? b.period : null
        events.push({
          id: uid(500000000 + dayNumber(date) * 100000 + actor.id * 1000 + i),
          lessonId: null,
          date,
          weekday: c.weekday,
          name: c.name,
          room: c.room,
          teacher: '',
          className: '',
          startTime,
          endTime,
          startPeriod,
          endPeriod,
          timeLabel:
            startTime == null
              ? `第${startPeriod}${startPeriod === endPeriod ? '' : '—' + endPeriod}节（钟点待配置）`
              : `${startTime}—${endTime}`,
          sources: ['PERSONAL'],
          originIds: [uid(500000000 + dayNumber(date) * 100000 + actor.id * 1000 + i)],
          cancelled: false,
          conflict: false,
          canMark: false,
          attendance: null,
          counts: null,
        })
      }
    let merged = 0
    for (const c of selected) {
      const b = classes.find((b) => b.id === c.classId),
        rows = entriesFor(c, view).filter(e=>!classId || (e.adminClassId || administrativeClassFor(e.studentId)?.id)===classId),
        a = bells.find((b) => b.start === c.start),
        z = bells.find((b) => b.end === c.end)
      const matching = events.findIndex(
        (e) =>
          e.name === c.name &&
          e.date === c.date &&
          e.startTime === c.start &&
          e.endTime === c.end &&
          e.room === c.room,
      )
      const origins = matching >= 0 ? events[matching].originIds : []
      if (matching >= 0) {
        events.splice(matching, 1)
        merged++
      }
      events.push({
        id: c.id,
        lessonId: c.id,
        date: c.date,
        weekday: new Date(c.date + 'T12:00:00Z').getUTCDay() || 7,
        name: c.name,
        room: c.room,
        teacher: teacherName(c.teacherId),
        className: c.groupName || b.name,
        startTime: c.start,
        endTime: c.end,
        startPeriod: a?.period ?? null,
        endPeriod: z?.period ?? null,
        timeLabel: `${c.start}—${c.end}`,
        sources: matching >= 0 ? ['PERSONAL', 'TEACHING'] : ['TEACHING'],
        originIds: [...origins, c.id],
        cancelled: c.cancelled,
        conflict: false,
        canMark:
          view === 'TEACHER' && !c.cancelled && Date.parse(now) >= Date.parse(stamp(c)) - 300000,
        attendance: view === 'STUDENT' ? (rows[0]?.status ?? null) : null,
        counts: counts(rows),
      })
    }
    events.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime == null
          ? b.startTime == null
            ? 0
            : 1
          : b.startTime == null
            ? -1
            : a.startTime.localeCompare(b.startTime)),
    )
    const all = selected.filter((c) => !c.cancelled).flatMap((c) => entriesFor(c, view).filter(e=>!classId || (e.adminClassId || administrativeClassFor(e.studentId)?.id)===classId)),
      totals = counts(all)
    const next =
      events.find(
        (e) =>
          !e.cancelled &&
          e.endTime != null &&
          (view !== 'TEACHER' || e.lessonId) &&
          Date.parse(`${e.date}T${e.endTime}:00+08:00`) > Date.parse(now),
      ) || null
    const pending =
      view === 'TEACHER' ? events.filter((e) => e.date===today && e.canMark && e.counts.unknown > 0) : []
    const attention =
      pending.find((e) => Date.parse(`${e.date}T${e.endTime}:00+08:00`) > Date.parse(now)) ||
      pending[0] ||
      null
    const active = events.filter((e) => !e.cancelled)
    const gridSafe =
      active.length > 0 &&
      active.every(
        (e) =>
          Number.isInteger(e.startPeriod) &&
          Number.isInteger(e.endPeriod) &&
          e.startPeriod >= 1 &&
          e.endPeriod <= bells.length &&
          e.startTime != null &&
          e.endTime != null,
      ) &&
      !events.some((a, i) =>
        events
          .slice(i + 1)
          .some(
            (b) =>
              !a.cancelled &&
              !b.cancelled &&
              a.date === b.date &&
              a.startPeriod <= b.endPeriod &&
              b.startPeriod <= a.endPeriod,
          ),
      )
    return {
      version: 1,
      monday,
      sunday,
      today,
      now: new Date(now).toISOString(),
      view,
      views: [...new Set(['STUDENT', ...views()])],
      classes: allowedClasses,
      bells,
      clockSource: '用户提供的8节作息（模拟）',
      teachingEnabled: true,
      entries: events,
      summary: {
        plannedClasses: events.filter((e) => !e.cancelled).length,
        todayClasses: events.filter((e) => !e.cancelled && e.date === today).length,
        conflicts: 0,
        mergedDuplicates: merged,
        personalRevision: own?.revision || 0,
        absentStudents: new Set(all.filter((e) => e.status === 'ABSENT').map((e) => e.studentId))
          .size,
        attendance: totals,
      },
      next,
      attention,
      focusLabel: attention
        ? '今天待完成点名'
        : next
          ? Date.parse(`${next.date}T${next.startTime}:00+08:00`) <= Date.parse(now)
            ? '正在上课'
            : '下一节安排'
          : '',
      gridSafe,
      notices: visibleNotices(),
      warnings: [],
    }
  }
  const governance=createGovernanceFixture({actor:()=>actor,views,time:()=>now,courses,classes,entriesFor,allows,administrativeClassFor,audit,actors,stamp,fail,uid,teacherName})
  const courseMode=createCourseModeFixture({actor:()=>actor,time:()=>now,courses,classes,administrativeClassFor,lifecycleStates,audit,fail,teacherName})
  const managementAudit=createAdministrativeAuditFixture({actor:()=>actor,time:()=>now,courses,classes,memberFor,audit,identityRows,identityAudit,actors,uid,fail,seedHistory:managementHistory,responsibilities})
  const responsibility=createResponsibilityFixture({enabled:responsibilities,actor:()=>actor,actors,classes,grants:grantRows,approved:approvedIdentity,time:()=>now,audit,fail})
  const formalCourse=createFormalCourseFixture({actor:()=>actor,actors,classes,members,memberFor,approved:approvedIdentity,lifecycle:lifecycleStates,fail})
  const scheduleFiles=createScheduleExportFixture({actor:()=>actor,views,courses,schedules,bells,allows,entriesFor,administrativeClassFor,lesson,read:config=>adapter(config),time:()=>now,fail})
  const lessonChanges=createLessonChangeFixture({actor:()=>actor,time:()=>now,courses,classes,actors,approved:approvedIdentity,lifecycle:lifecycleStates,administrativeClassFor,memberFor,dispatch,audit,fail})
  const changeNotices=createChangeNoticeFixture({actor:()=>actor,time:()=>now,courses,memberFor,lifecycle:lifecycleStates,approved:approvedIdentity,audit,fail})
  const classRequests=new Map()
  const personalEditing=createPersonalScheduleEditingFixture({actor:()=>actor,schedules,time:()=>now})
  async function adapter(config) {
    const requestedActor = actor.id
    const currentRequest = () => {
      if (actor.id !== requestedActor || config.signal?.aborted) fail(409, '模拟会话已变化，旧请求没有提交变更')
    }
    currentRequest()
    const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    const reply = (value) => ({
      data: structuredClone(value),
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
    const changeResponse=await lessonChanges.handle(config);currentRequest();if(changeResponse)return changeResponse
    const personalResponse=personalEditing(config,data,reply);if(personalResponse)return personalResponse
    if(config.url==='/api/account/student-identity'){
      const linked=[...members.entries()].flatMap(([classId,rows])=>rows.filter(r=>r.userId===actor.id).map(r=>({...r,classId})))
      if(linked.length>1)fail(503,'模拟本人学籍绑定不唯一')
      return reply(linked.length?{bound:true,studentNumber:linked[0].studentNumber,className:classes.find(c=>c.id===linked[0].classId)?.name||''}:{bound:false,message:'此模拟账号没有学生学号绑定，不按姓名猜测'})
    }
    const changedNoticeResponse=changeNotices(config,reply);if(changedNoticeResponse)return changedNoticeResponse
    const evidence=await governance(config,data,reply);currentRequest();if(evidence)return evidence
    const sourceReview=courseMode(config,data,reply);if(sourceReview)return sourceReview
    const management=await managementAudit(config,data,reply);currentRequest();if(management)return management
    const responsibilityReply=responsibility(config,data,reply);currentRequest();if(responsibilityReply)return responsibilityReply
    if(config.url==='/api/admin/teaching/classes' && config.method==='post'){
      if(actor.role!=='ADMIN')fail(403,'需要正常模拟管理员')
      const clean=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&![...value].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)
      if(!data||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(data.id||'')||!clean(data.college,100)||!clean(data.name,100)||!Array.isArray(data.members)||data.members.length<1||data.members.length>300)fail(400,'模拟班级、学院或1至300人名单无效')
      const numbers=new Set(),accounts=new Set(),raw=[]
      for(const row of data.members){
        if(!row||!clean(row.name,100)||!clean(row.studentNumber,40))fail(400,'模拟名单行缺少姓名或学号')
        const number=row.studentNumber.trim(),userId=row.userId??null
        if(numbers.has(number)||userId!==null&&accounts.has(userId))fail(400,'模拟名单学号或账号重复，未导入')
        if(userId!==null&&(!Number.isSafeInteger(userId)||userId<1||!actors.some(a=>a.id===userId&&a.schoolId===actor.schoolId)))fail(400,'模拟绑定账号不存在或不在本校')
        numbers.add(number);if(userId!==null)accounts.add(userId)
        raw.push({studentNumber:row.studentNumber,name:row.name,userId})
      }
      const fingerprint=JSON.stringify([data.college.trim(),data.name.trim(),raw]),existing=classes.find(b=>b.id===data.id)
      if(existing){if(classRequests.get(data.id)!==fingerprint)fail(409,'模拟班级编号已用于另一份名单');return reply({id:data.id})}
      const all=[...members.values()].flat()
      if(classes.some(b=>b.college===data.college.trim()&&b.name===data.name.trim())||all.some(m=>numbers.has(m.studentNumber)||m.userId!==null&&accounts.has(m.userId)))fail(409,'模拟班级、学号或账号已存在，未覆盖原名单')
      const rows=raw.map(m=>({id:crypto.randomUUID(),studentNumber:m.studentNumber.trim(),name:m.name.trim(),userId:m.userId}))
      classes.push({id:data.id,name:data.name.trim(),college:data.college.trim()});members.set(data.id,rows);classRequests.set(data.id,fingerprint)
      for(const row of rows)lifecycleStates.set(row.id,{revision:0,status:'ACTIVE'})
      return reply({id:data.id})
    }
    const accountBinding=/^\/api\/admin\/teaching\/members\/([a-f0-9-]{36})\/account$/.exec(config.url)
    if(accountBinding){
      if(actor.role!=='ADMIN')fail(403,'需要正常模拟管理员')
      if(config.method!=='put')fail(405,'模拟账号绑定需要PUT')
      const member=memberFor(accountBinding[1]);if(!member)fail(404,'模拟名单目标不存在')
      if(!data || typeof data!=='object')fail(400,'模拟绑定资料缺失')
      const userId=data.userId ?? null,expected=data.expectedUserId ?? null,old=member.userId ?? null
      if(userId!==null && (!Number.isSafeInteger(userId)||userId<1||!actors.some(a=>a.id===userId&&a.schoolId===actor.schoolId)))fail(400,'模拟目标账号不存在或不在本校')
      if(old!==expected)fail(409,'模拟账号绑定已变化，请重新读取名单')
      if(old===userId)return reply(null)
      if(userId!==null && [...members.values()].flat().some(m=>m.id!==member.id&&m.userId===userId))fail(409,'模拟账号已绑定另一位学生，未覆盖')
      member.userId=userId
      audit.push({action:'BIND',studentId:member.id,actorId:actor.id,oldUserId:old,newUserId:userId,requestId:crypto.randomUUID(),at:now})
      dispatch()
      return reply(null)
    }
    if(['/api/admin/teaching/grants','/api/admin/teaching/grants/revoke'].includes(config.url)){
      if(actor.role!=='ADMIN')fail(403,'需要正常模拟管理员')
      if(responsibilities)fail(409,'受控负责范围已启用，旧入口没有执行变更')
      if(config.method!=='post')fail(405,'模拟负责范围需要POST')
      const revoke=config.url.endsWith('/revoke'),userId=data?.userId,viewRole=data?.viewRole,scopeKey=data?.scopeKey
      if(!Number.isSafeInteger(userId)||userId<1||!actors.some(a=>a.id===userId&&a.schoolId===actor.schoolId)||!['COUNSELOR','SECRETARY'].includes(viewRole)||typeof scopeKey!=='string'||!scopeKey.trim())fail(400,'模拟负责账号、角色或范围无效')
      if(!revoke && !approvedIdentity(userId,viewRole))fail(403,'先审核通过对应教学身份，再明确负责范围')
      if(viewRole==='COUNSELOR'?!classes.some(b=>b.id===scopeKey):!classes.some(b=>b.college===scopeKey))fail(400,'模拟班级或学院不存在')
      const index=grantRows.findIndex(g=>g.userId===userId&&g.viewRole===viewRole&&g.scopeKey===scopeKey)
      if(revoke && index>=0)grantRows.splice(index,1)
      else if(!revoke && index<0)grantRows.push({userId,viewRole,scopeKey})
      return reply(null)
    }
    if(config.url==='/api/admin/teaching/capabilities'){if(actor.role!=='ADMIN')fail(403,'需要模拟管理员');return reply({rosterEnabled:true,maxCourseMembers:2000,lifecycleEnabled:true,readmissionEnabled:true,reenrollmentEnabled:true,governanceEnabled:true,enrollmentModeReviewEnabled:true,administrativeAuditEnabled:true})}
    const formalResponse=await formalCourse.handle(config,data,reply);currentRequest();if(formalResponse)return formalResponse
    const exportResponse=await scheduleFiles(config,data,reply);currentRequest();if(exportResponse)return exportResponse
    if(config.url==='/api/admin/teaching/courses'&&config.method==='post'){
      if(actor.role!=='ADMIN')fail(403,'需要模拟管理员')
      const b=classes.find(b=>b.id===data.classId);if(!b)fail(404,'模拟行政班不存在')
      const response=await adapter({...config,url:'/api/admin/teaching/courses/roster',data:{course:data,groupName:b.name,studentIds:(members.get(b.id)||[]).filter(m=>lifecycleStates.get(m.id)?.status!=='LEFT').map(m=>m.id)}})
      for(const c of courses.filter(c=>c.courseId===data.id))c.mode='ADMIN_CLASS'
      await formalCourse.remember({course:data,rosterMode:'CLASS',groupName:'',studentIds:[]})
      return response
    }
    const studentState=/^\/api\/admin\/teaching\/students\/([a-f0-9-]{36})\/(status|transition)$/.exec(config.url)
    if(studentState){
      if(actor.role!=='ADMIN')fail(403,'需要模拟管理员')
      const id=studentState[1],m=memberFor(id),b=administrativeClassFor(id);if(!m || !b)fail(404,'模拟学生不存在')
      const state=lifecycleStates.get(id) || {revision:0,status:'ACTIVE'}
      if(studentState[2]==='status')return reply({id,studentNumber:m.studentNumber,name:m.name,classId:b.id,className:b.name,college:b.college,...state})
      const key=JSON.stringify([actor.id,id,data?.revision,data?.expectedClassId,data?.action,data?.action==='LEAVE'?data?.expectedClassId:data?.targetClassId,data?.reason?.trim()]),previous=transitionReceipts.get(data?.requestId)
      if(previous){if(previous.key!==key)fail(409,'模拟请求编号已用于不同变更');return reply(previous.receipt)}
      const restoring=data?.action==='RESTORE',target=data?.action==='LEAVE'?b:classes.find(c=>c.id===data.targetClassId)
      if(!data?.reason?.trim() || data.reason.length>300 || !/^[a-f0-9-]{36}$/.test(data.requestId) || !['TRANSFER','LEAVE','RESTORE'].includes(data.action) || !target || (data.action==='TRANSFER' && target.id===b.id))fail(400,'模拟变更目标或原因无效')
      if(data.revision!==state.revision || data.expectedClassId!==b.id || (restoring?state.status!=='LEFT':state.status!=='ACTIVE'))fail(409,'模拟学籍版本已变化')
      const future=courses.filter(c=>Date.parse(stamp(c))>Date.parse(now)),changes=[]
      for(const c of future){const e=c.entries.find(e=>e.studentId===id),desired=data.action!=='LEAVE' && (c.mode==='ADMIN_CLASS'?c.classId===target.id:!restoring && !!e && !e.withdrawn && !withdrawnMembers.has(`${c.courseId || c.id}:${id}`));if(restoring && c.mode==='EXPLICIT' && e && !e.withdrawn)fail(409,'离校状态仍有有效选修，请先核对');if((e && !e.withdrawn) || desired){if(e && e.status!=='UNKNOWN')fail(409,'未来已有该同学点名记录，请先核对');changes.push({c,e,desired})}}
      const rosterVersions=new Map(changes.map(({c})=>[c.courseId || c.id,c.rosterRevision || 0]))
      for(const {c,e,desired} of changes){
        if(e){e.withdrawn=!desired;if(desired){e.adminClassId=target.id;e.college=target.college}}
        else c.entries.push({studentId:id,studentNumber:m.studentNumber,name:m.name,status:'UNKNOWN',adminClassId:target.id,college:target.college,withdrawn:false})
        if(desired)withdrawnMembers.delete(`${c.courseId || c.id}:${id}`);else withdrawnMembers.add(`${c.courseId || c.id}:${id}`)
        c.revision++;c.finalized=false
      }
      for(const [course,revision] of rosterVersions)for(const c of courses)if((c.courseId || c.id)===course)c.rosterRevision=revision+1
      if(target.id!==b.id){members.set(b.id,members.get(b.id).filter(row=>row.id!==id));members.get(target.id).push(m)}
      const next={revision:state.revision+1,status:data.action==='LEAVE'?'LEFT':'ACTIVE'};lifecycleStates.set(id,next)
      const receipt={requestId:data.requestId,studentId:id,classId:target.id,...next,affectedLessons:changes.length}
      transitionReceipts.set(data.requestId,{key,receipt});audit.push({studentId:id,actorId:actor.id,action:data.action,reason:data.reason,oldClass:b.id,newClass:target.id,oldStatus:state.status,newStatus:next.status,revision:next.revision,affectedLessons:changes.length,requestId:data.requestId,at:now});dispatch();return reply(receipt)
    }
    const reenroll=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]{36})\/members\/([a-f0-9-]{36})\/reenroll$/.exec(config.url)
    if(reenroll){
      if(actor.role!=='ADMIN')fail(403,'需要模拟管理员')
      const courseId=reenroll[1],studentId=reenroll[2],rows=courses.filter(c=>(c.courseId || c.id)===courseId),m=memberFor(studentId),b=administrativeClassFor(studentId)
      if(!rows.length || !m || !b || !rows.some(c=>c.entries.some(e=>e.studentId===studentId)))fail(404,'模拟原课程成员不存在')
      if(!data?.reason?.trim() || data.reason.length>300 || !/^[a-f0-9-]{36}$/.test(data.requestId) || !Number.isSafeInteger(data.revision) || !Number.isSafeInteger(data.studentRevision))fail(400,'模拟重新选课版本、原因或编号无效')
      const key=JSON.stringify([actor.id,courseId,studentId,data.revision,data.studentRevision,data.expectedClassId,data.reason.trim()]),previous=enrollmentReceipts.get(data.requestId)
      if(previous){if(previous.key!==key)fail(409,'模拟请求编号已用于不同选课');return reply(previous.receipt)}
      const person=lifecycleStates.get(studentId) || {revision:0,status:'ACTIVE'},revision=rows[0].rosterRevision || 0
      if(person.status!=='ACTIVE')fail(409,'模拟学生已离校，请先明确核对复学')
      if(data.studentRevision!==person.revision || data.expectedClassId!==b.id || data.revision!==revision)fail(409,'模拟学籍或名单版本已变化')
      if(!withdrawnMembers.has(`${courseId}:${studentId}`))fail(409,'模拟成员已在课，不重复选课')
      if(!['ADMIN_CLASS','EXPLICIT'].includes(rows[0].mode) || (rows[0].mode==='ADMIN_CLASS' && rows[0].classId!==b.id))fail(409,'模拟课程来源或当前行政班不符')
      const active=new Set(rows.flatMap(c=>c.entries.map(e=>e.studentId)).filter(id=>!withdrawnMembers.has(`${courseId}:${id}`)))
      if(active.size>=2000)fail(409,'模拟课程名单已达到2000人')
      const future=rows.filter(c=>!c.cancelled && Date.parse(stamp(c))>Date.parse(now))
      if(!future.length || future.length>30)fail(409,'没有适合恢复的未来安排，或需分期核对')
      if(future.some(c=>c.entries.some(e=>e.studentId===studentId && e.status!=='UNKNOWN')))fail(409,'未来已有该同学点名，未覆盖')
      for(const c of future){const e=c.entries.find(e=>e.studentId===studentId);if(e){e.withdrawn=false;e.adminClassId=b.id;e.college=b.college}else c.entries.push({studentId,studentNumber:m.studentNumber,name:m.name,status:'UNKNOWN',adminClassId:b.id,college:b.college,withdrawn:false});c.revision++;c.finalized=false}
      for(const c of rows)c.rosterRevision=revision+1
      withdrawnMembers.delete(`${courseId}:${studentId}`)
      const receipt={requestId:data.requestId,courseId,studentId,classId:b.id,revision:revision+1,studentRevision:person.revision,affectedLessons:future.length}
      enrollmentReceipts.set(data.requestId,{key,receipt});audit.push({courseId,studentId,actorId:actor.id,action:'REENROLL',reason:data.reason.trim(),revision:revision+1,at:now});dispatch();return reply(receipt)
    }
    const classMembers=/^\/api\/admin\/teaching\/classes\/([a-f0-9-]{36})\/members$/.exec(config.url)
    if(classMembers){if(actor.role!=='ADMIN')fail(403,'需要模拟管理员');if(!members.has(classMembers[1]))fail(404,'模拟行政班不存在');return reply(members.get(classMembers[1]))}
    if(config.url==='/api/admin/teaching/courses/roster' && config.method==='post'){
      if(actor.role!=='ADMIN')fail(403,'需要模拟管理员')
      const input=data?.course
      if(!input || !/^[a-f0-9-]{36}$/.test(input.id) || !classes.some(c=>c.id===input.classId) || !approvedIdentity(input.teacherId,'TEACHER') || !data.groupName?.trim() || data.groupName.length>100 || !Array.isArray(data.studentIds) || !data.studentIds.length || data.studentIds.length>2000 || new Set(data.studentIds).size!==data.studentIds.length || data.studentIds.some(id=>!memberFor(id) || lifecycleStates.get(id)?.status==='LEFT'))fail(400,'模拟课程名单或教师身份无效')
      if(!input.name?.trim() || !input.semester?.trim() || !input.room?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.firstMonday) || new Date(input.firstMonday+'T12:00:00Z').getUTCDay()!==1 || !Number.isInteger(input.weekday) || input.weekday<1 || input.weekday>7 || !Array.isArray(input.weeks) || !input.weeks.length || input.weeks.length>30 || input.weeks.some(w=>!Number.isInteger(w) || w<1 || w>30) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.endTime) || input.startTime>=input.endTime)fail(400,'模拟排课日期、钟点或周次无效')
      const key=JSON.stringify({course:{...input,id:undefined,weeks:[...new Set(input.weeks)].sort((a,b)=>a-b)},groupName:data.groupName.trim(),studentIds:[...data.studentIds].sort()})
      const existing=courses.filter(c=>c.courseId===input.id)
      if(existing.length){if(existing[0].inputKey!==key)fail(409,'模拟课程编号已有不同资料');return reply({id:input.id})}
      if(courses.some(c=>c.inputKey===key))fail(409,'模拟课程已存在，不重复创建')
      const entry=data.studentIds.map(id=>{const m=memberFor(id),b=administrativeClassFor(id);return {studentId:id,studentNumber:m.studentNumber,name:m.name,status:'UNKNOWN',adminClassId:b.id,college:b.college,withdrawn:false}})
      for(const w of [...new Set(input.weeks)].sort((a,b)=>a-b))courses.push({id:uid(40000+courses.length),courseId:input.id,mode:'EXPLICIT',inputKey:key,groupName:data.groupName.trim(),classId:input.classId,teacherId:input.teacherId,name:input.name.trim(),semester:input.semester.trim(),firstMonday:input.firstMonday,room:input.room.trim(),date:addDays(input.firstMonday,(w-1)*7+input.weekday-1),start:input.startTime,end:input.endTime,revision:0,rosterRevision:0,finalized:false,cancelled:false,entries:structuredClone(entry)})
      dispatch();await formalCourse.remember({course:input,rosterMode:'SELECTED',groupName:data.groupName,studentIds:data.studentIds});return reply({id:input.id})
    }
    const rosterPage=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]{36})\/roster\/page$/.exec(config.url),memberStatus=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]{36})\/members\/([a-f0-9-]{36})\/status$/.exec(config.url)
    if(rosterPage || memberStatus){
      const id=(rosterPage || memberStatus)[1],all=(await adapter({...config,url:`/api/admin/teaching/courses/${id}/roster`,method:'get',syntheticPaged:true})).data
      if(memberStatus){const member=all.members.find(m=>m.studentId===memberStatus[2]);if(!member)fail(404,'模拟成员不存在');return reply({courseId:id,revision:all.revision,member})}
      const {page=0,size=25,search='',activeOnly=false}=config.params || {},q=search.trim(),filtered=all.members.filter(m=>(!activeOnly || m.active) && (!q || m.name.includes(q) || m.studentNumber.includes(q))),total=filtered.length,totalPages=Math.ceil(total/size)
      if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100||(page>0&&page>=totalPages))fail(400,'模拟名单分页参数无效')
      return reply({roster:{...all,members:filtered.slice(page*size,(page+1)*size)},page,size,search:q,activeOnly,total,totalPages,activeTotal:all.members.filter(m=>m.active).length})
    }
    const courseRoster=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]{36})\/roster$/.exec(config.url),withdraw=/^\/api\/admin\/teaching\/courses\/([a-f0-9-]{36})\/members\/([a-f0-9-]{36})\/withdraw$/.exec(config.url)
    if(courseRoster || withdraw){
      if(actor.role!=='ADMIN')fail(403,'需要模拟管理员')
      const id=(courseRoster || withdraw)[1],rows=courses.filter(c=>(c.courseId || c.id)===id)
      if(!rows.length)fail(404,'模拟课程不存在')
      const revision=rows[0].rosterRevision || 0
      if(withdraw){
        const studentId=withdraw[2],entry=rows[0].entries.find(e=>e.studentId===studentId)
        if(!entry || data?.revision!==revision || !data?.reason?.trim())fail(data?.revision!==revision?409:400,'模拟名单目标、版本或原因无效')
        if(withdrawnMembers.has(`${id}:${studentId}`))return reply({id,studentId,revision})
        const future=rows.filter(c=>Date.parse(stamp(c))>Date.parse(now))
        if(future.some(c=>c.entries.some(e=>e.studentId===studentId && e.status!=='UNKNOWN')))fail(409,'未来课程已经点名，请先核对')
        for(const c of future){const e=c.entries.find(e=>e.studentId===studentId);if(e && !e.withdrawn){e.withdrawn=true;c.revision++;c.finalized=false}}
        for(const c of rows)c.rosterRevision=revision+1
        withdrawnMembers.add(`${id}:${studentId}`)
        audit.push({courseId:id,studentId,actorId:actor.id,action:'WITHDRAW',reason:data.reason,revision:revision+1,at:now})
        return reply({id,studentId,revision:revision+1})
      }
      const unique=new Map();for(const c of rows)for(const e of c.entries){const b=administrativeClassFor(e.studentId);unique.set(e.studentId,{studentId:e.studentId,studentNumber:e.studentNumber,name:e.name,adminClassId:b.id,college:b.college,active:!withdrawnMembers.has(`${id}:${e.studentId}`)})}
      if(unique.size>300 && !config.syntheticPaged)fail(400,'超过旧完整名单上限，请使用分页')
      const c=rows[0];return reply({courseId:id,groupName:c.groupName || classes.find(b=>b.id===c.classId).name,revision,members:[...unique.values()],target:{name:c.name,semester:c.semester || '模拟学期',teacher:teacherName(c.teacherId),weekday:new Date(c.date+'T12:00:00Z').getUTCDay() || 7,startTime:c.start,endTime:c.end,room:c.room}})
    }
    if (config.url === '/api/account/teaching-identities') {
      if (config.method === 'post') {
        if (!data || !['TEACHER','COUNSELOR','SECRETARY'].includes(data.role) || !Number.isInteger(data.revision) || data.revision < 0 || Object.keys(data).some(k => !['role','revision'].includes(k))) fail(400, '模拟身份申请无效')
        let row = identityRows.find(i => i.userId === actor.id && i.requestedRole === data.role)
        if (row?.status === 'PENDING' && [row.revision, row.revision - 1].includes(data.revision)) return reply(row)
        if ((row?.revision || 0) !== data.revision || (row && row.status !== 'REJECTED')) fail(409, '模拟申请已变化，请刷新')
        if (!row) { row = { id: uid(15000 + identityRows.length), userId: actor.id, username: actor.username, nickname: actor.nickname, requestedRole: data.role, revision: 0 }; identityRows.push(row) }
        const oldStatus=row.status||'NONE';Object.assign(row, { status: 'PENDING', revision: row.revision + 1, reason: '', requestedAt: now, reviewedAt: null }); identityAudit.push({ actor: actor.id, id: row.id, revision: row.revision, oldStatus,status:row.status,reason:'',at:now }); return reply(row)
      }
      return reply({ enabled: true, items: identityRows.filter(i => i.userId === actor.id) })
    }
    if (config.url === '/api/admin/teaching-identities') {
      if (actor.role !== 'ADMIN') fail(403, '需要模拟管理员')
      const params=config.params || {}, page=Number(params.page || 0), size=Number(params.size || 25), status=params.status || 'PENDING', search=String(params.search || '').trim()
      if (page < 0 || size < 1 || size > 100 || !['PENDING','APPROVED','REJECTED','REVOKED','ALL'].includes(status)) fail(400, '模拟审核分页无效')
      const rows=identityRows.filter(i => (status === 'ALL' || i.status === status) && (!search || i.username.includes(search) || i.nickname.includes(search))).sort((a,b) => b.requestedAt.localeCompare(a.requestedAt) || a.id.localeCompare(b.id))
      return reply({ items: rows.slice(page * size, (page + 1) * size), page, size, total: rows.length, totalPages: Math.ceil(rows.length / size) })
    }
    const reviewMatch=config.url.match(/^\/api\/admin\/teaching-identities\/([a-f0-9-]{36})\/review$/i)
    if (reviewMatch) {
      if (actor.role !== 'ADMIN') fail(403, '需要模拟管理员')
      const row=identityRows.find(i => i.id === reviewMatch[1]); if (!row) fail(404, '模拟申请不存在')
      if (row.userId === actor.id) fail(403, '不能审核自己的申请')
      if (data.revision !== row.revision) fail(409, '模拟申请已变化')
      const allowed={ PENDING: ['APPROVE','REJECT'], APPROVED: ['REVOKE'], REVOKED: ['RESTORE'], REJECTED: [] }
      if (!allowed[row.status].includes(data.decision) || (data.decision !== 'APPROVE' && !data.reason?.trim())) fail(400, '模拟审核状态或原因无效')
      const oldStatus=row.status;Object.assign(row, { status: ({ APPROVE:'APPROVED', REJECT:'REJECTED', REVOKE:'REVOKED', RESTORE:'APPROVED' })[data.decision], revision: row.revision + 1, reason: data.reason || '', reviewedAt: now })
      identityAudit.push({ actor: actor.id, id: row.id, revision: row.revision, oldStatus,status:row.status,reason:row.reason,at:now }); return reply(row)
    }
    if (config.url === '/api/auth/me') return reply(actor)
    if (config.url === '/api/timetable/unified/scopes/page') {
      const w = week({ view: config.params?.view }), search = config.params?.search || '', page = Number(config.params?.page || 0), size = Number(config.params?.size || 50)
      if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) fail(400, '模拟分页参数无效')
      const classes = w.classes.filter(c => c.name.includes(search) || c.college.includes(search)), total = classes.length, totalPages = Math.ceil(total / size)
      if (page > 0 && page >= totalPages) fail(400, '模拟页码不存在')
      return reply({ scopes: { version: 1, view: w.view, views: w.views, teachingEnabled: true, viewHasTeaching: views().includes(w.view), classes: classes.slice(page * size, (page + 1) * size) }, page, size, total, totalPages })
    }
    if (config.url === '/api/timetable/unified/page') {
      if (calendarDelayMs > 0) {
        const requestedActor = actor.id
        await new Promise(resolve => setTimeout(resolve, Math.min(calendarDelayMs, 2000))) // Deliberate DEV backend latency, not a UI readiness timer.
        if (actor.id !== requestedActor) fail(409, '模拟账号已变化，旧课程读取无效')
      }
      const w = week(config.params), page = Number(config.params?.page || 0), size = Number(config.params?.size || 50)
      if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) fail(400, '模拟分页参数无效')
      const total = w.entries.length, totalPages = Math.ceil(total / size), entries = w.entries.slice(page * size, (page + 1) * size)
      if (page > 0 && page >= totalPages) fail(400, '模拟页码不存在')
      const own = e => e && entries.some(row => row.id === e.id) ? e : null
      const leadership = ['COUNSELOR', 'SECRETARY'].includes(w.view)
      return reply({ week: { ...w, entries, next: leadership ? null : own(w.next), attention: leadership ? null : own(w.attention), focusLabel: leadership ? '' : w.focusLabel, gridSafe: !leadership && totalPages <= 1 && w.gridSafe }, page, size, total, totalPages, summaryScope: '完整模拟授权筛选范围；不是本页小计' })
    }
    if (config.url === '/api/timetable/unified') return reply(week(config.params))
    if(sourceDemo && ['/api/timetable','/api/timetable/image','/api/timetable/checked'].includes(config.url)){
      if(!legacyImages.has(actor.id))legacyImages.set(actor.id,createTimetableFixture())
      return legacyImages.get(actor.id).adapter(config)
    }
    if (config.url === '/api/timetable/unified/query') {
      const q=config.params||{},from=q.from,to=q.to
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||'')||dayNumber(to)<dayNumber(from)||dayNumber(to)-dayNumber(from)>13)fail(400,'模拟本人查询范围无效')
      const perspective=q.perspective??'AUTO'
      if(!['AUTO','STUDENT','TEACHER'].includes(perspective))fail(400,'模拟查询范围无效')
      if(perspective==='TEACHER'&&!views().includes('TEACHER'))fail(403,'当前模拟账号没有已授权授课范围；请由管理员核对任课绑定，不会改查学生课表或其他老师')
      const view=perspective==='AUTO'?(views().includes('STUDENT')?'STUDENT':views().includes('TEACHER')?'TEACHER':'STUDENT'):perspective,all=[]
      for(let monday=mondayOf(from);monday<=to;monday=addDays(monday,7))all.push(...week({monday,view}).entries.filter(e=>e.date>=from&&e.date<=to&&(perspective!=='TEACHER'||e.lessonId&&e.sources.includes('TEACHING'))))
      const rangeRows=[...new Map(all.map(e=>[e.id,e])).values()],excluded=rangeRows.filter(e=>e.cancelled).length
      const hasPersonal=rangeRows.some(e=>e.sources.includes('PERSONAL')),hasStructured=personalEditing.hasSavedTerm(actor)
      const imageOnly=perspective!=='TEACHER'&&!hasPersonal&&!hasStructured&&legacyImages.get(actor.id)?.hasSavedImage()
      const sourceNotice=perspective==='TEACHER'||hasPersonal?'':hasStructured?'本账号存在已保存的个人课表记录，但本次日期内没有可查询的个人安排。可核对学期、周次或个人课表历史；不会用旧图片自动补课。':imageOnly?'如需查询图片中的课程，请在完整课表导入课程数据，或核对图片识别结果后保存。本次未读取图片内容，也未确认它涵盖本次日期。':''
      const base=rangeRows.filter(e=>!e.cancelled)
      const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}+#]/gu,'')
      const hint=normalize(q.course),equal=!!hint&&base.some(e=>normalize(e.name)===hint),partial=!!hint&&base.some(e=>normalize(e.name).includes(hint))
      if(typeof q.course==='string'&&(q.course.length>100||q.course.trim()&&!hint))fail(400,'模拟课程名称无效')
      const abbreviation=name=>{if(!/^[\p{Script=Han}]{2,}$/u.test(hint))return false;let i=0;for(const ch of name)if(ch===hint[i])i++;return i===hint.length}
      let rows=base.filter(e=>!hint||(equal?normalize(e.name)===hint:partial?normalize(e.name).includes(hint):abbreviation(normalize(e.name)))),unknownTimes=rows.filter(e=>!e.startTime).length
      const courseUnmatched=!!hint&&!rows.length&&!!base.length
      const unmatchedClocks=rows.filter(e=>!e.startTime || !e.endTime)
      if(['WAIT_START','WAIT_END','DURATION'].includes(q.detail))rows=rows.filter(e=>e.startTime&&e.endTime)
      if(q.period==='AM')rows=rows.filter(e=>e.startTime&&e.startTime<'12:00')
      if(q.period==='PM')rows=rows.filter(e=>e.startTime&&e.startTime>='12:00'&&e.startTime<'18:00')
      if(q.period==='EVENING')rows=rows.filter(e=>e.startTime&&e.startTime>='18:00')
      rows.sort((a,b)=>(a.date+(a.startTime||'99:99')).localeCompare(b.date+(b.startTime||'99:99')))
      const fullTime=t=>t?.length===5?`${t}:00`:t,stamp=e=>`${e.date}T${fullTime(e.startTime)}`,end=e=>`${e.date}T${fullTime(e.endTime)}`,clock=now.slice(0,19)
      if(q.selection==='NEXT')rows=rows.filter(e=>e.startTime&&(q.anchor?stamp(e)>q.anchor:stamp(e)>=clock))
      if(q.selection==='PREVIOUS')rows=rows.filter(e=>e.startTime&&e.endTime&&(q.anchor?stamp(e)<q.anchor:end(e)<=clock))
      if(q.selection==='CURRENT')rows=rows.filter(e=>e.startTime&&stamp(e)<=clock&&end(e)>clock)
      if(q.selection==='REMAINING')rows=rows.filter(e=>e.endTime&&end(e)>clock)
      if(q.selection==='AT')rows=rows.filter(e=>e.startTime&&stamp(e)===q.anchor)
      const known=rows.filter(e=>e.startTime&&e.endTime),threshold=(q.anchor||clock).slice(0,10),first=known[0]?.date,last=known.at(-1)?.date
      const uncertain=unmatchedClocks.filter(e=>q.selection==='NEXT'?e.date>=threshold&&(!first||e.date<=first):q.selection==='PREVIOUS'?e.date<=threshold&&(!last||e.date>=last):q.selection==='FIRST'?!first||e.date<=first:q.selection==='LAST'?!last||e.date>=last:q.selection==='CURRENT'?e.date===clock.slice(0,10):false).length
      if(uncertain)rows=[]
      if(rows.length&&['NEXT','PREVIOUS','FIRST','LAST'].includes(q.selection)){
        if(q.selection==='PREVIOUS'&&!q.anchor){const latestEnd=rows.reduce((latest,e)=>end(e)>latest?end(e):latest,'');rows=rows.filter(e=>end(e)===latestEnd)}
        else{const target=['PREVIOUS','LAST'].includes(q.selection)?rows.at(-1):rows[0],point=stamp(target);rows=rows.filter(e=>e.date===target.date&&stamp(e)===point)}
      }
      if(rows.length>200)fail(400,'模拟查询超过200项，请缩小范围')
      if(imageOnly&&q.detail==='FREE')rows=[]
      const timing=fixtureScheduleTiming(q,rows,now,unknownTimes)
      const freeDates=[];if(q.detail==='FREE'&&!imageOnly&&!uncertain&&!courseUnmatched)for(let d=from;d<=to;d=addDays(d,1))if(!rows.some(e=>e.date===d))freeDates.push(d)
      const missingPeriods=rows.filter(e=>!e.startPeriod||!e.endPeriod).length
      const summary=courseUnmatched?`该日期范围有${base.length}项已保存安排，但没匹配到课程“${q.course}”。请核对课程名称或日期。`:uncertain?`有${uncertain}项安排缺少钟点，暂不能准确定位。`:!rows.length?(excluded?'查询范围内没有匹配的有效安排；已标记取消或待核对的条目未计入。':'查询范围内没有匹配的已保存安排。'):timing?.summary|| (q.detail==='PERIODS'?`已知${rows.reduce((n,e)=>n+(e.startPeriod&&e.endPeriod?e.endPeriod-e.startPeriod+1:0),0)}节课，${rows.length}项安排${missingPeriods?`；${missingPeriods}项节次待配置`:''}。`:q.detail==='COURSES'?`${new Set(rows.map(e=>e.name)).size}门课程，${rows.length}项安排。`:`共${rows.length}项安排。`)
      const notices=[...(excluded?[`所选日期范围内有${excluded}项安排标记为取消或待核对，未计入有效课程；请在完整课表核对状态，查询没有删除原件或记录。`]:[]),...(unknownTimes&&!uncertain?[`${unknownTimes}项安排的钟点待核对，时段或顺序查询可能不完整。`]:[])]
      if(sourceNotice)notices.unshift(sourceNotice)
      const unresolvedImage=imageOnly&&!rows.length
      const display={version:1,state:uncertain||courseUnmatched||unresolvedImage?'UNRESOLVED':rows.length?'READY':'EMPTY',summary:unresolvedImage&&!uncertain&&!courseUnmatched?(q.detail==='FREE'?'旧课表图片尚未核对，暂不能确认空闲日期；可改查具体日期的已授权课程。':'已保存旧课表图片，但还没有可直接查询的个人课程。'):summary,notices,freeDates,entries:rows.map(e=>({id:e.id,date:e.date,name:e.name,room:e.room||'',teacher:e.teacher||'',startTime:e.startTime??null,endTime:e.endTime??null,startPeriod:e.startPeriod??null,endPeriod:e.endPeriod??null,timeLabel:e.timeLabel,conflict:!!e.conflict,sources:e.sources}))}
      const names=courseUnmatched?[...new Set(base.map(e=>e.name))].sort():[],refinement=courseUnmatched?{version:1,courseChoices:names.length<=200?names:[],availableCount:base.length,choicesComplete:names.length<=200}:null
      return reply({version:1,from,to,period:q.period,selection:q.selection,detail:q.detail,anchor:q.anchor||null,course:q.course||'',asOf:now,count:rows.length,unknownTimes,focus:rows.length&&rows[0].startTime&&new Set(rows.map(stamp)).size===1&&(rows.length===1||!['ALL','REMAINING'].includes(q.selection))?stamp(rows[0]):null,display,refinement,queryScope:{version:1,requested:perspective,resolved:view},answer:`${from}—${to}本人已保存安排（模拟）\n\n`+(rows.length?rows.map(e=>`- ${e.date} ${e.timeLabel} ${e.name}；${e.room}；${e.teacher||'任课教师未绑定'}`).join('\n'):display.summary)+(timing?.summary&&rows.length?`\n\n${timing.summary}`:'')+(timing?`\n\n${timing.notice}`:'')+notices.map(n=>`\n\n${n}`).join('')+'\n\n这是按本页实际模拟数据查询的结果，未调用模型。'})
    }
    if (config.url === '/api/timetable/unified/day') {
      const date = config.params.date,
        view = views().includes('STUDENT')
          ? 'STUDENT'
          : views().includes('TEACHER')
            ? 'TEACHER'
            : 'STUDENT',
        w = week({ monday: mondayOf(date), view }),
        rows = w.entries.filter((e) => e.date === date && !e.cancelled)
      return reply({
        date,
        source: '本人统一课表（模拟）',
        answer:
          `${date}的课程安排（模拟）：\n\n` + (rows.length ? rows
            .map((e) => `- ${e.timeLabel} ${e.name}；${e.room}；${e.teacher || '教师未绑定'}`)
            .join('\n') : '没有已保存的安排，不代表学校停课。') + '\n\n模拟数据；来自本人导入和授权教学安排，不是实时教务同步。',
      })
    }
    if (config.url === '/api/timetable/courses') {
      if (config.method === 'get') {
        if (privateFailurePending) {
          privateFailurePending = false
          if (privateReadFailure === 'network') throw new Error('Network Error')
          fail(Number(privateReadFailure), '模拟首次私有课表读取失败；点击重试恢复')
        }
        return reply({ schedule: schedules.get(actor.id) || null })
      }
      if (config.method === 'put') {
        const old = schedules.get(actor.id)
        if (data.revision !== (old?.revision || 0)) fail(409, '模拟个人课表版本已变化')
        schedules.set(actor.id, {
          ...data,
          revision: personalEditing.nextRevision(actor),
          importedAt: now,
          checkedAt: now,
        })
        return reply({ schedule: schedules.get(actor.id) })
      }
      if (config.method === 'delete') {
        if (Number(config.params?.revision) !== (schedules.get(actor.id)?.revision || 0))
          fail(409, '模拟个人课表版本已变化')
        personalEditing.clearCurrent(actor)
        schedules.delete(actor.id)
        return reply(null)
      }
    }
    if (config.url === '/api/timetable/courses/checked') {
      const old = schedules.get(actor.id)
      if (!old || Number(config.params?.revision) !== old.revision)
        fail(409, '模拟个人课表版本已变化')
      old.checkedAt = now
      return reply({ schedule: old })
    }
    if (config.url === '/api/teaching/access') return reply({ enabled: true, views: views(),governanceEnabled:true })
    if (config.url === '/api/teaching/lessons/page') {
      const params=config.params||{},view=selectedView(params.view),page=Number(params.page||0),size=Number(params.size||50),search=String(params.search||'').trim()
      if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100||search.length>100)fail(400,'模拟课程页码或搜索无效')
      const authorized=courses.filter(c=>allows(c,view)),matches=authorized.filter(c=>c.date>=params.from&&c.date<=params.to&&(!search || [c.name,c.groupName,classes.find(b=>b.id===c.classId)?.name,c.room,lesson(c,view).teacher].some(s=>s?.includes(search)))).sort((a,b)=>stamp(a).localeCompare(stamp(b))||a.id.localeCompare(b.id))
      const total=matches.length,totalPages=Math.ceil(total/size)
      if(page>0&&page>=totalPages)fail(400,'课程页面已变化，请返回第一页')
      const active=matches.filter(c=>!c.cancelled),allCounts=counts(active.flatMap(c=>entriesFor(c,view))),absentStudents=new Set(active.flatMap(c=>entriesFor(c,view).filter(e=>e.status==='ABSENT').map(e=>e.studentId))).size
      const conflicts=new Set(active.filter(c=>authorized.some(other=>other!==c&&!other.cancelled&&stamp(other)<stamp(c,true)&&stamp(other,true)>stamp(c)&&(view==='TEACHER'||entriesFor(c,view).some(e=>entriesFor(other,view).some(o=>o.studentId===e.studentId))))).map(c=>c.id)),rows=matches.slice(page*size,(page+1)*size)
      return reply({items:rows.map(c=>lesson(c,view)),page,size,total,totalPages,summary:{counts:allCounts,absentStudents},planned:active.length,today:active.filter(c=>c.date===today).length,conflicts:conflicts.size,conflictIds:rows.filter(c=>conflicts.has(c.id)).map(c=>c.id)})
    }
    if (config.url === '/api/teaching/lessons') {
      const view = selectedView(config.params.view)
      return reply(
        courses
          .filter(
            (c) => allows(c, view) && c.date >= config.params.from && c.date <= config.params.to,
          )
          .map((c) => lesson(c, view)),
      )
    }
    if (config.url === '/api/teaching/notices') return reply(visibleNotices())
    const notice = /^\/api\/teaching\/notices\/([a-f0-9-]+)\/read$/.exec(config.url)
    if (notice) {
      const value = [...notices.values()].find((n) => n.id === notice[1] && n.userId === actor.id)
      if (!value) fail(404, '通知不属于当前模拟账号')
      value.readAt = new Date(now).toISOString()
      return reply(null)
    }
    const auditMatch=/^\/api\/teaching\/lessons\/([a-f0-9-]+)\/audit$/.exec(config.url)
    if(auditMatch) {
      const c=courses.find(c=>c.id===auditMatch[1]),view=selectedView(config.params.view),page=Number(config.params.page||0),size=Number(config.params.size||25)
      if(!c || !allows(c,view))fail(404,'课程不在当前模拟账号范围')
      if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100)fail(400,'模拟记录页码无效')
      const allowed=new Set(entriesFor(c,view).map(e=>e.studentId))
      const rows=audit.map((row,index)=>{
        const member=c.entries.find(e=>e.studentId===row.studentId),expires=new Date(row.at),year=expires.getUTCFullYear()+1,month=expires.getUTCMonth(),day=expires.getUTCDate()
        expires.setUTCFullYear(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate()))
        return{...row,id:uid(60000+index),studentNumber:member?.studentNumber||'',studentName:member?.name||'',actorName:actors.find(a=>a.id===row.actorId)?.nickname||'历史模拟账号',oldStatus:row.old,newStatus:row.status,reason:row.reason||'',recordedAt:row.at,expiresAt:expires.toISOString(),expired:expires.getTime()<=Date.parse(now)}
      }).filter(row=>row.lessonId===c.id&&allowed.has(row.studentId)).reverse()
      const total=rows.length,totalPages=Math.ceil(total/size)
      if(page>0&&page>=totalPages)fail(400,'模拟记录页面已变化')
      return reply({lessonId:c.id,view,items:rows.slice(page*size,(page+1)*size),page,size,total,totalPages,retentionYears:1,expiredWithinScope:rows.filter(r=>r.expired).length,deletionEnabled:false})
    }
    const detailPage=/^\/api\/teaching\/lessons\/([a-f0-9-]+)(\/attendance)?\/page$/.exec(config.url)
    if(detailPage){
      const params=config.params || {},page=Number(params.page || 0),size=Number(params.size || 50),search=String(params.search || '').trim(),c=courses.find(row=>row.id===detailPage[1]),view=detailPage[2]?'TEACHER':selectedView(params.view)
      if(!c || !allows(c,view))fail(404,'课程不在当前模拟账号范围')
      const filtered=entriesFor(c,view).filter(e=>!search || e.name.includes(search) || e.studentNumber.includes(search)),total=filtered.length,totalPages=Math.ceil(total/size)
      if(!Number.isInteger(page)||page<0||!Number.isInteger(size)||size<1||size>100||(page>0&&page>=totalPages))fail(400,'模拟名单页码无效')
      const response=await adapter({...config,url:config.url.slice(0,-5),syntheticPaged:true}),detail=response.data
      return reply({detail:{...detail,entries:detail.entries.filter(e=>!search || e.name.includes(search) || e.studentNumber.includes(search)).slice(page*size,(page+1)*size)},page,size,search,total,totalPages})
    }
    const match = /^\/api\/teaching\/lessons\/([a-f0-9-]+)(\/attendance)?$/.exec(config.url)
    if (match) {
      const c = courses.find((c) => c.id === match[1]),
        view = match[2] ? 'TEACHER' : selectedView(config.params.view)
      if (!c || !allows(c, view)) fail(404, '课程不在当前模拟账号范围')
      if(entriesFor(c,view).length>300 && !config.syntheticPaged)fail(400,'超过旧完整名单上限，请使用分页')
      if (match[2]) {
        if (c.teacherId !== actor.id) fail(403, '只有任课模拟教师可点名')
        if (c.revision !== data.revision) fail(409, '模拟点名版本已变化')
        if (c.cancelled || Date.parse(now) < Date.parse(stamp(c)) - 300000)
          fail(409, '未到课前5分钟或课程已取消')
        if (
          !Array.isArray(data.marks) ||
          new Set(data.marks.map((m) => m.studentId)).size !== data.marks.length ||
          data.marks.some(
            (m) =>
              !['UNKNOWN', 'ON_TIME', 'LATE', 'ABSENT', 'EXCUSED','EARLY_LEAVE'].includes(m.status) ||
              !c.entries.some((e) => e.studentId === m.studentId && !e.withdrawn),
          )
        )
          fail(400, '模拟点名目标或状态无效')
        if (data.marks.some((m) => m.status === 'ABSENT') && Date.parse(now) < Date.parse(stamp(c)))
          fail(400, '开课前不能记旷课')
        if(data.marks.some(m=>m.status==='EARLY_LEAVE') && Date.parse(now)<Date.parse(stamp(c)))fail(400,'开课前不能记早退')
        if (
          data.marks.some((m) => {
            const e = c.entries.find((e) => e.studentId === m.studentId)
            return e.status !== m.status && e.status !== 'UNKNOWN'
          }) &&
          !data.reason
        )
          fail(400, '更正需要原因')
        const next = c.entries.map((e) => ({
          ...e,
          status: data.marks.find((m) => m.studentId === e.studentId)?.status || e.status,
        }))
        if (data.finish && next.some((e) => !e.withdrawn && e.status === 'UNKNOWN')) fail(400, '还有待点名同学')
        const finalized = (c.finalized || data.finish) && !next.some(e => !e.withdrawn && e.status === 'UNKNOWN')
        const changed = finalized !== c.finalized || next.some((e,i) => e.status !== c.entries[i].status)
        for (const e of c.entries) {
          const n = next.find((n) => n.studentId === e.studentId)
          if (n.status !== e.status)
            audit.push({
              lessonId: c.id,
              studentId: e.studentId,
              actorId: actor.id,
              old: e.status,
              status: n.status,
              reason: data.reason,
              at: now,
            })
        }
        c.entries = next
        if (changed) c.revision++
        c.finalized = finalized
      }
      const canMark =
        view === 'TEACHER' && !c.cancelled && Date.parse(now) >= Date.parse(stamp(c)) - 300000
      return reply({
        lesson: lesson(c, view),
        entries: entriesFor(c, view),
        canMark,
        canRecordAbsence: canMark && Date.parse(now) >= Date.parse(stamp(c)),
      })
    }
    if (config.url === '/api/admin/teaching/scopes/page' && config.method === 'get') {
      if (actor.role !== 'ADMIN') fail(403, '需要模拟管理员')
      const { kind = 'CLASS', selected = '', search = '', page = 0, size = 25 } = config.params || {}
      if (!['CLASS', 'COLLEGE','COURSE','TEACHER'].includes(kind) || !Number.isInteger(Number(page)) || Number(page) < 0 || !Number.isInteger(Number(size)) || Number(size) < 1 || Number(size) > 100) fail(400, '模拟配置分页参数无效')
      const options = kind==='TEACHER'?actors.filter(a=>a.schoolId===actor.schoolId&&approvedIdentity(a.id,'TEACHER')).map(a=>({value:String(a.id),label:a.nickname,description:a.username})):kind==='COURSE'?[...new Map(courses.map(c=>[c.courseId || c.id,{value:c.courseId || c.id,label:c.name,description:c.semester || '模拟学期'}])).values()]:kind === 'CLASS' ? classes.map(c => ({ value: c.id, label: c.name, description: c.college })) : [...new Set(classes.map(c => c.college))].sort().map(name => ({ value: name, label: name, description: '' }))
      const filtered = options.filter(row => row.label.includes(search) || row.description.includes(search)), total = filtered.length, totalPages = Math.ceil(total / Number(size))
      if (Number(page) > 0 && Number(page) >= totalPages) fail(400, '模拟配置页码不存在')
      return reply({ items: filtered.slice(Number(page) * Number(size), (Number(page) + 1) * Number(size)), selected: options.find(row => row.value === selected) || null, page: Number(page), size: Number(size), total, totalPages })
    }
    if (config.url.startsWith('/api/admin/teaching'))
      fail(actor.role === 'ADMIN' ? 501 : 403, '模拟高级配置不在本轮闭环内；不返回假成功')
    return null
  }
  dispatch()
  return {
    adapter,
    actors: () => structuredClone(actors),
    principal: () => structuredClone(actor),
    setActor: (id) => {
      actor = actors.find((a) => a.id === Number(id)) || actors[0]
      return structuredClone(actor)
    },
    clock: () => now,
    advanceTo: (time) => {
      now = `${today}T${time}:00+08:00`
      return dispatch()
    },
    audit: () => structuredClone(audit),
    identityAudit: () => structuredClone(identityAudit),
  }
}
