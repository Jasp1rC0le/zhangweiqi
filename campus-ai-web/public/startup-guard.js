// A tiny independent bootstrap guard. Never render exception text, URLs or tokens.
(() => {
  function failed(event) {
    const root = document.getElementById('campthink-startup')
    if (!root) return
    if (event.type === 'error' && event.target !== window && event.target?.tagName !== 'SCRIPT') return
    root.querySelector('[data-startup-title]').textContent = '页面暂时没有载入'
    root.querySelector('[data-startup-message]').textContent = '页面文件未能正常加载。请检查网络后刷新浏览器，或返回首页重试。'
    root.setAttribute('role', 'alert')
  }
  function mounted() {
    window.removeEventListener('error', failed, true)
    window.removeEventListener('unhandledrejection', failed)
  }
  window.addEventListener('error', failed, true)
  window.addEventListener('unhandledrejection', failed)
  window.addEventListener('campthink:mounted', mounted, {once: true})
})()
