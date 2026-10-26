export function readRosterUpload(file, signal) {
  const extension = file?.name?.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'csv'].includes(extension) || !file.size || file.size > 10 * 1024 * 1024 || signal?.aborted) return Promise.reject(new Error('请选择10MB内XLSX或100KB内CSV名单'))
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./rosterImport.worker.js', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); worker.terminate(); if (error) reject(error); else resolve(value) }
    const cancel = () => finish(new Error('已取消名单解析'))
    const timer = setTimeout(() => finish(new Error('名单解析超时，未上传；请拆分文件')), 15000)
    signal?.addEventListener('abort', cancel, { once: true })
    worker.onerror = () => finish(new Error('名单解析失败，未上传；请重新另存为XLSX'))
    worker.onmessage = ({ data }) => data.error ? finish(new Error(data.error)) : finish(null, data.result)
    file.arrayBuffer().then(buffer => { if (!settled) worker.postMessage({ buffer, extension }, [buffer]) }, failure => finish(failure))
  })
}
