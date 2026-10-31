export function voiceCapability({secureContext,recognition,microphoneAllowed=true}={}) {
  if(secureContext===false)return {available:false,code:'INSECURE',message:'当前不是安全页面，本站不在此开启语音。请从已配置HTTPS的网址打开；现在可用键盘或输入法麦克风。'}
  if(secureContext!==true)return {available:false,code:'UNKNOWN',message:'无法确认当前页面的安全连接，暂不开启语音。请使用HTTPS页面或键盘输入。'}
  if(typeof recognition!=='function')return {available:false,code:'UNSUPPORTED',message:'当前浏览器没有可用的语音转写接口。可用键盘或输入法麦克风；没有启用其他转写服务。'}
  if(microphoneAllowed===false)return {available:false,code:'POLICY',message:'当前页面的麦克风策略不允许语音。请在浏览器独立页面打开并核对权限，或使用键盘输入。'}
  return {available:true,code:'AVAILABLE',message:''}
}

export function createHoldToTalk({
  engine, owner, update, submit,
  availability = () => ({ available: true }),
  now = Date.now, timer = setTimeout, clear = clearTimeout,
}) {
  let run = null, prepared = null, disposed = false
  function dropPrepared() {
    const previous = prepared
    prepared = null
    try { previous?.recognition.abort() } catch { /* already stopped */ }
  }
  function end(message = '', { reusable = false, retainEngine = false } = {}) {
    const current = run
    run = null
    let kept = false
    if (current) {
      clear(current.limit); clear(current.finish)
      current.recognition.onresult = current.recognition.onend = current.recognition.onerror = current.recognition.onstart = null
      // Reuse only a fully ended engine; never retain a live microphone session.
      if (reusable && current.ended && !current.cancelled && !disposed && owner() === current.owner) {
        dropPrepared()
        prepared = { recognition: current.recognition, Engine: current.Engine, owner: current.owner }
        kept = true
      } else {
        try { current.recognition.abort() } catch { /* already stopped */ }
      }
    }
    if (!kept && !retainEngine) dropPrepared()
    update({ phase: message ? 'error' : 'idle', text: '', message })
  }
  function deliver(current) {
    if (run !== current || owner() !== current.owner || disposed) return
    if (current.cancelled) { end(); return }
    if (current.releasedBeforeStart) { end('', { reusable: true }); return }
    if (!current.text.trim()) { end('没有完整语音，请重试。'); return }
    const text = current.text.trim()
    end('', { reusable: true })
    submit(text, current.owner)
  }
  function stop(current) {
    current.finish = timer(() => { if (run === current) end('识别超时，请重试或使用键盘。') }, 5000)
    try { current.recognition.stop() } catch { end('语音未正常结束，没有发送。') }
  }
  function interruptPending() {
    if (!run || run.started || run.ended || disposed || owner() !== run.owner) return false
    run.released = run.releasedBeforeStart = true
    update({ phase: 'starting', text: '', message: '等待麦克风授权…' })
    return true
  }
  return {
    start(y = 0) {
      if (disposed || run || !owner()) return false
      const principal = owner()
      let recognition, Recognition
      try {
        const capability = availability()
        if (!capability?.available) {
          update({ phase: 'error', text: '', message: capability?.message || '当前页面不能开启语音。' })
          return false
        }
        Recognition = engine()
        if (typeof Recognition !== 'function') {
          update({ phase: 'error', text: '', message: '浏览器不支持语音转写，请使用键盘。' })
          return false
        }
        if (prepared?.Engine === Recognition && prepared.owner === principal) {
          recognition = prepared.recognition
          prepared = null
        } else {
          dropPrepared()
          recognition = new Recognition()
        }
        recognition.lang = 'zh-CN'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1
      } catch {
        try { recognition?.abort() } catch { /* preparation failed */ }
        update({ phase: 'error', text: '', message: '语音未准备好，请重试或使用键盘。' })
        return false
      }
      if (disposed || owner() !== principal) { try { recognition.abort() } catch { /* not started */ } return false }
      const current = { recognition, Engine: Recognition, owner: principal, y, start: now(),
        text: '', preview: '', started: false, ended: false, released: false, releasedBeforeStart: false, cancelled: false }
      run = current
      const valid = () => run === current && !disposed && owner() === current.owner
      recognition.onstart = () => {
        if (!valid() || current.started) return
        current.started = true
        clear(current.limit)
        if (current.releasedBeforeStart || current.released) {
          current.releasedBeforeStart = true
          update({ phase: 'finishing', text: '', message: '正在完成授权…' })
          stop(current)
          return
        }
        current.start = now()
        current.limit = timer(() => { if (valid()) end('已达60秒上限，没有自动发送。') }, 60000)
        update({ phase: current.cancelled ? 'cancel' : 'listening', text: current.preview,
          message: current.cancelled ? '松开取消' : '松开发送 · 上滑取消' })
      }
      recognition.onresult = event => {
        if (!valid() || current.releasedBeforeStart) return
        let final = '', interim = ''
        for (const result of Array.from(event.results || [])) {
          const value = result?.[0]?.transcript || ''
          if (result.isFinal) final += value
          else interim += value
        }
        if (final.length + interim.length > 5000) { end('语音超过5000字，请分次提问。'); return }
        current.text = final; current.preview = final + interim; current.started = true
        update({ phase: current.cancelled ? 'cancel' : current.released ? 'finishing' : current.ended ? 'ready' : 'listening',
          text: current.preview, message: current.cancelled ? '松开取消' : '松开发送 · 上滑取消' })
      }
      recognition.onerror = event => {
        if (valid()) end({ 'not-allowed': '麦克风权限未获准，请在浏览器中允许。',
          'audio-capture': '没有可用麦克风。', network: '语音连接失败，请重试或使用键盘。',
          'no-speech': '没有识别到语音，请重试。', 'service-not-allowed': '浏览器语音服务不可用。',
          'language-not-supported': '当前语言不受支持，请使用键盘。' }[event.error] || '识别中断，没有发送。')
      }
      recognition.onend = () => {
        if (!valid()) return
        current.ended = true
        if (current.released) deliver(current)
        else update({ phase: current.cancelled ? 'cancel' : 'ready', text: current.preview,
          message: current.cancelled ? '松开取消' : '识别结束，松开发送' })
      }
      current.limit = timer(() => { if (valid()) end('麦克风等待超时，没有发送。') }, 60000)
      update({ phase: 'starting', text: '', message: '正在开启麦克风…' })
      try { recognition.start(); return true }
      catch { end('语音未能启动，请核对权限后重试。'); return false }
    },
    move(y) {
      if (!run || run.released) return
      if (owner() !== run.owner) { end(); return }
      run.cancelled = run.y - y > 70
      update({ phase: run.cancelled ? 'cancel' : run.ended ? 'ready' : run.started ? 'listening' : 'starting',
        text: run.preview, message: run.cancelled ? '松开取消' : run.started ? '松开发送 · 上滑取消' : '正在开启麦克风…' })
    },
    release() {
      if (!run) return
      const current = run
      if (owner() !== current.owner) { end(); return }
      if (current.released) return
      if (current.cancelled) { end(); return }
      if (!current.started && !current.ended) { interruptPending(); return }
      current.released = true
      if (now() - current.start < 250) { end(); return }
      if (current.ended) { deliver(current); return }
      update({ phase: 'finishing', text: current.preview, message: '正在完成识别…' })
      stop(current)
    },
    interruptPending,
    cancel: (options = {}) => end('', options),
    dispose() { disposed = true; end() },
  }
}
