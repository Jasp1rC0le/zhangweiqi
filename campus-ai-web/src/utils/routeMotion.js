// Visual completion never decides whether an already-completed navigation succeeded.
export async function settleVisualMotion(animation, timeout = 1200) {
  if (!animation?.finished) return 'none'
  let timer
  try {
    return await Promise.race([
      Promise.resolve(animation.finished).then(() => 'finished', () => 'cancelled'),
      new Promise(resolve => {
        timer = setTimeout(() => {
          try {
            if (typeof animation.skipTransition === 'function') animation.skipTransition()
            else animation.cancel?.()
          } catch { /* A skipped visual never owns navigation success. */ }
          finally { resolve('timed-out') }
        }, timeout)
      }),
    ])
  } finally { clearTimeout(timer) }
}

export function retireRoutePage(element) {
  element.inert = true
  element.setAttribute('aria-hidden', 'true')
}

export function activateRoutePage(element) {
  element.inert = false
  element.removeAttribute('aria-hidden')
}
