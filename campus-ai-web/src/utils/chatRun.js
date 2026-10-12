// A view owns one run. Late callbacks cannot mutate a replacement conversation.
export function createChatRun() {
  let current = null
  const cancel = () => {
    const previous = current
    current = null
    previous?.controller.abort()
    return previous
  }
  return {
    cancel,
    start(details = {}) {
      cancel()
      const controller = new AbortController()
      const run = {
        ...details,
        controller,
        signal: controller.signal,
        isCurrent: () => current === run && !controller.signal.aborted,
        finish: () => { if (current === run) current = null },
      }
      current = run
      return run
    },
  }
}
