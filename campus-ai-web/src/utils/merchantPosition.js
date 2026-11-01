/** Compensate layout changes after a write, unless the reader has interacted meanwhile. */
export function captureMerchantPosition(root, merchantId, host = window, signal) {
  const card = Array.from(root?.querySelectorAll?.('[data-merchant-id]') || [])
    .find(element => element.dataset.merchantId === String(merchantId))
  const noop = { restore() {}, dispose() {} }
  if (!card?.getBoundingClientRect || signal?.aborted) return noop
  let scroller = card.parentElement
  while (scroller && (!/(auto|scroll|overlay)/.test(host.getComputedStyle(scroller).overflowY)
    || scroller.scrollHeight <= scroller.clientHeight)) scroller = scroller.parentElement
  scroller ||= root.ownerDocument?.scrollingElement
  if (!scroller) return noop
  const top = card.getBoundingClientRect().top
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown']
  let live = true
  function dispose() {
    if (!live) return
    live = false
    for (const event of events) host.removeEventListener(event, dispose, true)
    signal?.removeEventListener('abort', dispose)
  }
  for (const event of events) host.addEventListener(event, dispose, { capture: true, passive: true })
  signal?.addEventListener('abort', dispose, { once: true })
  return {
    dispose,
    restore() {
      try {
        if (!live || !root.contains(card) || root.ownerDocument?.hidden) return
        const delta = card.getBoundingClientRect().top - top
        if (!Number.isFinite(delta) || Math.abs(delta) < .5) return
        const previous = scroller.style.scrollBehavior
        scroller.style.scrollBehavior = 'auto'
        try { scroller.scrollTop += delta } finally { scroller.style.scrollBehavior = previous }
      } finally { dispose() }
    },
  }
}
