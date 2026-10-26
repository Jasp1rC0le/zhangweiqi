import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { cjkStrongExtension } from './cjkStrong.js'

const messageMarkdown = new Marked(cjkStrongExtension())

export function safeExternalUrl(value) {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

const reviewedMapLinks = Object.freeze({
  '/campus-map/tsguas-handdrawn-2026-10-09.jpg': '查看校园手绘地图',
  '/campus-map/tsguas-official-aerial-undated-2026-10-11.jpg': '查看官网校园实景图（日期未知）',
})
const reviewedMapPattern = new RegExp(Object.keys(reviewedMapLinks)
  .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')

// Link only a complete reviewed path, not a substring of a URL, query or file name.
export function reviewedMapTextParts(text) {
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(reviewedMapPattern)) {
    const start = match.index, end = start + match[0].length
    const before = text[start - 1], after = text[end]
    if ((before && !/[\s：，。；（【《“‘(["']/.test(before))
      || (after && !/[\s，。；：！？、）】》”’),;!"']/.test(after))) continue
    if (start > cursor) parts.push({ text: text.slice(cursor, start) })
    parts.push({ text: reviewedMapLinks[match[0]], href: match[0] })
    cursor = end
  }
  if (cursor < text.length || parts.length === 0) parts.push({ text: text.slice(cursor) })
  return parts
}

// Only these reviewed public assets may be linked relatively by a model response.
// Do not allow arbitrary same-origin URLs (especially /api, admin or logout routes).
export function safeMessageUrl(value) {
  if (Object.hasOwn(reviewedMapLinks, value)) return value
  return safeExternalUrl(value)
}

export function renderMarkdown(content) {
  const html = DOMPurify.sanitize(messageMarkdown.parse(content || '', { async:false, breaks:true, gfm:true }), {
    USE_PROFILES: { html:true },
    // 防止模型输出的外部图片/媒体自动发送访问信息或携带敏感查询参数。
    FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'style', 'link'],
    FORBID_ATTR: ['style', 'srcset'],
  })
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  // A model may quote the supplied asset path as code instead of a Markdown link.
  // Convert only reviewed public maps, not arbitrary code or internal paths.
  for (const code of parsed.querySelectorAll('code')) {
    const value = code.textContent?.trim()
    if (!Object.hasOwn(reviewedMapLinks, value) || code.closest('pre')) continue
    const link = parsed.createElement('a')
    link.setAttribute('href', value)
    link.textContent = reviewedMapLinks[value]
    code.replaceWith(link)
  }
  // Models also return bare paths. Work on sanitized text nodes, never on HTML strings,
  // and leave existing anchors and code samples untouched.
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) {
    if (!walker.currentNode.parentElement?.closest('a, code, pre')) textNodes.push(walker.currentNode)
  }
  for (const node of textNodes) {
    const parts = reviewedMapTextParts(node.nodeValue || '')
    if (!parts.some(part => part.href)) continue
    const fragment = parsed.createDocumentFragment()
    for (const part of parts) {
      if (!part.href) { fragment.append(parsed.createTextNode(part.text)); continue }
      const link = parsed.createElement('a')
      link.setAttribute('href', part.href)
      link.textContent = part.text
      fragment.append(link)
    }
    node.replaceWith(fragment)
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
