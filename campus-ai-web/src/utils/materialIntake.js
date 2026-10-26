// Local, bounded extraction of user-supplied facts. This is not an LLM or an
// authorization decision. Source text is never interpreted as an instruction.
export const MATERIAL_TEXT_LIMIT = 50000
export const MATERIAL_HELP = {
  knowledge: {
    title: '提交校园资料',
    required: '准备正文或文字版文件；有原文链接就一起发来。',
    optional: '标题会从首行整理，可修改；来源不明请如实说明。',
    result: '只进入管理员待审核列表，不直接公开。',
  },
  merchant: {
    title: '整理商家资料',
    required: '至少说清店名、所属食堂；补上楼层或档口、卖什么会更好找。',
    optional:
      '照片可选：管理员保存草稿后，可在商家管理上传 JPEG / PNG，5 MB 内。不需要身份证、银行卡或证照原件。',
    result: '管理员保存为草稿后另行核实发布；其他账号先提交申请。',
  },
}

export function materialRouteText(text) {
  // Appended documents are data, not another chance to dispatch a write action.
  return String(text || '')
    .split(/(?:^|\n)【附件：/)[0]
    .trim()
}
export function resolveMaterialIntake(text) {
  const input = materialRouteText(text).slice(0, 3000)
  if (!input || /^(?:如何|怎么|为什么|不要|别|取消)|(?:如何|怎么)(?:上传|提交|添加)/.test(input))
    return null
  const command =
    /^(?:(?:请|帮我|麻烦你?|我想|我要|现在|先)\s*)*(?:上传|提交|新增|添加|录入|补充|整理|发一份|提供)/.test(
      input,
    )
  if (!command) return null
  const mode = /商家|店铺|档口/.test(input)
    ? 'merchant'
    : /校园资料|学校资料|上传资料|提交资料|补充校园信息|资料审核/.test(input)
      ? 'knowledge'
      : null
  return mode ? { kind: 'MATERIAL_INTAKE', seed: { mode, text: input } } : null
}

function bounded(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('先发一段资料，或选择文字版文件。')
  if (text.length > MATERIAL_TEXT_LIMIT)
    throw new Error('资料超过5万字符，请分成几份；不会截断后提交。')
  return text.replace(/\r\n?/g, '\n').trim()
}
const aliases = {
  name: '店名|商家名称|商家名|店铺名称',
  canteenName: '所属食堂|食堂名称|所在食堂|食堂',
  location: '位置|地址|楼层档口|档口位置|档口|地点',
  description: '介绍|简介|主营|主要卖|卖什么',
  question: '资料标题|标题|对应问题',
  sourceUrl: '原文链接|来源链接|来源网址',
  contactName: '申请人称呼|申请人|联系人|称呼',
  contact: '回复方式|回复邮箱|联系邮箱|联系方式|邮箱',
}
function fields(text) {
  const labels = Object.values(aliases).join('|'),
    values = {},
    conflicts = [],
    privateSpans = []
  for (const [key, label] of Object.entries(aliases)) {
    const pattern = new RegExp(
      `(?:^|[\n，,；;。])\\s*(?:${label})\\s*(?:[:：]|改为|改成|是|叫)\\s*([\\s\\S]*?)(?=\\n|[；;]|[，,。]\\s*(?:${labels})\\s*(?:[:：]|改为|改成|是|叫)|$)`,
      'g',
    )
    const found = [...text.matchAll(pattern)]
    if (key === 'contactName' || key === 'contact') {
      for (const match of found) privateSpans.push([match.index, match.index + match[0].length])
    }
    const matches = found.map((m) => m[1].trim()).filter(Boolean)
    const distinct = [...new Set(matches)]
    if (distinct.length > 1) conflicts.push(key)
    else if (distinct.length) values[key] = distinct[0]
  }
  let publicContent = text
  for (const [start, end] of privateSpans.sort((a, b) => b[0] - a[0]))
    publicContent = publicContent.slice(0, start) + '\n' + publicContent.slice(end)
  return { values, conflicts, publicContent: publicContent.trim() }
}
export function privateMaterialReason(text) {
  if (
    /(?:学号|身份证(?:号)?)\s*[:：]\s*\d{8,}/.test(text) ||
    /(?:^|\n)[^\n]{0,30}学号[^\n]{0,30}姓名[^\n]*(?:成绩|分数|考勤|旷课|手机号)/.test(text) ||
    /(?:^|\n)[^\n]{0,150}学分[^\n]{0,100}(?:成绩|绩点)/.test(text)
  )
    return '资料中可能有已填写的学生身份、成绩或考勤。请移除个人记录，或改用本人课表/教学管理；不要提交公共资料。'
  return ''
}
function sourceUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  let url
  try {
    url = new URL(text)
  } catch {
    throw new Error('来源链接须是完整的 http 或 https 地址。')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    text.length > 1000 ||
    /\s/.test(text)
  )
    throw new Error('来源链接须是无账号密码的 http 或 https 地址。')
  return text
}
export function organizeMaterial(text, mode, { fileName = '', patch = false } = {}) {
  const content = bounded(text),
    parsed = fields(content)
  if (!['merchant', 'knowledge'].includes(mode)) throw new Error('请先选择校园资料或商家资料。')
  const relevant =
    mode === 'merchant'
      ? ['name', 'canteenName', 'location', 'description', 'contactName', 'contact']
      : ['question', 'sourceUrl']
  if (parsed.conflicts.some((key) => relevant.includes(key)))
    throw new Error(
      '同一字段出现不同内容，请一次整理一家商家/一份资料，或在预览中明确修改；原文仍保留。',
    )
  const values = parsed.values
  if (mode === 'merchant') {
    const draft = Object.fromEntries(
      ['name', 'canteenName', 'location', 'description', 'contactName', 'contact']
        .filter((k) => values[k] !== undefined)
        .map((k) => [k, values[k]]),
    )
    // Entity slots may also be stated in a sentence. Ambiguous entities stay
    // empty rather than assigning the nearest canteen or inventing a shop name.
    const names = [
      ...new Set(
        [
          ...content.matchAll(
            /(?:新增|添加|录入)(?:一家)?(?:商家|店铺|档口)\s*[“「《"]([^”」》"\n]{1,120})[”」》"]|(?:这家店|店铺|商家|面馆|餐厅)(?:名字)?叫\s*([^，,；;。\n]{1,120})/g,
          ),
        ].map((m) => (m[1] || m[2]).trim()),
      ),
    ]
    const foodHalls = [...new Set(content.match(/第?[一二三四五六七八九十\d]{1,3}食堂/g) || [])]
    if (!draft.name && names.length === 1) draft.name = names[0]
    if (!draft.canteenName && foodHalls.length === 1) draft.canteenName = foodHalls[0]
    if (names.length > 1 || (!draft.canteenName && foodHalls.length > 1))
      throw new Error('发现多个店名或食堂，请明确只整理哪一家；没有猜测对应关系。')
    if (!draft.location)
      draft.location =
        content.match(
          /(?:[一二三四五六七八九十\d]+楼|[一二三四五六七八九十\d]+层)\s*(?:[第号\d\s·-]*)(?:号窗口|号档口|窗口|档口)/,
        )?.[0] || ''
    if (!patch && !draft.description)
      draft.description = parsed.publicContent.length <= 1000 ? parsed.publicContent : ''
    if (draft.contact) draft.contact = draft.contact.replace(/[，,。；;]+$/, '')
    return { draft, content, missing: ['name', 'canteenName'].filter((k) => !draft[k]) }
  }
  const first =
    content.split('\n').find((line) => line.trim() && !/^https?:\/\//.test(line.trim())) || ''
  const draft = {
    ...(!patch
      ? {
          question:
            values.question ||
            fileName.replace(/\.[^.]+$/, '') ||
            first.replace(/^#+\s*/, '').slice(0, 200),
          content,
        }
      : {}),
    ...(values.question ? { question: values.question } : {}),
  }
  const link =
    values.sourceUrl || (!patch ? content.match(/https?:\/\/[^\s<>"，。；）)]+/)?.[0] : '')
  if (link) draft.sourceUrl = sourceUrl(link)
  return { draft, content, missing: [] }
}
const id = (value) => Number.isSafeInteger(value) && value > 0
function collection(rows) {
  if (
    !Array.isArray(rows) ||
    rows.length > 2000 ||
    rows.some((r) => !r || !id(r.id)) ||
    new Set(rows.map((r) => r.id)).size !== rows.length
  )
    throw new Error('列表响应不完整或异常，请重新读取；没有提交。')
  return rows
}
const trim = (value, max, label, required = false) => {
  const text = String(value || '').trim()
  if ((required && !text) || text.length > max)
    throw new Error(`${label}${required && !text ? '还没填写' : `不能超过${max}字符`}。`)
  return text
}
export function planMaterial(form, user, context = {}) {
  if (!id(user?.id) || !id(user?.schoolId)) throw new Error('请先正常登录本校账号。')
  if (!form.publicConsent)
    throw new Error('请先确认资料可交管理员核实，且没有私人名单、成绩、考勤或课表。')
  const privacy = privateMaterialReason(form.content || form.description || '')
  if (privacy) throw new Error(privacy)
  if (form.mode === 'knowledge') {
    const payload = {
      question: trim(form.question, 1000, '资料标题', true),
      content: trim(form.content, 100000, '资料正文', true),
      sourceUrl: sourceUrl(form.sourceUrl) || null,
    }
    if (
      collection(context.mine).some(
        (r) =>
          r.question === payload.question &&
          r.content === payload.content &&
          (r.sourceUrl || null) === payload.sourceUrl &&
          r.status !== 'REJECTED',
      )
    )
      throw new Error('这份资料已经提交过，请查看原审核记录，不要重复提交。')
    return {
      kind: 'KNOWLEDGE_SUBMISSION',
      payload,
      title: '提交校园资料审核',
      lines: [
        payload.question,
        `${payload.content.length.toLocaleString()}字符；${payload.sourceUrl || '未填写来源链接，管理员仍需核实'}`,
        '提交后为待审核，不等于已经公开或可以检索。',
      ],
    }
  }
  if (form.mode !== 'merchant') throw new Error('资料用途不明确。')
  const name = trim(form.name, 120, '商家名称', true),
    location = trim(form.location, 120, '楼层或档口'),
    description = trim(form.description, 1000, '商家介绍')
  if (user.role === 'ADMIN') {
    const canteens = collection(context.canteens),
      merchants = collection(context.merchants)
    const target = canteens.find((r) => r.id === Number(form.canteenId))
    if (!target || !['DRAFT', 'PUBLISHED'].includes(target.status))
      throw new Error('请选择本校已读取的食堂；没有这个食堂时，先在商家管理新增食堂。')
    if (merchants.some((r) => r.canteenId === target.id && r.name === name))
      throw new Error('这个食堂已存在同名商家，请在商家管理编辑原条目；没有重复新增。')
    return {
      kind: 'MERCHANT_DRAFT',
      payload: {
        canteenId: target.id,
        name,
        location: location || null,
        description: description || null,
      },
      title: '保存商家草稿',
      lines: [
        `${target.name} · ${name}`,
        location || '楼层/档口暂未填写',
        description || '介绍暂未填写',
        '只保存草稿，不自动发布；照片可在保存后到商家管理上传。',
      ],
    }
  }
  const canteenName = trim(form.canteenName, 120, '所属食堂', true)
  const payload = {
    name: trim(form.contactName, 80, '申请人称呼', true),
    contact: trim(form.contact, 120, '回复方式', true),
    subject: '商家资料申请',
    message: `店名：${name}\n所属食堂：${canteenName}\n位置：${location || '待核实'}\n介绍：${description || '待补充'}\n本申请不代表店铺已发布；请核实后录入商家管理。`,
  }
  return {
    kind: 'MERCHANT_APPLICATION',
    payload,
    title: '提交商家资料申请',
    lines: [
      `${canteenName} · ${name}`,
      '申请进入管理员联系收件箱，不直接创建或发布商家。',
      '回复方式仅供管理员联系，不作为公开商家资料。',
    ],
  }
}

const same = (row, payload) =>
  row && Object.entries(payload).every(([k, v]) => (row[k] ?? null) === (v ?? null))
export function createMaterialResource({
  owner,
  state,
  api,
  now = Date.now,
  uuid = () => crypto.randomUUID(),
  journal,
  receiptOwner = owner,
}) {
  let sequence = 0,
    controller,
    frozen,
    receipt,
    disposed = false
  const active = () => !disposed && owner()
  const fingerprint = (form, user) => JSON.stringify([form, user?.id, user?.schoolId, user?.role])
  function reset() {
    sequence++
    controller?.abort()
    frozen = receipt = null
    Object.assign(state, {
      busy: false,
      phase: 'editing',
      preview: null,
      error: '',
      notice: '',
      verified: false,
    })
  }
  function invalidate() {
    if (!state.busy && !['uncertain', 'saved'].includes(state.phase)) {
      frozen = null
      state.preview = null
      state.phase = 'editing'
      state.error = ''
    }
  }
  function operation() {
    controller?.abort()
    controller = new AbortController()
    const key = active(),
      epoch = ++sequence
    return {
      signal: controller.signal,
      current: () =>
        Boolean(key && active() === key && epoch === sequence && !controller.signal.aborted),
      key,
    }
  }
  const failure = (error) =>
    error?.response?.data?.message || error?.message || '操作未完成，请核对后重试。'
  async function prepare(form, user) {
    if (!active() || state.busy || ['uncertain', 'saved'].includes(state.phase)) return false
    const input = JSON.parse(JSON.stringify(form)),
      tag = fingerprint(input, user),
      op = operation()
    state.busy = true
    state.error = ''
    state.preview = null
    frozen = null
    try {
      const context =
        input.mode === 'merchant' && user.role === 'ADMIN'
          ? { canteens: await api.canteens(op.signal), merchants: await api.merchants(op.signal) }
          : input.mode === 'knowledge'
            ? { mine: await api.mine(op.signal) }
            : {}
      if (api.capabilities && !(await api.capabilities(op.signal))?.durableReceipts)
        throw new Error('当前服务器尚未启用可靠资料提交，请先更新服务与回执存储；没有提交。')
      if (!op.current() || fingerprint(form, user) !== tag) return false
      const plan = planMaterial(input, user, context)
      const prior = api.execute ? journal?.list(receiptOwner()).at(-1) : null
      let payloadHash
      if (api.execute && journal) {
        if (!globalThis.crypto?.subtle)
          throw new Error('请使用HTTPS或localhost完成提交校验；没有发送。')
        payloadHash = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(JSON.stringify(plan.payload)),
            ),
          ),
        ]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        if (!op.current() || fingerprint(form, user) !== tag) return false
        if (prior && (prior.kind !== plan.kind || prior.payloadHash !== payloadHash))
          throw new Error(
            '有一份未确认提交。请先恢复并核对原回执；若重试，须整理与原请求完全一致的内容。不会用新编号重复提交。',
          )
      }
      const requestId = prior?.id || uuid()
      if (plan.kind === 'MERCHANT_APPLICATION') plan.payload.requestId = requestId
      frozen = {
        ...plan,
        payload: Object.freeze(plan.payload),
        tag,
        key: op.key,
        until: now() + 300000,
        requestId,
        payloadHash,
      }
      state.preview = { title: plan.title, lines: plan.lines }
      state.phase = 'preview'
      return true
    } catch (error) {
      if (op.current()) {
        state.phase = 'editing'
        state.error = failure(error)
      }
      return false
    } finally {
      if (op.current()) state.busy = false
    }
  }
  async function readBack(op) {
    if (!receipt) {
      state.error = '保存结果仍未知。请到原管理入口核对；为避免重复，本页不会重发。'
      return false
    }
    const rows =
      receipt.kind === 'MERCHANT_DRAFT' ? await api.merchants(op.signal) : await api.mine(op.signal)
    if (!op.current()) return false
    const row = collection(rows).find((r) => r.id === receipt.id)
    if (!same(row, receipt.payload))
      throw new Error('已收到提交回执，但最新记录与本次内容不一致；请到原入口核对，不要重发。')
    if (receipt.kind === 'MERCHANT_DRAFT' && row.status !== 'DRAFT')
      throw new Error(
        '已收到商家保存回执，但状态随后发生变化，请到商家管理核对；不冒充仍是未发布草稿。',
      )
    state.verified = true
    state.notice =
      receipt.kind === 'MERCHANT_DRAFT'
        ? `商家草稿 #${receipt.id} 已保存并回读核对，尚未发布。`
        : `资料 #${receipt.id} 已提交并回读核对，审核状态以管理员最新处理为准。`
    return true
  }
  async function execute(form, user) {
    if (!active() || state.busy || !frozen || state.phase !== 'preview') return false
    if (frozen.key !== active() || fingerprint(form, user) !== frozen.tag || now() > frozen.until) {
      invalidate()
      state.error = '内容、身份或预览时效已变化，请重新预览；没有提交。'
      return false
    }
    const plan = frozen,
      op = operation()
    state.busy = true
    state.error = ''
    state.phase = 'sending'
    let dispatched = false
    try {
      if (api.execute)
        journal?.save({
          owner: receiptOwner(),
          id: plan.requestId,
          kind: plan.kind,
          at: now(),
          payloadHash: plan.payloadHash,
        })
      dispatched = true
      const envelope = api.execute
        ? await api.execute(plan.kind, plan.requestId, plan.payload, op.signal)
        : null
      if (api.execute && (envelope?.requestId !== plan.requestId || envelope.kind !== plan.kind))
        throw new Error('请求回执目标异常，请先核对原请求。')
      const result = api.execute
        ? envelope.result
        : plan.kind === 'MERCHANT_DRAFT'
          ? await api.saveMerchant(plan.payload, op.signal)
          : plan.kind === 'KNOWLEDGE_SUBMISSION'
            ? await api.submitKnowledge(plan.payload, op.signal)
            : await api.submitContact(plan.payload, op.signal)
      if (!op.current()) return false
      const expected = { ...plan.payload }
      delete expected.requestId
      if (
        !id(result?.id) ||
        !same(result, expected) ||
        (plan.kind === 'MERCHANT_DRAFT' && result.status !== 'DRAFT') ||
        (plan.kind !== 'MERCHANT_DRAFT' && !['PENDING', 'NEW'].includes(result.status))
      )
        throw new Error('提交回执内容异常，结果暂不能确认；不要重复提交。')
      receipt = { kind: plan.kind, payload: expected, id: result.id }
      state.phase = 'saved'
      state.preview = null
      frozen = null
      state.notice = `已收到 #${result.id} 提交回执；正在核对。`
      if (plan.kind === 'MERCHANT_APPLICATION') {
        state.verified = true
        state.notice = `商家申请 #${result.id} 已进入管理员联系收件箱，尚未创建或发布商家。`
      } else await readBack(op)
      if (state.verified) journal?.remove(receiptOwner(), plan.requestId)
      return true
    } catch (error) {
      if (op.current()) {
        state.error = failure(error)
        if (state.phase === 'saved')
          state.notice = `已收到 #${receipt.id} 回执，但最新记录尚未核对；只重新读取，不重复提交。`
        else if (
          !dispatched ||
          error?.code === 'COMPAT_REQUIRED' ||
          [400, 401, 403, 422].includes(error?.response?.status)
        ) {
          state.phase = 'editing'
          frozen = null
          state.preview = null
        } else {
          state.phase = 'uncertain'
          state.preview = null
          frozen = null
          state.notice = api.execute
            ? '提交结果未知，原请求编号已保留。点击核对回执；刷新后仍可继续核对，不会自动重复提交。'
            : '提交结果未知；本页已锁定重发，请先到原入口核对。'
        }
      }
      return false
    } finally {
      if (op.current()) state.busy = false
    }
  }
  async function verify() {
    if (!receipt && api.receipt) return resume()
    if (!active() || state.busy || !receipt) return false
    const op = operation()
    state.busy = true
    state.error = ''
    try {
      return await readBack(op)
    } catch (error) {
      if (op.current()) state.error = failure(error)
      return false
    } finally {
      if (op.current()) state.busy = false
    }
  }
  async function resume() {
    if (!active() || state.busy || !api.receipt || !journal) return false
    const op = operation()
    let item
    state.busy = true
    try {
      item = journal.list(receiptOwner()).at(-1)
      if (!item) return false
      state.phase = 'uncertain'
      const value = await api.receipt(item.id, op.signal)
      if (!op.current()) return false
      if (value?.requestId !== item.id || value.kind !== item.kind || !id(value.result?.id))
        throw new Error('原请求回执目标不一致，请到原入口核对。')
      const keys =
        item.kind === 'MERCHANT_DRAFT'
          ? ['canteenId', 'name', 'location', 'description']
          : item.kind === 'KNOWLEDGE_SUBMISSION'
            ? ['question', 'content', 'sourceUrl']
            : ['name', 'contact', 'subject', 'message']
      receipt = {
        kind: item.kind,
        id: value.result.id,
        payload: Object.fromEntries(keys.map((k) => [k, value.result[k] ?? null])),
      }
      state.phase = 'saved'
      state.preview = null
      state.error = ''
      if (item.kind === 'MERCHANT_APPLICATION') {
        state.verified = true
        state.notice = `商家申请 #${receipt.id} 已由服务端确认接收；尚未创建或发布商家。`
      } else await readBack(op)
      if (state.verified) journal.remove(receiptOwner(), item.id)
      return true
    } catch (error) {
      if (op.current()) {
        state.error = failure(error)
        if (error?.response?.status === 404 && item?.payloadHash) {
          state.phase = 'editing'
          state.notice =
            '还未查到原回执。可重新整理同一份内容、预览并人工重试；仍沿用原请求编号。内容不一致会被阻止，不会重复创建。'
        }
      }
      return false
    } finally {
      if (op.current()) state.busy = false
    }
  }
  function dispose() {
    reset()
    disposed = true
  }
  return { prepare, execute, verify, resume, invalidate, reset, dispose }
}
