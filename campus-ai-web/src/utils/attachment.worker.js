import { parseOffice } from './attachmentParser.js'

self.onmessage = async ({data:{buffer,extension}}) => {
  try {
    const bytes = new Uint8Array(buffer)
    let result
    if (extension === 'pdf') {
      if (new TextDecoder().decode(bytes.subarray(0,5)) !== '%PDF-') throw new Error('文件内容不是PDF')
      const pdfjs = await import('pdfjs-dist')
      const {default:workerUrl} = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
      const task = pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,useWasm:false,disableFontFace:true,stopAtErrors:true})
      task.onPassword = () => { task.destroy(); self.postMessage({type:'campthink-attachment-result',error:'暂不读取加密PDF，请在本机解除加密后重新导入'}) }
      const doc = await task.promise
      try {
        if (doc.numPages > 50) throw new Error('PDF最多50页，请先拆分文件')
        let text = ''; const emptyPages = []
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i), content = await page.getTextContent()
          const pageText = content.items.filter(item => 'str' in item).map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim()
          if (!pageText) emptyPages.push(i)
          text += `【PDF第${i}页】\n${pageText || '（本页未提取到文字，请核对原页图片）'}\n\n`
          if (text.length > 50000) throw new Error('提取文字超过5万字，请拆分附件，不会静默截断')
          page.cleanup()
        }
        if (emptyPages.length === doc.numPages) throw new Error('这份PDF未提取到文字，可能是扫描件；本工具尚不支持OCR')
        result = {kind:'text',choices:[{label:`PDF正文 · ${doc.numPages}页`,text}],warnings:['保留PDF页码标记；多栏、表格和公式的阅读顺序可能变化，请对照原件复核','不执行PDF脚本、不读取嵌入文件；图片与扫描文字未做OCR',...(emptyPages.length ? [`第${emptyPages.join('、')}页未提取到文字，不代表原页为空`] : [])]}
      } finally { await task.destroy() }
    } else if (['docx','xlsx'].includes(extension)) result = parseOffice(bytes,extension)
    else {
      const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes)
      if (text.includes('\0') || text.length > 50000) throw new Error('文本需为5万字以内的UTF-8纯文本')
      result = {kind:extension === 'csv' ? 'sheet' : 'text',choices:[{label:'纯文本',text}],warnings:[]}
    }
    self.postMessage({type:'campthink-attachment-result',result})
  } catch (error) { self.postMessage({type:'campthink-attachment-result',error:error.message || '附件无法读取，请另存为纯文本重试'}) }
}
