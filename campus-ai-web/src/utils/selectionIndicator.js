// One decorative surface follows real, in-flow controls; it never owns selection or focus.
export function createSelectionIndicator(container, onMeasure, {
  selector = 'button[aria-pressed="true"]', environment = globalThis,
} = {}) {
  let frame = null, disposed = false, observed, reveal = false
  const measure = () => {
    frame = null
    if (disposed) return
    const button = container?.querySelector(selector)
    if (button !== observed) {
      if (observed) observer?.unobserve(observed)
      observed = button
      if (button) observer?.observe(button)
    }
    if (!button || !button.offsetWidth || !button.offsetHeight) { onMeasure(null); return }
    const box = { x: button.offsetLeft, y: button.offsetTop, width: button.offsetWidth, height: button.offsetHeight }
    onMeasure(box)
    if (reveal && container.scrollWidth > container.clientWidth) {
      const left = container.scrollLeft
      const target = box.x < left ? box.x : box.x + box.width > left + container.clientWidth
        ? box.x + box.width - container.clientWidth : left
      if (target !== left) {
        try { container.scrollTo({ left: target, behavior: environment.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }
        catch { /* Selection remains usable without decorative scrolling. */ }
      }
    }
    reveal = false
  }
  const update = (show = false) => {
    if (disposed) return
    reveal ||= show === true
    if (frame !== null) return
    frame = environment.requestAnimationFrame(measure)
  }
  const resized = () => update()
  const observer = environment.ResizeObserver ? new environment.ResizeObserver(resized) : null
  if (container) observer?.observe(container)
  environment.addEventListener?.('resize', resized)
  update()
  return {
    update,
    stop() {
      disposed = true
      if (frame !== null) environment.cancelAnimationFrame(frame)
      frame = null
      observer?.disconnect()
      environment.removeEventListener?.('resize', resized)
    },
  }
}
