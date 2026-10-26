// Runs only when the user invokes the bookmark on their own school timetable page.
// Call the page's existing course service: never read or copy authentication material.
export async function exportSchoolTimetable(env = window) {
  const doc = env.document
  if (
    env.location.origin !== 'https://zdjw.tsguas.edu.cn' ||
    !env.location.pathname.startsWith('/app-web/')
  ) {
    env.alert('请先在学校教务系统登录，打开“课表”并选好学期，再点击此书签。')
    return
  }
  if (doc.getElementById('campthink-timetable-export')) return
  const root = [...doc.querySelectorAll('app-page-common-course-table')].find(
    (el) => el.getClientRects().length,
  )
  const page = root && env.ng?.probe?.(root)?.componentInstance
  const common = page?.commonPageService
  const semesterId = common?.selectedSemesterId,
    bizTypeId = common?.selectedBizTypeId
  const semester = common?.semesterMap?.get(semesterId)
  const weeks = page?.semesterWeekMap?.get(semesterId)?.weekArray
  if (
    !page?.courseTablePageService?.getCourseTables ||
    !semester ||
    !Array.isArray(weeks) ||
    !weeks.length ||
    weeks.length > 30 ||
    Number(semester.weekStartDay) !== 1
  ) {
    env.alert(
      '当前页面不支持此导出工具。请确认已登录并打开课表；若学校升级了页面，请勿复制登录信息，改用教务原生导出文件。',
    )
    return
  }
  if (
    !env.confirm(
      `导出当前学期“${String(semester.text || '').slice(0, 100)}”的已排课程？\n将逐周读取${weeks.length}周，仅下载课程、任课教师、日期、节次和教室到本机，不上传文件，不改变选课。请保持此页与账号不变。`,
    )
  )
    return
  const panel = doc.createElement('div'),
    status = doc.createElement('p'),
    cancel = doc.createElement('button')
  panel.id = 'campthink-timetable-export'
  panel.style.cssText =
    'position:fixed;z-index:2147483647;bottom:16px;left:16px;right:16px;max-width:520px;padding:16px;background:#fffefa;color:#252e42;border:1px solid #dedfd7;border-radius:16px;font:16px/1.6 sans-serif'
  status.setAttribute('role', 'status')
  cancel.textContent = '取消导出'
  panel.append(status, cancel)
  doc.body.append(panel)
  let cancelled = false,
    stale = false,
    complete = false
  // Any cross-tab storage change invalidates this run without inspecting its key or value.
  const invalidate = () => {
    stale = true
  }
  env.addEventListener?.('storage', invalidate)
  env.addEventListener?.('pagehide', invalidate)
  cancel.onclick = () => {
    cancelled = true
    panel.remove()
  }
  const groups = new Map(),
    deadline = Date.now() + 240000
  const day = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new Error('日期格式变化，已停止')
    const date = new Date(value + 'T00:00:00Z')
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
      throw new Error('日期无效，已停止')
    return date.getTime() / 86400000
  }
  const safe = (value) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 100 &&
    // oxlint-disable-next-line no-control-regex -- Export only clean single-line course fields.
    !/[\u0000-\u001f\u007f]/.test(value)
  let firstDay
  const current = () =>
    !cancelled &&
    !stale &&
    Date.now() < deadline &&
    root.isConnected &&
    root.getClientRects().length &&
    env.ng?.probe?.(root)?.componentInstance === page &&
    common.selectedSemesterId === semesterId &&
    common.selectedBizTypeId === bizTypeId
  try {
    firstDay = day(weeks[0].startDate)
    if (!safe(semester.text) || new Date(firstDay * 86400000).getUTCDay() !== 1)
      throw new Error('学期信息不完整，已停止')
    for (let index = 0; index < weeks.length; index++) {
      if (!current()) throw new Error('页面、学期改变或已取消，请重新导出')
      const range = weeks[index]
      if (
        day(range.startDate) !== firstDay + index * 7 ||
        day(range.endDate) !== firstDay + index * 7 + 6
      )
        throw new Error('周次范围不连续，已停止，未生成不完整文件')
      status.textContent = `正在读取第${index + 1}/${weeks.length}周，请勿切换账号或页面…`
      let timer
      const rows = await Promise.race([
        page.courseTablePageService.getCourseTables(
          semesterId,
          bizTypeId,
          index + 1,
          range.startDate,
          range.endDate,
        ),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('本周查询超过12秒，请稍后重试')), 12000)
        }),
      ]).finally(() => clearTimeout(timer))
      if (!current()) throw new Error('页面或学期已变化，请重新导出')
      if (!Array.isArray(rows) || rows.length > 500)
        throw new Error('教务返回格式变化或登录失效，未生成文件')
      for (const row of rows) {
        const date = day(row.date),
          start = Number(row.start_unit),
          end = Number(row.end_unit)
        if (
          date < day(range.startDate) ||
          date > day(range.endDate) ||
          !safe(row.course_name) ||
          !/^\d{1,2}$/.test(String(row.start_unit)) ||
          !/^\d{1,2}$/.test(String(row.end_unit)) ||
          start < 1 ||
          end > 16 ||
          start > end
        )
          throw new Error('课程日期或节次异常，未生成文件')
        if (row.rooms != null && (!Array.isArray(row.rooms) || row.rooms.length > 10))
          throw new Error('教室格式发生变化，已停止')
        const room = (row.rooms || [])
          .map((r) => {
            if (
              (r.building != null && typeof r.building !== 'string') ||
              (r.name != null && typeof r.name !== 'string')
            )
              throw new Error('教室格式无效')
            return `${r.building || ''}${r.name || ''}`.trim()
          })
          .join(' / ')
        if (room && !safe(room)) throw new Error('教室文字异常，已停止')
        // Only explicit, single-line course teacher fields; never infer an account or read a roster.
        const suppliedTeacher = row.teacher_name ?? row.teacherName ?? ''
        if (typeof suppliedTeacher !== 'string' || suppliedTeacher && !safe(suppliedTeacher))
          throw new Error('任课教师字段结构或文字已变化，请使用教务原生导出文件')
        const teacher = suppliedTeacher.trim()
        const course = {
          name: row.course_name.trim(),
          weekday: ((date - firstDay) % 7) + 1,
          startPeriod: start,
          endPeriod: end,
          room,
          ...(teacher ? { teacher } : {}),
          weeks: [],
        }
        const key = JSON.stringify([course.name, course.weekday, start, end, room, teacher])
        const existing = groups.get(key) || course
        if (!existing.weeks.includes(index + 1)) existing.weeks.push(index + 1)
        groups.set(key, existing)
        if (groups.size > 120) throw new Error('课程安排超过120条，请使用学校原生导出')
      }
      if (index + 1 < weeks.length) await new Promise((resolve) => setTimeout(resolve, 350))
    }
    if (!groups.size || !current()) throw new Error('未得到可用课程，已保留原有课表')
    const result = {
      format: 'campthink-school-timetable',
      version: 1,
      sourceOrigin: env.location.origin,
      semester: semester.text,
      firstMonday: weeks[0].startDate,
      coveredWeeks: weeks.map((_, i) => i + 1),
      exportedAt: new Date().toISOString(),
      courses: [...groups.values()],
    }
    const url = env.URL.createObjectURL(
      new Blob([JSON.stringify(result)], { type: 'application/json' }),
    )
    const link = doc.createElement('a')
    link.href = url
    link.download = '中德整学期课表.json'
    doc.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => env.URL.revokeObjectURL(url), 10000)
    complete = true
    status.textContent = `已读取${weeks.length}周，下载${groups.size}条课程安排。回到 Campthink 上传此 JSON 文件，核对差异后保存。未排时间的课程不包含在内。`
  } catch (failure) {
    if (!cancelled) status.textContent = failure.message || '导出失败，未生成文件，请重新登录后再试'
  } finally {
    env.removeEventListener?.('storage', invalidate)
    env.removeEventListener?.('pagehide', invalidate)
    cancel.textContent = complete ? '完成' : '关闭'
  }
}

// Preserve line breaks, comments and percent operators through the browser URL parser.
export const schoolTimetableBookmark = `javascript:${encodeURIComponent(`void (${exportSchoolTimetable.toString()})()`)}`
