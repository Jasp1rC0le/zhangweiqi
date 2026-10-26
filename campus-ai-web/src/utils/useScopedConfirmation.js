import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { createScopedConfirmation } from './scopedConfirmation'
import { captureConfirmationFocus } from './confirmationFocus'
import { createOwnedConfirmationFence } from './ownedConfirmation'

let nextConfirmation = 0
export function useScopedConfirmation(scope, active = () => true) {
  const confirming = ref(false)
  let releasedDialog = null
  let ownedFence = null
  const stopScopeWatch=watch(()=>[scope(),active()],()=>ownedFence?.check(),{flush:'sync'})
  onBeforeUnmount(()=>{stopScopeWatch();ownedFence?.invalidate()})
  const decide = createScopedConfirmation({
    scope,
    active,
    pending: (value) => {
      confirming.value = value
    },
    ask: async (message, options = {}) => {
      const dialogClass = `ct-scoped-confirm-${++nextConfirmation}`
      const fence=createOwnedConfirmationFence({scope,active,
        find:()=>typeof document==='undefined'?null:document.querySelector(`.${dialogClass}`),
        close:dialog=>{const button=dialog.querySelector('.el-message-box__headerbtn');if(!button)return false;dialog.style.visibility='hidden';dialog.setAttribute('aria-hidden','true');button.click();return true},
        observe:check=>{if(typeof MutationObserver==='undefined' || typeof document==='undefined' || !document.body)return ()=>{};const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true});return ()=>observer.disconnect()},
      })
      ownedFence=fence
      const decision = ElMessageBox.confirm(message, options.title || '确认课表操作', {
        confirmButtonText: options.confirmText || '确认继续',
        cancelButtonText: options.cancelText || '取消，保留内容',
        type: options.type,
        closeOnClickModal: false,
        autofocus: false,
        customClass: [dialogClass,options.className||''].filter(Boolean).join(' '),
      })
      await nextTick()
      const dialog =
        typeof document === 'undefined' ? null : document.querySelector(`.${dialogClass}`)
      fence.check()
      try {
        await decision
        return true
      } finally {
        fence.dispose();if(ownedFence===fence)ownedFence=null
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
