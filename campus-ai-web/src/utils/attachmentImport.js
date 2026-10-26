import { checkAttachment } from './attachmentParser.js'
export function startAttachmentImport(file, target, { longDocument = false } = {}) {
  const extension = checkAttachment(file.name,file.size,target)
  const worker = new Worker(new URL('./attachment.worker.js',import.meta.url),{type:'module'})
  let rejectTask, finished = false
  const finish = () => { finished = true; clearTimeout(timer); worker.terminate() }
  const timer = setTimeout(() => { finish(); rejectTask(new Error('解析超过20秒，已停止；请拆分文件或导出纯文本')) },20000)
  const promise = new Promise((resolve,reject) => {
    rejectTask = reject
    worker.onmessage = ({data}) => {
      if (finished || data?.type !== 'campthink-attachment-result') return
      finish()
      if (data.error) reject(new Error(data.error))
      else if (data.result?.choices?.length) resolve(data.result)
      else reject(new Error('未能提取附件内容，请另存为纯文本重试'))
    }
    worker.onerror = () => { if (!finished) { finish(); reject(new Error('解析组件未能加载，请刷新后重试；文件未上传')) } }
    file.arrayBuffer().then(buffer => { if (!finished) worker.postMessage({buffer,extension,maxText:longDocument?500000:50000},[buffer]) }).catch(() => { if (!finished) { finish(); reject(new Error('无法读取所选文件')) } })
  })
  return {promise,cancel() { if (!finished) { finish(); rejectTask(new Error('已取消解析，原有材料未改动')) } }}
}
