// Only the latest live read may update a view. Network cancellation is best
// effort; the ownership check also rejects adapters that still settle late.
export function createLatestRequest({ load, onStart = () => {}, onSuccess = () => {}, onError = () => {}, onFinish = () => {} }) {
  let current = null, disposed = false
  function cancel(notify = true) {
    const previous = current
    current = null
    previous?.controller.abort()
    if (previous?.pending && notify) onFinish()
    return Boolean(previous?.pending)
  }
  return {
    cancel,
    dispose() { disposed = true; cancel(false) },
    async run(...args) {
      if (disposed) return
      cancel()
      const controller = new AbortController()
      const request = {
        controller, pending:true,
        isCurrent:() => !disposed && current === request && !controller.signal.aborted,
      }
      current = request
      onStart()
      try {
        const result = await load(...args, {signal:controller.signal})
        if (request.isCurrent()) onSuccess(result, request, ...args)
      } catch (error) {
        if (request.isCurrent()) onError(error)
      } finally {
        request.pending = false
        if (request.isCurrent()) onFinish()
      }
    },
  }
}
