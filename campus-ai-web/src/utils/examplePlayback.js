// A finite presentation preview, never a request to an AI or business API.
export function createExamplePlayback({ onStep, onPlayingChange, canPlay, schedule = setTimeout, cancel = clearTimeout, steps = 3, delay = 4500 }) {
  let timer = null, playing = false, generation = 0, remaining = 0
  function stop() {
    generation++
    if (timer !== null) cancel(timer)
    timer = null; remaining = 0
    if (playing) { playing = false; onPlayingChange(false) }
    return false
  }
  function queue(version) {
    timer = schedule(() => {
      if (!playing || version !== generation) return
      timer = null
      if (!canPlay()) { stop(); return }
      try { onStep() } catch (error) { stop(); throw error }
      remaining--
      if (remaining === 0) stop()
      else queue(version)
    }, delay)
  }
  function start() {
    stop()
    if (!canPlay()) return false
    remaining = steps; playing = true; onPlayingChange(true); queue(generation)
    return true
  }
  return { start, stop, toggle: () => playing ? stop() : start(), get playing() { return playing } }
}
