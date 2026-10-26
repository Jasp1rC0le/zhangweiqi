// Deliberately fake local data: exercises the real UI/SSE parser without model billing.
export function installChatAssistantFixture({ messageSpacing = false } = {}) {
  const originalFetch = window.fetch
  let nextId = 1000,
    nextConversation = 901
  const conversations = new Map(),
    history = new Map()
  if(messageSpacing){
    conversations.set(901,{id:901,title:'气泡间距（模拟）',createdAt:new Date().toISOString()})
    history.set(901,[
      {id:991,conversationId:901,role:'user',content:'我水卡丢了怎么办'},
      {id:992,conversationId:901,role:'user',content:'水卡丢了怎么办'},
      {id:993,conversationId:901,role:'assistant',content:'这是气泡间距的本地模拟，不是真实办事答复。连续两次提问也应保留清晰留白。',sources:[],webSources:[]},
      {id:994,conversationId:901,role:'user',content:'下一组问题也要和前一轮分开'},
      {id:995,conversationId:901,role:'assistant',content:'不同问答轮次之间使用更宽的间隔；不改变消息内容和顺序。',sources:[],webSources:[]},
    ])
    nextConversation=902
  }
  const response = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  const sources = [
    {
      title: '校园服务来源示例（非真实办事依据）',
      sourceUrl: 'https://www.tsguas.edu.cn/',
      sourceDepartment: '学校官网（演示）',
      publishedAt: '2026-10-12',
    },
  ]
  const answer =
    '可以。先把你最不确定的那一步告诉我，我们从那里开始。\n\n准备实验报告时，先保留原始数据，再核对单位、计算过程和误差。不要为了让结果好看而改测量值。\n\n如果是校内办事，我会附上能核查的资料；具体要求仍以学校最新通知为准。[资料1]\n\n你可以把材料加到输入框里，我再帮你找出缺的部分。'
  window.fetch = async (url, options = {}) => {
    const path = new URL(url, window.location.href).pathname
    const match = path.match(/^\/api\/conversations\/(\d+)\/messages\/stream$/)
    if (!match) {
      if (path.startsWith('/api/')) throw new Error('聊天验收不连接真实后台')
      return originalFetch(url, options)
    }
    options.signal?.throwIfAborted()
    const conversationId = Number(match[1]),
      body = JSON.parse(options.body)
    const userMessage = {
      id: nextId++,
      conversationId,
      role: 'user',
      content: body.content,
      createdAt: new Date().toISOString(),
    }
    const list = history.get(conversationId) || []
    list.push(userMessage)
    history.set(conversationId, list)
    const long = body.content.includes('长回答'),
      failure = body.content.includes('失败测试')
    const content = long
      ? `${answer}\n\n${Array.from({ length: 22 }, (_, i) => `### 检查 ${i + 1}\n这是用于检查滚动的模拟段落。保留上下文，逐步确认数据与来源。`).join('\n\n')}`
      : answer
    const assistantMessage = {
      id: nextId++,
      conversationId,
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    }
    const encoder = new TextEncoder()
    let timer,
      closed = false
    return new Response(
      new ReadableStream({
        start(controller) {
          let offset = 0
          const send = (event, data) =>
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          timer = setInterval(
            () => {
              if (closed) return
              if (failure && offset > 30) {
                send('error', { status: 503 })
                clearInterval(timer)
                closed = true
                controller.close()
                return
              }
              if (offset < content.length) {
                send('delta', { content: content.slice(offset, offset + 45) })
                offset += 45
                return
              }
              list.push({ ...assistantMessage, sources, webSources: [] })
              send('done', { userMessage, assistantMessage, sources, webSources: [] })
              clearInterval(timer)
              closed = true
              controller.close()
            },
            long ? 240 : 80,
          )
        },
        cancel() {
          closed = true
          clearInterval(timer)
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    )
  }
  return {
    adapter(config) {
      if (config.url === '/api/models')
        return response(
          config,
          ['standard', 'kimi', 'glm'].map((key) => ({
            key,
            name: key,
            configured: true,
            available: true,
          })),
        )
      if (config.url === '/api/conversations') {
        if (config.method === 'post') {
          const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
          const item = {
            id: nextConversation++,
            title: body.title,
            createdAt: new Date().toISOString(),
          }
          conversations.set(item.id, item)
          return response(config, item)
        }
        return response(config, [...conversations.values()].reverse())
      }
      const match = config.url.match(/^\/api\/conversations\/(\d+)\/messages$/)
      if (match && config.method === 'get')
        return response(config, history.get(Number(match[1])) || [])
      if (config.url.endsWith('/feedback'))
        return response(
          config,
          typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
        )
      return null
    },
  }
}
