export function voiceCapability({secureContext,recognition,microphoneAllowed=true}={}) {
  if(secureContext===false)return {available:false,code:'INSECURE',message:'当前不是安全页面，本站不在此开启语音。请从已配置HTTPS的网址打开；现在可用键盘或输入法麦克风。'}
  if(secureContext!==true)return {available:false,code:'UNKNOWN',message:'无法确认当前页面的安全连接，暂不开启语音。请使用HTTPS页面或键盘输入。'}
  if(typeof recognition!=='function')return {available:false,code:'UNSUPPORTED',message:'当前浏览器没有可用的语音转写接口。可用键盘或输入法麦克风；没有启用其他转写服务。'}
  if(microphoneAllowed===false)return {available:false,code:'POLICY',message:'当前页面的麦克风策略不允许语音。请在浏览器独立页面打开并核对权限，或使用键盘输入。'}
  return {available:true,code:'AVAILABLE',message:''}
}

export function createHoldToTalk({
  engine,
  owner,
  update,
  submit,
  availability = () => ({available:true}),
  now = Date.now,
  timer = setTimeout,
  clear = clearTimeout,
}) {
  let run = null,
    disposed = false
  function end(message = '') {
    const current = run
    run = null
    if (current) {
      clear(current.limit)
      clear(current.finish)
      current.recognition.onresult = current.recognition.onend = current.recognition.onerror = current.recognition.onstart = null
      try {
        current.recognition.abort()
      } catch {
        /* already ended */
      }
    }
    update({ phase: message ? 'error' : 'idle', text: '', message })
  }
  function deliver(current) {
    if (run !== current || owner() !== current.owner || disposed) return
    if (current.cancelled) {
      end()
      return
    }
    if (!current.text.trim()) {
      end('没有识别到完整语音，请重试或使用键盘。')
      return
    }
    const text = current.text.trim()
    end()
    submit(text, current.owner)
  }
  return {
    start(y = 0) {
      if (disposed || run || !owner()) return false
      const principal=owner()
      let recognition
      try{
        const capability=availability()
        if(!capability?.available){
          update({phase:'error',text:'',message:capability?.message||'当前页面不能开启语音，请使用键盘输入。'})
          return false
        }
        const Recognition=engine()
        if(typeof Recognition!=='function'){
          update({phase:'error',text:'',message:'当前浏览器不支持语音转写，可使用输入法麦克风或键盘输入。'})
          return false
        }
        recognition=new Recognition()
        recognition.lang = 'zh-CN'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1
      }catch{
        try{recognition?.abort()}catch{/* construction may have failed */}
        update({phase:'error',text:'',message:'浏览器语音服务未能准备好，没有录入或发送问题。请使用键盘，或核对浏览器权限后重试。'})
        return false
      }
      if(disposed || owner()!==principal){try{recognition.abort()}catch{/* not started */}return false}
      const current = {
          recognition,
          owner: principal,
          y,
          start: now(),
          text: '',
          started: false,
          ended: false,
          released: false,
          cancelled: false,
        }
      run = current
      const valid = () => run === current && !disposed && owner() === current.owner
      recognition.onstart=()=>{if(valid()){current.started=true;update({phase:current.cancelled?'cancel':current.released?'finishing':'listening',text:current.text,message:current.cancelled?'松开取消，不发送':current.released?'正在完成识别…':'正在听，松开发送，上滑取消'})}}
      recognition.onresult = (event) => {
        if (!valid()) return
        let final = '',
          interim = ''
        for (const result of Array.from(event.results || [])) {
          const value = result?.[0]?.transcript || ''
          if (result.isFinal) final += value
          else interim += value
        }
        if (final.length + interim.length > 5000) {
          end('语音超过5000字，请分次提问。')
          return
        }
        current.text = final
        current.started = true
        update({
          phase: current.cancelled ? 'cancel' : current.released ? 'finishing' : current.ended ? 'ready' : 'listening',
          text: final + interim,
          message: current.cancelled ? '松开取消，不发送' : '松开发送，上滑取消',
        })
      }
      recognition.onerror = (event) => {
        if (valid())
          end(
            {
              'not-allowed': '麦克风权限未获准，请在浏览器设置中允许后重试。',
              'audio-capture': '没有可用麦克风。',
              network: '浏览器语音服务连接失败，请改用键盘或稍后重试。',
              'no-speech': '没有识别到语音，请再试一次。',
              'service-not-allowed': '浏览器语音服务不可用。',
              'language-not-supported': '浏览器语音服务暂不支持当前语言，请使用键盘输入。',
            }[event.error] || '语音识别中断，没有发送。',
          )
      }
      recognition.onend = () => {
        if (!valid()) return
        current.ended = true
        if (current.released) deliver(current)
        else update({phase:current.cancelled?'cancel':'ready',text:current.text,message:current.cancelled?'松开取消，不发送':'识别已结束，松开发送或上滑取消'})
      }
      current.limit = timer(() => {
        if (valid()) end('已达到60秒录入上限，没有自动发送。请分次提问。')
      }, 60000)
      update({ phase: 'starting', text: '', message: '正在请求麦克风；未开始识别前不会发送。' })
      try {
        recognition.start()
        return true
      } catch {
        end('语音服务未能启动，请检查浏览器权限后重试。')
        return false
      }
    },
    move(y) {
      if (!run || run.released) return
      run.cancelled = run.y - y > 70
      update({
        phase: run.cancelled ? 'cancel' : run.ended ? 'ready' : run.started ? 'listening' : 'starting',
        text: run.text,
        message: run.cancelled ? '松开取消，不发送' : run.ended ? '识别已结束，松开发送或上滑取消' : run.started ? '松开发送，上滑取消' : '正在请求麦克风；未开始识别前不会发送。',
      })
    },
    release() {
      if (!run || run.released) return
      const current = run
      current.released = true
      if (current.cancelled || now() - current.start < 250) {
        end()
        return
      }
      if (current.ended) {
        deliver(current)
        return
      }
      update({ phase: 'finishing', text: current.text, message: '正在完成识别…' })
      current.finish = timer(() => {
        if (run === current) end('语音转写超时，没有发送。请重试或使用键盘。')
      }, 5000)
      try {
        current.recognition.stop()
      } catch {
        end('语音没有正常结束，没有发送。')
      }
    },
    cancel: () => end(),
    dispose() {
      end()
      disposed = true
    },
  }
}
