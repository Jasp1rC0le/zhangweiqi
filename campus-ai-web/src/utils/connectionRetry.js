// Resolve against the actual workspace route graph, then navigate normally so
// every existing login/role guard still runs. This never grants access.
export function workspaceRetryTarget(value, resolve) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/')
      || value.startsWith('//') || value.includes('\\')
      || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    return '/chat'
  }
  try {
    const target = resolve(value)
    if (target.matched?.some(record => record.name === 'workspace' && record.meta?.requiresAuth)) {
      return target.fullPath
    }
  } catch { /* Invalid or unknown destinations safely return to the chat entry. */ }
  return '/chat'
}
