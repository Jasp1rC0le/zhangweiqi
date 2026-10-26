// DEV only. Stores actual synthetic upload bytes in this page's memory.
export function createPrivateMaterialFixture({ principal }) {
  const files = new Map(),
    requests = new Map()
  const fail = (status, message) => {
    throw { response: { status, data: { message } } }
  }
  const sha = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  return async (config) => {
    if (!config.url.startsWith('/api/private-materials')) return null
    const actor = principal()
    if (!actor?.id) fail(401, '模拟会话未登录')
    const owner = `${actor.schoolId}:${actor.id}`,
      reply = (data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
    if (config.url === '/api/private-materials/capabilities')
      return reply({ privateOriginals: true, maxBytes: 10485760, userQuotaBytes: 104857600 })
    if (config.url === '/api/private-materials' && config.method === 'get') {
      const page = Number(config.params?.page || 0),
        rows = [...files.values()]
          .filter((f) => f.owner === owner)
          .map((f) => f.info)
          .reverse()
      return reply({
        items: rows.slice(page * 25, (page + 1) * 25),
        total: rows.length,
        page,
        size: 25,
      })
    }
    if (config.url === '/api/private-materials' && config.method === 'post') {
      const body = config.data,
        file = body.get('file'),
        text = body.get('text') || '',
        requestId = body.get('requestId')
      if (!file?.size || file.size > 10485760 || text.length > 500000 || !requestId)
        fail(400, '模拟文件无效')
      const bytes = await file.arrayBuffer(),
        hash = await sha(bytes),
        textHash = await sha(new TextEncoder().encode(text))
      if (`${principal().schoolId}:${principal().id}` !== owner || config.signal?.aborted)
        fail(409, '模拟归属已变化')
      const old = requests.get(`${owner}:${requestId}`)
      if (old) {
        if (old.hash !== hash || old.textHash !== textHash || old.name !== file.name)
          fail(409, '模拟同一上传内容已变')
        return reply(files.get(old.id).info)
      }
      const id = crypto.randomUUID(),
        info = {
          id,
          name: file.name,
          bytes: file.size,
          sha256: hash,
          textLength: text.length,
          createdAt: new Date().toISOString(),
        }
      files.set(id, { owner, info, text, bytes })
      requests.set(`${owner}:${requestId}`, { id, hash, textHash, name: file.name })
      return reply(info)
    }
    const match = /^\/api\/private-materials\/([^/]+)\/(text|download)$/.exec(config.url)
    if (!match) fail(404, '模拟原件接口不存在')
    const file = files.get(match[1])
    if (!file || file.owner !== owner) fail(404, '没有这个账号的模拟原件')
    return reply(
      match[2] === 'text'
        ? { text: file.text }
        : new Blob([file.bytes], { type: 'application/octet-stream' }),
    )
  }
}
