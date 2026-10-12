// Small arithmetic language: no eval, Function, property access, assignments or host calls.
export const FORMULA_VERSION = 'column-formula-1'
export const emptyCalculation = () => ({ expression:'', xColumn:-1, yColumn:-1, resultColumn:-1, xUnit:'', yUnit:'', outputUnit:'', confirmed:false, tolerance:0.000001 })
export const calculationPresets = [
  {label:'数量 × 单价',expression:'x * y',help:'x选择数量，y选择单价；结果是金额，先自行统一计价单位'},
  {label:'变化率',expression:'(x - y) / y * 100',help:'x选择本期值，y选择基期值；结果单位填%，基期为0的行无法计算'},
  {label:'毛利率',expression:'(x - y) / x * 100',help:'x选择收入，y选择成本；两列先统一货币和口径，结果单位填%，收入为0不能计算'},
  {label:'自定义算式',expression:'',help:'例如 x / 1000；支持 x、y、数字、括号、+ − * /、abs()、sqrt()，不是Excel公式'},
]
export function validateCalculation(value) {
  if (value == null) return ''
  if (typeof value !== 'object' || typeof value.expression !== 'string' || value.expression.length > 200 || value.expression.includes('\0')) return '算式最多200字'
  if (![value.xColumn,value.yColumn,value.resultColumn].every(v=>Number.isInteger(v)&&v>=-1&&v<30)) return '公式变量需选择有效列'
  if (![value.xUnit,value.yUnit,value.outputUnit].every(v=>typeof v==='string'&&v.length<=40&&!v.includes('\0'))) return '公式单位最多40字'
  if (typeof value.confirmed !== 'boolean' || typeof value.tolerance !== 'number' || !Number.isFinite(value.tolerance) || value.tolerance<0 || value.tolerance>1e6) return '允许绝对差需为0至1000000之间的数字'
  return ''
}
export function compileFormula(expression) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length>200) throw new Error('填写200字以内的算式')
  const tokens=[]; let offset=0
  while(offset<expression.length) {
    const rest=expression.slice(offset), match=/^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[a-z]+|[()+*/-])/.exec(rest)
    if(!match) throw new Error(`第${offset+1}个字符不受支持；仅接受算术表达式`)
    offset+=match[0].length
    if(match[0].trim()) tokens.push(match[0])
    if(tokens.length>128) throw new Error('算式过于复杂，请拆成更短的计算')
  }
  let cursor=0, depth=0; const variables=new Set()
  const bounded = value => { if(!Number.isFinite(value)||Math.abs(value)>1e12)throw new Error('数值超出±10¹²或无法计算');return value }
  function atom() {
    if(++depth>16)throw new Error('括号或连续符号超过16层')
    try {
      const token=tokens[cursor++]
      if(token==='+'||token==='-')return {type:'unary',op:token,child:atom()}
      if(token==='(') { const child=expressionNode();if(tokens[cursor++]!==')')throw new Error('括号未配对');return child }
      if(token==='x'||token==='y') { variables.add(token);return {type:'variable',name:token} }
      if(token==='abs'||token==='sqrt') {
        if(tokens[cursor++]!=='(')throw new Error(`${token}需要括号`)
        const child=expressionNode();if(tokens[cursor++]!==')')throw new Error('函数括号未配对');return {type:'function',name:token,child}
      }
      if(token&&/^(?:\d|\.)/.test(token)) {const value=bounded(Number(token));if(value===0&&/[1-9]/.test(token.split(/[eE]/)[0]))throw new Error('常量过小，超出精度');return {type:'number',value}}
      throw new Error('缺少数字或变量，仅支持 x、y、abs()、sqrt()')
    } finally {depth--}
  }
  function product() { let node=atom();while(['*','/'].includes(tokens[cursor])){const op=tokens[cursor++];node={type:'binary',op,left:node,right:atom()}}return node }
  function expressionNode() { let node=product();while(['+','-'].includes(tokens[cursor])){const op=tokens[cursor++];node={type:'binary',op,left:node,right:product()}}return node }
  const root=expressionNode()
  if(cursor!==tokens.length)throw new Error('算式存在多余内容；乘法请明确写 *')
  if(!variables.size)throw new Error('至少使用一个数据变量 x 或 y')
  function evaluateNode(node,values) {
    if(node.type==='number')return node.value
    if(node.type==='variable')return bounded(values[node.name])
    if(node.type==='unary'){const v=evaluateNode(node.child,values);return node.op==='-'?-v:v}
    if(node.type==='function') {const v=evaluateNode(node.child,values);if(node.name==='sqrt'&&v<0)throw new Error('负数不能开实数平方根');return bounded(node.name==='abs'?Math.abs(v):Math.sqrt(v))}
    const a=evaluateNode(node.left,values),b=evaluateNode(node.right,values)
    if(node.op==='/'&&b===0)throw new Error('除数为0，未计算')
    const value=bounded(node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:a/b)
    if(value===0&&a!==0&&b!==0&&['*','/'].includes(node.op))throw new Error('结果过小，超出精度')
    return value
  }
  return {variables:[...variables].sort(),evaluate:values=>evaluateNode(root,values)}
}
