import { startAttachmentImport } from './attachmentImport.js'
export function mediaKind(file) {
  if (!file?.size || file.size > 10 * 1024 * 1024) throw new Error('请选择10MB以内的非空文件。')
  const ext = file.name?.split('.').at(-1)?.toLowerCase()
  return ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
    ? 'image'
    : ['mp4', 'mov', 'webm'].includes(ext)
      ? 'video'
      : ext === 'pdf'
        ? 'pdf'
        : 'document'
}
function canvasFor(width, height) {
  if (!width || !height || width * height > 24000000)
    throw new Error('图片超过2400万像素或尺寸无效，请先压缩。')
  const scale = Math.min(1, Math.sqrt(3000000 / (width * height))),
    canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  return canvas
}
function eventPromise(element, event, signal) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      clearTimeout(timer)
      element.removeEventListener(event, yes)
      element.removeEventListener('error', bad)
      signal.removeEventListener('abort', aborted)
      if(error)reject(error);else resolve()
    }
    const yes = () => finish(),
      bad = () => finish(new Error('媒体不能解码，请换JPEG/PNG或MP4格式。')),
      aborted = () => finish(new Error('已取消识别。'))
    const timer = setTimeout(() => finish(new Error('读取媒体超时，请换较小文件。')), 12000)
    element.addEventListener(event, yes, { once: true })
    element.addEventListener('error', bad, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) aborted()
  })
}
export function startMediaRecognition(file, onProgress = () => {}) {
  const kind = mediaKind(file)
  if (kind === 'document') return startAttachmentImport(file, 'manuscript', { longDocument: true })
  let ocr,
    sequence = 0,
    pdfTask,
    video,
    objectUrl,
    stopped = false,
    rejectOcr,
    rejectTask
  const controller = new AbortController(),
    signal = controller.signal
  const clean = () => {
    stopped = true
    clearTimeout(deadline)
    controller.abort()
    ocr?.terminate()
    if (pdfTask) void pdfTask.destroy()
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
  const cancel = () => {
    clean()
    rejectOcr?.(new Error('已取消识别。'))
    rejectTask?.(new Error('已取消识别，原文件未上传。'))
  }
  const deadline = setTimeout(() => {
    clean()
    rejectOcr?.(new Error('识别超过两分钟，请拆分文件。'))
    rejectTask?.(new Error('识别超过两分钟，请拆分文件。'))
  }, 120000)
  async function recognize(canvas, label) {
    if (signal.aborted) throw new Error('已取消识别。')
    if (!ocr) ocr = new Worker(new URL('./mediaOcr.worker.js', import.meta.url), { type: 'module' })
    const id = ++sequence
    onProgress(`${label} · 首次需要加载本地识字组件`)
    return new Promise((resolve, reject) => {
      rejectOcr = reject
      ocr.onmessage = ({ data }) => {
        if (signal.aborted) return
        if (data.progress !== undefined) {
          onProgress(`${label} · 识字${data.progress}%`)
          return
        }
        if (data.id !== id) return
        rejectOcr = null
        if(data.error)reject(new Error(data.error))
        else resolve({ text: String(data.text || '').trim(), confidence: data.confidence })
      }
      ocr.onerror = event => {
        if(import.meta.env.DEV) console.error('Local OCR worker:', event.message)
        reject(new Error('本地识字组件未能加载。可重试识别，或换用文字版文件。'))
      }
      ocr.postMessage({ id, image: canvas.toDataURL('image/png') })
    })
  }
  const promise = new Promise((resolve, reject) => {
    rejectTask = reject
    ;(async () => {
      const chunks = [],
        warnings = ['文字识别可能出错，请核对日期、数字、姓名和表格。原文件没有发送给模型。']
      if (kind === 'image') {
        const bitmap = await createImageBitmap(file)
        try {
          const canvas = canvasFor(bitmap.width, bitmap.height)
          canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
          const result = await recognize(canvas, '图片')
          chunks.push(result.text)
          warnings.push(`识字置信度约${Math.round(result.confidence)}%，不是事实准确率。`)
        } finally {
          bitmap.close()
        }
      } else if (kind === 'pdf') {
        const pdfjs = await import('pdfjs-dist'),
          { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-')
          throw new Error('文件内容不是PDF。')
        pdfTask = pdfjs.getDocument({
          data: bytes,
          isEvalSupported: false,
          useSystemFonts: true,
          useWasm: false,
          stopAtErrors: true,
        })
        pdfTask.onPassword = () => {
          void pdfTask.destroy()
          reject(new Error('请先在本机解除PDF密码后再导入。'))
          clean()
        }
        const pdf = await pdfTask.promise
        if (pdf.numPages > 50) throw new Error('PDF最多50页，请先拆分；不会漏页后继续。')
        let scans = 0
        for (let i = 1; i <= pdf.numPages; i++) {
          if (signal.aborted) throw new Error('已取消识别。')
          const page = await pdf.getPage(i),
            content = await page.getTextContent()
          let text = content.items
            .filter((v) => 'str' in v)
            .map((v) => v.str + (v.hasEOL ? '\n' : ' '))
            .join('')
            .trim()
          if (text.length < 8) {
            if (++scans > 20) throw new Error('扫描页超过20页，请拆分；没有返回不完整的PDF文字。')
            const base = page.getViewport({ scale: 1.8 }),
              canvas = canvasFor(base.width, base.height),
              view = page.getViewport({ scale: (1.8 * canvas.width) / base.width })
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise
            text = (await recognize(canvas, `PDF第${i}/${pdf.numPages}页`)).text
          }
          chunks.push(`【PDF第${i}页】\n${text || '（本页未识别到文字，请核对原页）'}`)
          page.cleanup()
          if (chunks.join('\n').length > 500000) throw new Error('提取内容超过50万字符，请拆分。')
        }
        warnings.push(
          `共${pdf.numPages}页，其中${scans}页使用本机OCR；未执行PDF脚本或嵌入文件。含已有文字的页面不额外识别图片区域。`,
        )
      } else {
        objectUrl = URL.createObjectURL(file)
        video = document.createElement('video')
        video.preload = 'auto'
        video.muted = true
        video.playsInline = true
        const metadata = eventPromise(video, 'loadedmetadata', signal)
        video.src = objectUrl
        await metadata
        if (!Number.isFinite(video.duration) || video.duration <= 0 || video.duration > 180)
          throw new Error('视频限3分钟、10MB以内；请剪出相关片段。')
        if (video.readyState < 2) await eventPromise(video, 'loadeddata', signal)
        const count = Math.min(8, Math.max(1, Math.ceil(video.duration / 4))),
          canvas = canvasFor(video.videoWidth, video.videoHeight)
        for (let i = 0; i < count; i++) {
          const second = count === 1 ? 0 : ((video.duration - 0.1) * i) / (count - 1)
          if (Math.abs(video.currentTime - second) > 0.02) {
            const seek = eventPromise(video, 'seeked', signal)
            video.currentTime = second
            await seek
          }
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
          const result = await recognize(canvas, `视频画面${i + 1}/${count}`)
          chunks.push(
            `【视频${second.toFixed(1)}秒 · 抽样画面】\n${result.text || '（本帧未识别到文字）'}`,
          )
        }
        warnings.push(`仅抽样${count}帧的画面文字，不代表完整视频；未转写声音、未识别人或物体。`)
      }
      const text = chunks.join('\n\n').trim()
      if (!text) throw new Error('没有识别到文字，请换清晰图片；此工具不会猜测画面内容。')
      if (text.length > 500000) throw new Error('识别文字超过50万字符，请拆分。')
      if (!stopped)
        resolve({
          kind: 'text',
          choices: [{ label: kind === 'video' ? '视频抽样画面文字' : '识别文字', text }],
          warnings,
        })
    })()
      .catch(reject)
      .finally(clean)
  })
  return { promise, cancel }
}
