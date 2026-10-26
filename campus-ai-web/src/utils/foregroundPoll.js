/** One foreground request at a time, with per-cycle jitter and no hidden-tab polling. */
export function createForegroundPoll({ run, interval, jitter = 0.2, random = Math.random, visible = () => document.visibilityState === 'visible', schedule = setTimeout, cancel = clearTimeout, onError = () => {} }) {
  if (!Number.isFinite(interval) || interval < 1000 || !Number.isFinite(jitter) || jitter < 0 || jitter > 0.5) throw new Error('轮询间隔配置无效')
  let timer, active = false, running = false, epoch = 0
  function queue(turn) {
    if (!active || turn !== epoch) return
    const sample = Math.max(0, Math.min(1, random()))
    timer = schedule(() => tick(turn), Math.round(interval * (1 - jitter + 2 * jitter * sample)))
  }
  async function tick(turn) {
    if (!active || turn !== epoch) return
    if (!running && visible()) {
      running = true
      try { await run() } catch (error) { if (active && turn === epoch) onError(error) }
      finally { running = false }
    }
    queue(turn)
  }
  return {
    start() { if (active) return; active = true; queue(++epoch) },
    stop() { active = false; epoch++; cancel(timer) },
  }
}
