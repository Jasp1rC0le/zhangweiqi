// Explicit owner-selected grade source, deterministic arithmetic, never a grade conversion rule.
export const ACADEMIC_TEMPLATE =
  '学期,课程代码,课程名称,学分,成绩,绩点,计入GPA\n示例学期,DEMO101,合成课程,2,85,3.5,是\n'
function csv(text) {
  if (typeof text !== 'string' || text.length > 100000)
    throw new Error('成绩文字限10万字符，请拆分。')
  const rows = []
  let row = [],
    cell = '',
    quoted = false,
    closed = false
  for (let i = 0; i <= text.length; i++) {
    const c = i === text.length ? '\n' : text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
          closed = true
        }
      } else {
        if (i === text.length) throw new Error('CSV引号未闭合')
        cell += c
      }
      continue
    }
    if (c === '"') {
      if (cell || closed) throw new Error('CSV引号位置错误')
      quoted = true
      continue
    }
    if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell.trim())
      cell = ''
      closed = false
      if (c !== ',') {
        if (row.some(Boolean)) rows.push(row)
        row = []
        if (c === '\r' && text[i + 1] === '\n') i++
      }
      continue
    }
    if (closed && !/\s/.test(c)) throw new Error('引号字段后出现多余内容')
    cell += c
  }
  return rows
}
export function parseAcademicRecords(text) {
  const rows = csv(text.replace(/^\uFEFF/, '')),
    headers = rows.shift()
  const required = ['学期', '课程代码', '课程名称', '学分', '成绩', '绩点', '计入GPA']
  if (
    !headers ||
    headers.length !== 7 ||
    new Set(headers).size !== 7 ||
    required.some((h) => !headers.includes(h))
  )
    throw new Error(
      '请按模板提供学期、课程代码、课程名称、学分、成绩、绩点、计入GPA七列。不会猜测分数到绩点的换算规则。',
    )
  if (!rows.length || rows.length > 200) throw new Error('一次提供1至200条本人成绩记录。')
  const seen = new Set()
  return rows.map((values, index) => {
    if (values.length !== 7) throw new Error(`第${index + 2}行不是7列。`)
    const r = Object.fromEntries(headers.map((h, i) => [h, values[i]])),
      key = `${r.学期}\0${r.课程代码}`
    if (
      !r.学期 ||
      !r.课程代码 ||
      !r.课程名称 ||
      !r.成绩 ||
      [r.学期, r.课程代码, r.课程名称, r.成绩].some((v) => v.length > 100) ||
      seen.has(key)
    )
      throw new Error(
        `第${index + 2}行缺少字段或同学期课程代码重复；重修规则须先人工明确，不会自动挑最高分。`,
      )
    seen.add(key)
    if (
      !/^\d{1,3}(?:\.\d{1,2})?$/.test(r.学分) ||
      Number(r.学分) > 100 ||
      !['是', '否'].includes(r.计入GPA) ||
      (r.绩点 && !/^(?:[0-9](?:\.\d{1,3})?|10(?:\.0{1,3})?)$/.test(r.绩点))
    )
      throw new Error(`第${index + 2}行学分、绩点或计入标记无效。`)
    return {
      semester: r.学期,
      code: r.课程代码,
      name: r.课程名称,
      credits: Number(r.学分),
      grade: r.成绩,
      points: r.绩点 === '' ? null : Number(r.绩点),
      included: r.计入GPA === '是',
    }
  })
}
export function academicSummary(records) {
  const included = records.filter((r) => r.included && r.credits > 0),
    credits = included.reduce((n, r) => n + r.credits, 0),
    missing = included.filter((r) => r.points === null).length
  return {
    records: records.length,
    credits: Number(credits.toFixed(2)),
    missing,
    gpa:
      credits > 0 && !missing
        ? Number((included.reduce((n, r) => n + r.credits * r.points, 0) / credits).toFixed(3))
        : null,
  }
}
export function resolveAcademicIntent(text) {
  const value = String(text || '')
    .trim()
    .replace(/[《“「"][^》”」"]*[》”」"]/g, '')
  if(/(?:写|开发|实现|解释|调试|优化).*(?:代码|算法|函数|接口|组件|脚本)|知识库|政策|制度|流程|规定|规则|公式/.test(value))return null
  if (/新增|新建|添加|导入课程|课表|上课|教学安排/.test(value)) return null
  if (
    !/成绩|绩点|GPA|学号/i.test(value) ||
    /如何|怎么算|怎么计算|怎么提升|如何提升|什么是/.test(value)
  )
    return null
  if(/修改|更正|删除|设为|改成|覆盖|录入|导入/.test(value))return {kind:'READ_ONLY'}
  const target = /(?:查(?:一下|看)?|看看)\s*(.{1,20}?)(?:的)?(?:成绩|绩点|GPA|学号)/i
    .exec(value)?.[1]
    ?.trim()
  if (
    target &&
    !/^(?:我|我的|本人|本人的|自己|自己的|我自己的|本学期|这学期|上学期|下学期|本学期的|这学期的|上学期的)$/.test(
      target,
    )
  )
    return { kind: 'DENIED' }
  if (
    /(?:同学|学生|老师|全班|班里|别人的|他|她).*(?:成绩|绩点|GPA|学号)/i.test(value) &&
    !/我(?:自己)?的|本人/.test(value)
  )
    return { kind: 'DENIED' }
  if (/我的|本人|我自己|查|看|多少|成绩呢|绩点呢|学号呢/i.test(value))
    return { kind: /学号/.test(value) ? 'NUMBER' : /绩点|GPA/i.test(value) ? 'GPA' : 'GRADES' }
  return null
}
