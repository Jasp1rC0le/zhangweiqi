// Keep a fixed application surface inside the visible viewport without moving the document.
// Keyboard pan changes offsetTop as well as height; pinch zoom remains browser-owned.
export function visualViewportBox({ layoutHeight, height, offsetTop = 0, scale = 1, baselineHeight, focused = false }) {
  const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback
  const layout = positive(layoutHeight, 844)
  const zoomed = Math.abs(positive(scale, 1) - 1) > .05
  const visible = zoomed ? layout : Math.min(layout, positive(height, layout))
  const top = zoomed ? 0 : Math.max(0, Math.min(Number.isFinite(offsetTop) ? offsetTop : 0, layout - visible))
  return {
    height: Math.round(visible),
    top: Math.round(top),
    keyboardOpen: !zoomed && focused && positive(baselineHeight, layout) - visible > 120,
  }
}

export function observeVisualViewport(win, onChange) {
  const viewport = win.visualViewport
  let frame = null, stopped = false, baseline = 0, previousWidth = 0, previousBox = null
  const refresh = () => {
    if (stopped) return
    if (frame != null) win.cancelAnimationFrame(frame)
    frame = null
    const layout = win.document?.documentElement?.clientHeight || win.innerHeight || 844
    const width = win.document?.documentElement?.clientWidth || win.innerWidth
    const focused = Boolean(win.document?.activeElement?.matches?.('input, textarea, [contenteditable="true"]'))
    if (!baseline || width !== previousWidth || !focused) baseline = Math.max(layout, viewport?.height || 0)
    previousWidth = width
    const box = visualViewportBox({ layoutHeight: layout, height: viewport?.height, offsetTop: viewport?.offsetTop,
      scale: viewport?.scale, baselineHeight: baseline, focused })
    if (!previousBox || box.height !== previousBox.height || box.top !== previousBox.top || box.keyboardOpen !== previousBox.keyboardOpen) {
      previousBox = box
      onChange(box)
    }
  }
  const schedule = () => { if (!stopped && frame == null) frame = win.requestAnimationFrame(refresh) }
  const targets = [[win, 'resize'], [win, 'orientationchange'], [win, 'focusin'], [win, 'focusout'],
    ...(viewport ? [[viewport, 'resize'], [viewport, 'scroll']] : [])]
  for (const [target, event] of targets) target.addEventListener(event, schedule)
  refresh()
  return {
    refresh,
    stop() {
      stopped = true
      if (frame != null) win.cancelAnimationFrame(frame)
      for (const [target, event] of targets) target.removeEventListener(event, schedule)
    },
  }
}
