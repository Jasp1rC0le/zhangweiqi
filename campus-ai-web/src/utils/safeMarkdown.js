import DOMPurify from 'dompurify'
import { marked } from 'marked'

export function safeExternalUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

// Only this reviewed public asset may be linked relatively by a model response.
// Do not allow arbitrary same-origin URLs (especially /api, admin or logout routes).
export function safeMessageUrl(value) {
  if (value === '/campus-map/tsguas-handdrawn-2026-10-09.jpg') return value
  return safeExternalUrl(value)
}

export function renderMarkdown(content) {
  const html = DOMPurify.sanitize(marked.parse(content || '', { async:false, breaks:true, gfm:true }), {
    USE_PROFILES: { html:true },
    // 防止模型输出的外部图片/媒体自动发送访问信息或携带敏感查询参数。
    FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'link'],
    FORBID_ATTR: ['style', 'srcset'],
  })
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  // A model may quote the supplied asset path as code instead of a Markdown link.
  // Convert only the one reviewed public map, not arbitrary code or internal paths.
  for (const code of parsed.querySelectorAll('code')) {
    const value = code.textContent?.trim()
    if (value !== '/campus-map/tsguas-handdrawn-2026-10-09.jpg' || code.closest('pre')) continue
    const link = parsed.createElement('a')
    link.setAttribute('href', value)
    link.textContent = '查看校园手绘地图'
    code.replaceWith(link)
  }
  for (const link of parsed.querySelectorAll('a[href]')) {
    const text = link.textContent || '', closing = text.indexOf('）')
    if (/^https?:\/\//.test(text) && closing > 0) {
      const url = safeExternalUrl(text.slice(0, closing))
      if (url) { link.href = url; link.textContent = text.slice(0, closing); link.after(parsed.createTextNode(text.slice(closing))) }
    }
    const safe = safeMessageUrl(link.getAttribute('href'))
    if (safe) { link.href = safe; link.target = '_blank'; link.rel = 'noopener noreferrer' }
    else { link.removeAttribute('href'); link.removeAttribute('target') }
  }
  return parsed.body.innerHTML
}
