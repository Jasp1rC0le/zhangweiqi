import { shallowRef } from 'vue'

export const routeLoadFailure = shallowRef(null)
const handledErrors = new WeakSet()
const HOME = '/login?reauth=1'
export function isAssetLoadFailure(error) {
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading (?:css )?chunk.*failed|unable to preload css/i.test(String(error?.message || ''))
}
export function safeReloadPath(value, resolve) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')
      || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return HOME
  try {
    const target = resolve(value)
    if (target.matched?.length && !target.matched.some(record => record.name === 'not-found')) return target.fullPath
  } catch { /* Unknown or malformed URLs never become external reloads. */ }
  return HOME
}
export function recordRouteFailure(error, to, from, resolve) {
  if (error && typeof error === 'object') handledErrors.add(error)
  routeLoadFailure.value = {
    kind: isAssetLoadFailure(error) ? 'asset' : 'navigation',
    target: safeReloadPath(to?.fullPath, resolve),
    retainPage: Boolean(from?.matched?.length && from.name !== 'not-found'),
  }
}
export function wasRouteFailureHandled(error) { return Boolean(routeLoadFailure.value && error && typeof error === 'object' && handledErrors.has(error)) }
export function clearRouteFailure() { routeLoadFailure.value = null }
export function reloadFailedRoute(failure, { resolve, confirm, assign }) {
  if (!failure) return false
  if (failure.retainPage && !confirm('重新载入会离开当前页面。请先保留未保存的内容，是否继续？')) return false
  assign(safeReloadPath(failure.target, resolve))
  return true
}
