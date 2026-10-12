import { onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { createLeaveGuard } from './leaveGuard'

export function useUnsavedChanges(isDirty, isBusy = () => false, isRecoverable = () => false) {
  const beforeUnload = event => {
    if (!isBusy() && (!isDirty() || isRecoverable())) return
    event.preventDefault()
    event.returnValue = ''
  }
  const mayLeave = createLeaveGuard(isDirty, isBusy, async () => {
    await ElMessageBox.confirm(
      '当前页面有未保存的填写内容，可能包含浏览器自动填充的字段。离开后这些内容不会提交或保存。',
      '离开前保留修改？',
      { confirmButtonText: '放弃并离开', cancelButtonText: '继续编辑', closeOnClickModal: false },
    )
    return true
  })
  onBeforeRouteLeave(mayLeave)
  onMounted(() => window.addEventListener('beforeunload', beforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload))
}
