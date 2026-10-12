const MAX_BYTES = 100000
const MAX_CHARS = 50000

// Capture the File before resetting the native picker, so the same path can be selected again.
export function takeCourseFile(input) {
  const file = input?.files?.[0] || null
  if (input) input.value = ''
  return file
}

function cancelled() {
  const error = new Error('文件读取已取消')
  error.name = 'AbortError'
  return error
}

export async function readCourseFile(
  file,
  { signal, timeoutMs = 10000, createReader = () => new FileReader() } = {},
) {
  if (signal?.aborted) throw cancelled()
  if (
    !file ||
    !/\.(csv|tsv|txt)$/i.test(file.name) ||
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > MAX_BYTES
  )
    throw new Error('请选择100KB以内的UTF-8 CSV或TSV文本，不支持Excel原文件')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000)
    throw new Error('文件读取时限无效')

  return new Promise((resolve, reject) => {
    let reader,
      timer,
      settled = false
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (reader) reader.onload = reader.onerror = reader.onabort = null
    }
    const finish = (error, value, stop = false) => {
      if (settled) return
      settled = true
      cleanup()
      if (stop && reader?.readyState === 1) {
        try {
          reader.abort()
        } catch {
          /* Already stopped by the browser. */
        }
      }
      if (error) reject(error)
      else resolve(value)
    }
    const abort = () => finish(cancelled(), null, true)
    try {
      reader = createReader()
      reader.onload = () => {
        const bytes = reader.result
        if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength > MAX_BYTES) {
          finish(new Error('文件内容为空或超过100KB，请精简后重新选择'))
          return
        }
        let text
        try {
          text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        } catch {
          finish(new Error('文件不是UTF-8文本，请在表格软件中另存为CSV UTF-8'))
          return
        }
        if (text.length > MAX_CHARS) finish(new Error('文件内容超过5万字，请精简后再导入'))
        else finish(null, text)
      }
      reader.onerror = () =>
        finish(new Error('无法读取此文件，请确认文件可访问后重新选择'), null, true)
      reader.onabort = () => finish(cancelled())
      signal?.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => finish(new Error('文件读取超时，请重新选择'), null, true), timeoutMs)
      reader.readAsArrayBuffer(file)
    } catch {
      finish(new Error('无法读取此文件，请确认文件可访问后重新选择'), null, true)
    }
  })
}
