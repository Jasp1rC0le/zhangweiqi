export function evaluationTargetLabel(item, report) {
  const original = `标准资料 #${item.expectedDocumentId}`
  const result = report?.cases?.find((entry) => entry.id === item.id)
  if (result?.targetStatus === 'UNAVAILABLE') {
    return `${original} · 无有效发布版本，请核对资料状态`
  }
  if (result?.targetStatus === 'REVISED' && Number.isSafeInteger(result.evaluatedDocumentId)
    && result.evaluatedDocumentId > 0) {
    return `${original} → 当前版本 #${result.evaluatedDocumentId}`
  }
  return original
}
