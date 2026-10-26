// Synthetic, dev-only data. Never reads school data or reaches the backend.
export function createTimetableFixture({ saved = false, coursesSaved = false } = {}) {
  let timetable = null,
    image = null,
    schedule = null,
    scheduleRevision = 0
  function snapshot(revision = 1) {
    return {
      revision,
      semester: '2026—2027学年 第1学期（设计示例）',
      firstMonday: '2026-09-07',
      startWeek: 1,
      endWeek: 18,
      remindDays: 7,
      imageSha256: `fixture-${revision}`,
      importedAt: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
    }
  }
  async function syntheticImage() {
    const canvas = document.createElement('canvas')
    canvas.width = 1000
    canvas.height = 550
    const c = canvas.getContext('2d')
    c.fillStyle = '#fff'
    c.fillRect(0, 0, 1000, 550)
    c.fillStyle = '#273449'
    c.font = '24px sans-serif'
    c.fillText('课表排版示例 · 非真实课程', 24, 40)
    for (let day = 0; day < 7; day++) {
      const x = 105 + day * 126
      c.fillStyle = '#526377'
      c.font = '16px sans-serif'
      c.fillText(['周一', '周二', '周三', '周四', '周五', '周六', '周日'][day], x + 24, 85)
      for (let slot = 0; slot < 4; slot++) {
        c.strokeStyle = '#d7dce5'
        c.strokeRect(x, 105 + slot * 100, 125, 100)
      }
    }
    for (const [day, slot, text] of [
      [0, 0, '课程示例A'],
      [1, 1, '课程示例B'],
      [2, 0, '实验示例'],
      [3, 2, '课程示例C'],
      [4, 1, '课程示例D'],
    ]) {
      const x = 105 + day * 126,
        y = 105 + slot * 100
      c.fillStyle = '#edf1fb'
      c.fillRect(x + 4, y + 4, 117, 92)
      c.fillStyle = '#344764'
      c.fillText(text, x + 12, y + 34)
      c.fillText('教室示例', x + 12, y + 63)
    }
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  }
  async function adapter(config) {
    if (config.url.startsWith('/api/timetable/courses')) {
      if (coursesSaved && !schedule) {
        schedule = {
          revision: ++scheduleRevision,
          semester: '2026—2027学年 第1学期（合成课表示例）',
          firstMonday: '2026-09-07',
          remindDays: 7,
          courses: [
            { name: '课程示例A', weekday: 1, startTime: '08:00', endTime: '09:40', weeks: [1, 3, 5, 7, 9, 11, 13, 15], room: '教室示例' },
            { name: '课程示例B', weekday: 2, startTime: '10:00', endTime: '11:40', weeks: [2, 4, 6, 8, 10, 12, 14, 16], room: '教室示例' },
          ],
          importedAt: new Date().toISOString(),
          checkedAt: new Date().toISOString(),
        }
        coursesSaved = false
      }
      if (config.method === 'get')
        return { data: { schedule }, status: 200, statusText: 'OK', headers: {}, config }
      if (config.method === 'put') {
        const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
        if (body.revision !== (schedule?.revision || 0)) throw new Error('示例版本冲突')
        schedule = {
          ...body,
          revision: ++scheduleRevision,
          importedAt: new Date().toISOString(),
          checkedAt: new Date().toISOString(),
        }
      } else if (config.method === 'post')
        schedule = { ...schedule, checkedAt: new Date().toISOString() }
      else if (config.method === 'delete') schedule = null
      return { data: { schedule }, status: 200, statusText: 'OK', headers: {}, config }
    }
    if (saved && !timetable) {
      timetable = snapshot()
      image = await syntheticImage()
      saved = false
    }
    let data
    if (config.method === 'get' && config.url.endsWith('/image')) data = image
    else if (config.method === 'get') data = { timetable }
    else if (config.method === 'put') {
      const metadata = JSON.parse(await config.data.get('metadata').text())
      timetable = {
        ...snapshot((timetable?.revision || 0) + 1),
        ...metadata,
        revision: (timetable?.revision || 0) + 1,
      }
      image = config.data.get('image')
      data = { timetable }
    } else if (config.method === 'post') {
      timetable = { ...timetable, checkedAt: new Date().toISOString() }
      data = { timetable }
    } else if (config.method === 'delete') {
      timetable = null
      image = null
      data = null
    } else throw new Error('Unsupported fixture operation')
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  return { adapter, hasSavedImage: () => !!timetable || saved }
}
