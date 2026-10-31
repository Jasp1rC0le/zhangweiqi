export function validSchoolInvoice(value) {
  return value?.unitName === '天津中德应用技术大学' && value?.taxId === '12120000401200249U'
    && value?.sourceUrl === 'https://cwsj.tsguas.edu.cn/' && /^\d{4}-\d{2}-\d{2}$/.test(value?.checkedOn || '')
}
export function schoolInvoiceText(value) {
  return validSchoolInvoice(value) ? `单位名称：${value.unitName}\n单位税号：${value.taxId}` : ''
}
