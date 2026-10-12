import { nextTick, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { createScopedConfirmation } from './scopedConfirmation'
import { captureConfirmationFocus } from './confirmationFocus'

let nextConfirmation = 0
export function useScopedConfirmation(scope, active = () => true) {
  const confirming = ref(false)
  let releasedDialog = null
  const decide = createScopedConfirmation({
    scope,
    active,
    pending: (value) => {
      confirming.value = value
    },
    ask: async (message, options = {}) => {
      const dialogClass = `ct-scoped-confirm-${++nextConfirmation}`
      const decision = ElMessageBox.confirm(message, options.title || '确认课表操作', {
        confirmButtonText: options.confirmText || '确认继续',
        cancelButtonText: options.cancelText || '取消，保留内容',
        closeOnClickModal: false,
        autofocus: false,
        customClass: dialogClass,
      })
      await nextTick()
      const dialog =
        typeof document === 'undefined' ? null : document.querySelector(`.${dialogClass}`)
      try {
        await decision
        return true
      } finally {
        releasedDialog = dialog
      }
    },
  })
  async function confirm(message, options) {
    if (confirming.value) return false
    const owner = scope()
    releasedDialog = null
    let closedDialog = null
    const restore = captureConfirmationFocus(
      typeof document === 'undefined' ? undefined : document,
      () => !!owner && active() && owner === scope(),
      () => closedDialog,
    )
    const accepted = await decide(message, options)
    closedDialog = releasedDialog
    if (!accepted) {
      // The trap has released, but its disabled former trigger can leave focus
      // inside this closing dialog. Never treat a different dialog as released.
      await nextTick()
      restore()
    }
    return accepted
  }
  return { confirming, confirm }
}
