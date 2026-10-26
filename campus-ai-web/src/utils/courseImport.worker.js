import { parseOffice } from './attachmentParser.js'
import { parseCourseJson, parseCourseText } from './courseImport.js'

self.onmessage = ({ data: { buffer, extension } }) => {
  try {
    if (
      !(buffer instanceof ArrayBuffer) ||
      !buffer.byteLength ||
      buffer.byteLength > 10 * 1024 * 1024
    )
      throw new Error('文件大小异常')
    const bytes = new Uint8Array(buffer)
    let result
    if (extension === 'xlsx') {
      const extracted = parseOffice(bytes, 'xlsx')
      const parsed = extracted.choices.map((choice) => {
        if (choice.formulaCount)
          throw new Error('课表含公式，无法可靠读取；请用教务导出工具获取纯数据')
        return parseCourseText(choice.text)
      })
      if (parsed.length !== 1)
        throw new Error('检测到多个工作表，请将目标学期单独另存为XLSX；不会自动合并不同学期')
      result = parsed[0]
    } else {
      if (buffer.byteLength > 100000) throw new Error('文本课表限100KB')
      let text
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      } catch {
        throw new Error('文件不是UTF-8文本，请重新导出或使用XLSX')
      }
      result = extension === 'json' ? parseCourseJson(text) : parseCourseText(text)
    }
    self.postMessage({ type: 'campthink-course-import', result })
  } catch (failure) {
    self.postMessage({
      type: 'campthink-course-import',
      error: failure.message || '无法识别文件，原课表未改变',
    })
  }
}
