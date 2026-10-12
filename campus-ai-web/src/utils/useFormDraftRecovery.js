import { ref, watch } from 'vue'

export function useFormDraftRecovery({state, recovery}, entries) {
  const pending = ref(recovery.snapshot()?.entries[0] ?? null), notice = ref('')
  let localChange = false
  watch(() => state.value.enabled, enabled => {
    if (!enabled) pending.value = null
    else if (!localChange) pending.value = recovery.snapshot()?.entries[0] ?? null
  }, {flush:'sync'})
  function save() {
    if (!state.value.enabled || pending.value) return false
    return recovery.save(entries(),null)
  }
  function toggle(enabled) {
    localChange = true
    try {
      const ok = recovery.setEnabled(enabled,enabled ? entries() : [],null)
      notice.value = ok ? enabled ? '已开启；后续修改会更新本标签页临时副本' : '已清除临时副本，当前输入不变' : state.value.error || '需要确认登录身份后才能开启暂存'
      if (!enabled) pending.value = null
    } finally { localChange = false }
  }
  function peek() {
    const value = recovery.snapshot()?.entries[0]
    if (!value) { pending.value = null; notice.value = '暂存已过期或登录状态已变化，无法恢复' }
    return value
  }
  function restored() { pending.value = null; notice.value = '已恢复到编辑区，尚未提交'; save() }
  return {state,pending,notice,save,toggle,peek,restored,discard:() => toggle(false),
    hasCurrent:() => !pending.value && recovery.matches(entries(),null)}
}
