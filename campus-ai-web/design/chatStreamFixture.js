// Development-only held stream: tests Stop and navigation without a model call.
export function installPausedChatFixture() {
  const originalFetch = window.fetch
  window.fetch = async (url, options = {}) => {
    const path = new URL(url, window.location.href).pathname
    if (/^\/api\/conversations\/\d+\/messages\/stream$/.test(path)) {
      options.signal?.throwIfAborted()
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: delta\ndata: {"content":"这是本地模拟回答，用于验证停止接收和切换页面；未调用 AI 模型"}\n\n'))
        },
      }), { headers: {'Content-Type':'text/event-stream'} })
    }
    if (path.startsWith('/api/')) throw new Error('设计样例不访问真实后台')
    return originalFetch(url, options)
  }
}
