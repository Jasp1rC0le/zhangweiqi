// Visual feedback never remounts content, changes its layout, or owns an action's result.
const running = new WeakMap()

export function stopContentMotion(element) {
  const animation = element && running.get(element)
  if (!animation) return
  running.delete(element)
  try { animation.cancel() } catch { /* Optional browser effect. */ }
}

export function animateContentChange(element, environment = globalThis, options = {}) {
  if (!element?.animate) return null
  if (environment.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    stopContentMotion(element)
    return null
  }
  const axis = options.axis === 'x' ? 'X' : 'Y'
  let from = { opacity: options.opacity ?? .65, transform: `translate${axis}(${options.distance ?? 6}px)` }
  if (running.has(element)) {
    try {
      const style = environment.getComputedStyle?.(element)
      if (style) from = { opacity: style.opacity, transform: style.transform }
    } catch { /* Use the bounded cue if computed styles are unavailable. */ }
  }
  stopContentMotion(element)
  try {
    const animation = element.animate([from, { opacity: 1, transform: `translate${axis}(0)` }], {
      duration: options.duration ?? 180, delay: options.delay ?? 0,
      easing: 'cubic-bezier(.22,1,.36,1)', fill: options.delay ? 'backwards' : 'none',
    })
    if (!animation) return null
    running.set(element, animation)
    const finish = () => { if (running.get(element) === animation) running.delete(element) }
    animation.finished?.then(finish, finish)
    return animation
  } catch { return null }
}

export function installWorkspaceMotion(document, environment = globalThis) {
  const opened = event => {
    const element = event.target
    if (element?.tagName !== 'DETAILS' || !element.open || !element.closest('.workspace')) return
    Array.from(element.children).filter(child => child.tagName !== 'SUMMARY').slice(0, 4)
      .forEach(child => animateContentChange(child, environment))
  }
  document.addEventListener('toggle', opened, true)
  return () => document.removeEventListener('toggle', opened, true)
}
