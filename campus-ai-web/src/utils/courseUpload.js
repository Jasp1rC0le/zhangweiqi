export function readCourseUpload(
  file,
  {
    signal,
    timeoutMs = 20000,
    createWorker = () =>
      new Worker(new URL('./courseImport.worker.js', import.meta.url), { type: 'module' }),
  } = {},
) {
  const aborted = () => Object.assign(new Error('已取消课表解析'), { name: 'AbortError' })
  if (signal?.aborted) return Promise.reject(aborted())
  const extension = file?.name?.split('.').pop().toLowerCase()
  if (
    !['json', 'xlsx', 'csv', 'tsv', 'txt'].includes(extension) ||
    !Number.isSafeInteger(file?.size) ||
    file.size < 1 ||
    file.size > (extension === 'xlsx' ? 10 * 1024 * 1024 : 100000)
  )
    return Promise.reject(
      new Error(
        '请选择10MB内XLSX或100KB内JSON/CSV/TSV；图片请用单独的模型识别入口，扫描PDF和旧XLS暂不支持',
      ),
    )
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 20000)
    return Promise.reject(new Error('解析时限无效'))
  return new Promise((resolve, reject) => {
    let worker,
      timer,
      settled = false
    const finish = (error, result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      worker?.terminate()
      if (error) reject(error)
      else resolve(result)
    }
    const cancel = () => finish(aborted())
    try {
      worker = createWorker()
      worker.onmessage = ({ data }) => {
        if (data?.type !== 'campthink-course-import') return
        if (data.error) finish(new Error(data.error))
        else if (!Array.isArray(data.result?.courses) || !data.result.courses.length)
          finish(new Error('未识别到课程，原课表未改变'))
        else finish(null, data.result)
      }
      worker.onerror = () => finish(new Error('本地解析组件未能加载，请刷新后重试；文件未上传'))
      signal?.addEventListener('abort', cancel, { once: true })
      timer = setTimeout(() => finish(new Error('解析超过20秒，已停止，原课表未改变')), timeoutMs)
      file
        .arrayBuffer()
        .then((buffer) => {
          if (settled) return
          if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== file.size)
            return finish(new Error('文件内容大小异常，请重选文件'))
          worker.postMessage({ buffer, extension }, [buffer])
        })
        .catch(() => finish(new Error('文件无法读取，请重新选择')))
    } catch {
      finish(new Error('无法启动本地课表解析，请刷新后重试'))
    }
  })
}
