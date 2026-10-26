/** Isolated DEV memory backend. Uses no real school data or credentials. */
export function createMaterialIntakeFixture({ principal }) {
  let nextId = 701
  const canteens = [
    { id: 1, name: '第一食堂', status: 'PUBLISHED' },
    { id: 2, name: '第二食堂', status: 'DRAFT' },
  ]
  const merchants = [],
    submissions = [],
    contacts = [],
    receipts = new Map()
  const copy = (value) => JSON.parse(JSON.stringify(value))
  const fail = (status, message) => {
    throw { response: { status, data: { message } } }
  }
  const fixture = {
    async adapter(config) {
      const url = config.url,
        method = (config.method || 'get').toLowerCase()
      if (
        !url.startsWith('/api/admin/canteens') &&
        !url.startsWith('/api/material-actions') &&
        !url.startsWith('/api/knowledge-submissions') &&
        !url.startsWith('/api/admin/knowledge-submissions') &&
        !url.startsWith('/api/admin/contact-messages') &&
        !['/api/contact-messages', '/api/admin/overview'].includes(url)
      )
        return null
      const user = principal()
      if (!user?.id || !user?.schoolId) fail(401, '模拟会话已结束')
      if (url.startsWith('/api/admin/') && user.role !== 'ADMIN')
        fail(403, '模拟正常管理员权限检查拒绝')
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {}
      let data
      if (url === '/api/material-actions/capabilities') data = { durableReceipts: true }
      else if (url.startsWith('/api/material-actions/requests/')) {
        const row = receipts.get(`${user.schoolId}:${user.id}:${url.split('/').at(-1)}`)
        if (!row) fail(404, '没有本人的模拟提交回执；刷新会重置模拟数据库')
        if (row.kind === 'MERCHANT_DRAFT' && user.role !== 'ADMIN') fail(403, '需要管理员权限')
        data = row
      } else if (url.startsWith('/api/material-actions/') && method === 'post') {
        const route = {
          knowledge: ['KNOWLEDGE_SUBMISSION', '/api/knowledge-submissions'],
          merchant: ['MERCHANT_DRAFT', '/api/admin/canteens/merchants'],
          'merchant-application': ['MERCHANT_APPLICATION', '/api/contact-messages'],
        }[url.split('/').at(-1)]
        if (!route || !body.requestId) fail(400, '无效模拟提交')
        if (route[0] === 'MERCHANT_DRAFT' && user.role !== 'ADMIN') fail(403, '需要管理员权限')
        const key = `${user.schoolId}:${user.id}:${body.requestId}`,
          old = receipts.get(key)
        if (old && (old.kind !== route[0] || old.fingerprint !== JSON.stringify(body.payload)))
          fail(409, '同一请求内容已变化')
        if (old) data = old
        else {
          const result = await fixture.adapter({
            ...config,
            url: route[1],
            data: {
              ...body.payload,
              ...(route[0] === 'MERCHANT_APPLICATION' ? { requestId: body.requestId } : {}),
            },
          })
          data = {
            requestId: body.requestId,
            kind: route[0],
            result: result.data,
            fingerprint: JSON.stringify(body.payload),
          }
          receipts.set(key, copy(data))
        }
      } else if (url === '/api/knowledge-submissions/mine' && method === 'get')
        data = submissions
          .filter((r) => r.owner === user.id && r.school === user.schoolId)
          .map(({ owner: _owner, school: _school, ...row }) => row)
      else if (url === '/api/knowledge-submissions' && method === 'post') {
        if (
          !body.question?.trim() ||
          !body.content?.trim() ||
          body.question.length > 1000 ||
          body.content.length > 100000
        )
          fail(400, '模拟资料字段无效')
        const row = {
          ...copy(body),
          sourceUrl: body.sourceUrl || null,
          id: nextId++,
          status: 'PENDING',
          owner: user.id,
          school: user.schoolId,
        }
        submissions.push(row)
        const { owner: _owner, school: _school, ...result } = row
        data = result
      } else if (url === '/api/admin/knowledge-submissions' && method === 'get')
        data = submissions
          .filter((r) => r.school === user.schoolId && r.status === 'PENDING')
          .map(({ owner: _owner, school: _school, ...row }) => row)
      else if (url === '/api/contact-messages' && method === 'post') {
        if (!body.requestId || !body.name?.trim() || !body.contact?.trim() || !body.message?.trim())
          fail(400, '模拟联系字段不完整')
        const existing = contacts.find((r) => r.owner === user.id && r.requestId === body.requestId)
        if (existing && JSON.stringify(existing.payload) !== JSON.stringify(body))
          fail(409, '模拟提交编号已使用')
        if (existing) data = existing.receipt
        else {
          data = {
            id: nextId++,
            name: body.name.trim(),
            contact: body.contact.trim(),
            subject: body.subject.trim(),
            message: body.message.trim(),
            status: 'NEW',
          }
          contacts.push({
            owner: user.id,
            school: user.schoolId,
            requestId: body.requestId,
            payload: copy(body),
            receipt: copy(data),
          })
        }
      } else if (url === '/api/admin/contact-messages' && method === 'get')
        data = contacts.filter((r) => r.school === user.schoolId).map((r) => r.receipt)
      else if (url === '/api/admin/overview' && method === 'get')
        data = {
          pendingSubmissions: submissions.filter(
            (r) => r.school === user.schoolId && r.status === 'PENDING',
          ).length,
          unresolvedFeedback: 0,
          openContactMessages: contacts.filter(
            (r) => r.school === user.schoolId && r.receipt.status === 'NEW',
          ).length,
          pendingEmployerCandidates: 0,
          searchableDocuments: 0,
          recentModelCalls: 0,
          recentModelTokens: 0,
          pendingBackgroundJobs: 0,
          failedBackgroundJobs: 0,
        }
      else if (/^\/api\/admin\/contact-messages\/\d+\/handled$/.test(url) && method === 'post') {
        const row = contacts.find(
          (r) => r.receipt.id === Number(url.split('/')[4]) && r.school === user.schoolId,
        )
        if (!row) fail(404, '本校没有这份模拟申请')
        row.receipt.status = 'HANDLED'
        data = row.receipt
      } else if (url === '/api/admin/canteens' && method === 'get') data = canteens
      else if (url === '/api/admin/canteens/merchants' && method === 'get')
        data = merchants
          .filter((r) => r.school === user.schoolId)
          .map(({ school: _school, ...row }) => row)
      else if (url === '/api/admin/canteens/reviews' && method === 'get') data = []
      else if (url === '/api/admin/canteens' && method === 'post') {
        if (!body.name?.trim()) fail(400, '模拟食堂名称必填')
        if (canteens.some((c) => c.name === body.name.trim())) fail(409, '模拟已有同名食堂')
        data = { id: nextId++, name: body.name.trim(), status: 'DRAFT' }
        canteens.push(data)
      } else if (url === '/api/admin/canteens/merchants' && method === 'post') {
        if (!canteens.some((c) => c.id === body.canteenId) || !body.name?.trim())
          fail(400, '模拟食堂/商家目标无效')
        if (
          merchants.some(
            (m) =>
              m.school === user.schoolId &&
              m.canteenId === body.canteenId &&
              m.name === body.name.trim(),
          )
        )
          fail(409, '模拟同食堂同名商家已存在')
        const row = {
          ...copy(body),
          name: body.name.trim(),
          location: body.location?.trim() || null,
          description: body.description?.trim() || null,
          status: 'DRAFT',
          operatingStatus: 'UNKNOWN',
          id: nextId++,
          school: user.schoolId,
        }
        merchants.push(row)
        const { school: _school, ...result } = row
        data = result
      } else {
        const match = /^\/api\/admin\/canteens\/merchants\/(\d+)\/status$/.exec(url)
        const row =
          match && merchants.find((r) => r.id === Number(match[1]) && r.school === user.schoolId)
        if (!row || method !== 'put') fail(501, '该模拟入口未接线，不冒充保存成功')
        row.status = body.published ? 'PUBLISHED' : 'ARCHIVED'
        const { school: _school, ...result } = row
        data = result
      }
      return {
        data: copy(data),
        status: method === 'post' ? 201 : 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    },
  }
  return fixture
}
