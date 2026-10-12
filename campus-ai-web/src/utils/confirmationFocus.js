// Capture before the caller disables its fieldset. Do not read or persist field values.
export function captureConfirmationFocus(document, allowed = () => true, releasedDialog = () => null) {
  const target = document?.activeElement
  let finished = false
  return () => {
    if (finished) return false
    finished = true
    if (
      !allowed() ||
      !target ||
      target === document.body ||
      target === document.documentElement ||
      target.ownerDocument !== document ||
      !target.isConnected ||
      typeof target.focus !== 'function' ||
      target.matches(':disabled') ||
      target.closest('.el-message-box, [inert], [hidden], [aria-hidden="true"]') ||
      !target.getClientRects().length
    )
      return false

    // Another dialog or a deliberate new focus must win over this old decision.
    const current = document.activeElement
    if (
      current &&
      current !== document.body &&
      current !== document.documentElement &&
      current !== target &&
      !releasedDialog()?.contains(current)
    )
      return false
    const style = document.defaultView?.getComputedStyle(target)
    if (
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse' ||
      style?.display === 'none'
    )
      return false
    target.focus({ preventScroll: true })
    return document.activeElement === target
  }
}
