import { compileFormula, emptyCalculation, validateCalculation, FORMULA_VERSION } from './formulaEngine.js'
import { parseCsv, numericCell, formatNumber } from './projectDataCheck.js'
import { describeValues } from './measurementStats.js'

export function calculateColumns(sheet) {
  const settings=sheet?.calculation||emptyCalculation(),parsed=parseCsv(sheet?.csv||'')
  const report={version:FORMULA_VERSION,settings:{...settings},headers:parsed.headers,rows:[],error:'',summary:null}
  try {
    const validation=validateCalculation(settings);if(validation)throw new Error(validation)
    if(parsed.error)throw new Error(parsed.error)
    if(!parsed.rows.length)throw new Error('至少需要一行数据')
    const compiled=compileFormula(settings.expression)
    if(!settings.confirmed)throw new Error('先核对变量、单位和算式适用条件，再勾选确认')
    if(!settings.outputUnit.trim())throw new Error('填写结果单位；没有单位请填“无量纲”')
    for(const variable of compiled.variables) {
      const column=settings[`${variable}Column`]
      if(column<0||column>=parsed.headers.length)throw new Error(`为 ${variable} 选择数据列`)
      if(!settings[`${variable}Unit`].trim())throw new Error(`填写 ${variable} 的单位或“无量纲”`)
      if(settings.resultColumn===column)throw new Error('待核对结果列不能同时作为算式输入，避免循环验证')
    }
    if(settings.resultColumn>=parsed.headers.length)throw new Error('待核对结果列已不存在，请重新选择')
    report.variables=compiled.variables
    report.rows=parsed.rows.map(row=>{
      const result={line:row.line,inputs:{},value:null,claimed:null,difference:null,status:'未计算',error:''}
      try {
        if(row.cells.length!==parsed.headers.length)throw new Error('此行列数与表头不一致')
        for(const variable of compiled.variables){const value=numericCell(row.cells[settings[`${variable}Column`]]);if(value===null)throw new Error(`${variable} 不是有效纯数字或为空`);result.inputs[variable]=value}
        result.value=compiled.evaluate(result.inputs)
        result.status='已计算'
        if(settings.resultColumn>=0) {
          result.claimed=numericCell(row.cells[settings.resultColumn])
          if(result.claimed===null){result.status='结果列需核对';result.error='待核对结果为空或非纯数字'}
          else {
            result.difference=Math.abs(result.value-result.claimed)
            // The user tolerance is not expanded silently for floating-point roundoff.
            result.status=result.difference<=settings.tolerance?'差异在容差内':'差异超出容差'
          }
        }
      } catch(e){result.error=e.message}
      return result
    })
    report.summary=describeValues(report.rows.filter(r=>r.value!==null).map(r=>r.value))
  } catch(e){report.error=e.message}
  return report
}
export function calculationSettingsText(settings) {
  if(!settings?.expression)return '未设置公式复算'
  return `算式：${settings.expression}\nx：第${settings.xColumn+1}列，${settings.xUnit||'未填单位'}；y：第${settings.yColumn+1}列，${settings.yUnit||'未填单位'}\n结果单位：${settings.outputUnit||'未填'}；待核对列：${settings.resultColumn<0?'不比较':settings.resultColumn+1}\n允许绝对差：${settings.tolerance}；本人确认适用条件：${settings.confirmed?'是':'否'}`
}
export function calculationMarkdown(sheet) {
  if(!sheet?.calculation?.expression)return ''
  const report=calculateColumns(sheet)
  let text=`\n\n## 列公式复算 · ${FORMULA_VERSION}\n\n${calculationSettingsText(sheet.calculation)}\n\n仅复算本人指定的算式，不验证公式适用性、数据真实性或单位换算。浮点计算，显示10位有效数字；容差由本人设定。\n`
  if(report.error)return text+`\n未运行：${report.error}\n`
  text+=`\n有效结果${report.summary?.count||0}/${report.rows.length}行；${report.summary?`均值${formatNumber(report.summary.mean)}，合计${formatNumber(report.summary.sum)}`:'没有可汇总结果'}\n`
  return text+report.rows.map(row=>`- 原始第${row.line}行：${Object.entries(row.inputs).map(([key,value])=>`${key}=${value}`).join('，')} → ${row.value===null?'未计算':formatNumber(row.value)}；${row.status}${row.difference===null?'':`，原结果=${row.claimed}，绝对差=${formatNumber(row.difference)}`}${row.error?`；${row.error}`:''}`).join('\n')+'\n'
}
