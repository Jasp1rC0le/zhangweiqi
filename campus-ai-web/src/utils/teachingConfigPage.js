const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function validatedConfigPage(data, query) {
  const option = row => row && typeof row.value === 'string' && row.value.length > 0 && row.value.length <= 100 &&
    typeof row.label === 'string' && row.label.length > 0 && row.label.length <= 100 &&
    typeof row.description === 'string' && row.description.length <= 100 &&
    (query.kind === 'COLLEGE' || (query.kind==='TEACHER'?/^[1-9]\d{0,15}$/.test(row.value)&&Number.isSafeInteger(Number(row.value)):uuid.test(row.value)))
  if (!data || data.page !== query.page || data.size !== query.size || !Number.isSafeInteger(data.total) || data.total < 0 ||
    data.totalPages !== Math.ceil(data.total / data.size) || !Array.isArray(data.items) ||
    data.items.length !== Math.min(data.size, Math.max(0, data.total - data.page * data.size)) ||
    data.items.some(row => !option(row)) || new Set(data.items.map(row => row.value)).size !== data.items.length ||
    (data.selected !== null && (!option(data.selected) || data.selected.value !== query.selected)))
    throw new Error('配置范围响应不完整，请重新读取')
  return data
}
export function createConfigPager({ owner, read, state }) {
  let epoch = 0, controller
  function reset() {
    epoch++; controller?.abort()
    Object.assign(state, { items: [], selected: null, page: 0, total: 0, totalPages: 0, loading: false, error: '' })
  }
  async function load(query) {
    controller?.abort(); controller = new AbortController()
    const signal = controller.signal, generation = ++epoch, principal = owner()
    const current = () => !!principal && owner() === principal && epoch === generation && !signal.aborted
    state.loading = true; state.error = ''
    try {
      const { data } = await read(query, signal)
      if (!current()) return false
      const value = validatedConfigPage(data, query)
      Object.assign(state, value)
      return true
    } catch (failure) {
      if (current()) state.error = failure.response?.data?.message || failure.message || '读取范围失败，请重试'
      return false
    } finally { if (current()) state.loading = false }
  }
  return { reset, load }
}
