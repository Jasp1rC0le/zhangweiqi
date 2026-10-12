import test from 'node:test'
import assert from 'node:assert/strict'
import {compileFormula,emptyCalculation,validateCalculation} from '../src/utils/formulaEngine.js'
import {calculateColumns,calculationMarkdown} from '../src/utils/columnCalculation.js'
import {emptyDataSheet} from '../src/utils/projectDataCheck.js'
import {projectChanges} from '../src/utils/projectProgress.js'
import {emptyProject,projectMarkdown} from '../src/utils/projectStudio.js'
const sheet=()=>({...emptyDataSheet(),source:'合成测试',csv:'数量,单价,金额\n2,5,10\n3,4,11\n,5,0',calculation:{...emptyCalculation(),expression:'x*y',xColumn:0,yColumn:1,resultColumn:2,xUnit:'件',yUnit:'元/件',outputUnit:'元',confirmed:true}})
test('limited arithmetic honors precedence, signs and explicit functions',()=>{
  assert.equal(compileFormula('-x + y * 2').evaluate({x:3,y:4}),5)
  assert.equal(compileFormula('sqrt(x*x)+abs(-y)').evaluate({x:3,y:4}),7)
  assert.equal(compileFormula('x/1e3').evaluate({x:500}),0.5)
  assert.equal(compileFormula('x - -y').evaluate({x:2,y:3}),5)
  assert.deepEqual(compileFormula('x+x').variables,['x'])
})
test('rejects code, property access, unsupported grammar and excessive nesting',()=>{
  for(const text of ['window.alert(x)','x.constructor','fetch(x)','x=1','x**y','x^y','x;y','x[y]','2x','SUM(x,y)','1+2','x +', '('.repeat(20)+'x'+')'.repeat(20)])assert.throws(()=>compileFormula(text),undefined,text)
  assert.throws(()=>compileFormula('x/0').evaluate({x:1}),/除数/)
  assert.throws(()=>compileFormula('sqrt(-x)').evaluate({x:1}),/负数/)
  assert.throws(()=>compileFormula('x*1e12').evaluate({x:2}),/超出/)
  assert.throws(()=>compileFormula('x*1e-320').evaluate({x:1e-20}),/精度/)
  assert.throws(()=>compileFormula('x+1e-999'),/精度/)
})
test('compares rows without mutating data or coercing missing values into zero',()=>{
  const input=sheet(),before=JSON.stringify(input),report=calculateColumns(input)
  assert.equal(report.error,'');assert.equal(report.summary.count,2)
  assert.deepEqual(report.rows.map(r=>r.status),['差异在容差内','差异超出容差','未计算'])
  assert.equal(report.rows[1].difference,1);assert.equal(report.rows[2].line,4)
  assert.equal(report.rows[2].value,null);assert.equal(JSON.stringify(input),before)
  assert.match(calculationMarkdown(input),/原始第3行/)
})
test('requires explicit units, confirmation and acyclic result mapping',()=>{
  const input=sheet()
  input.calculation.confirmed=false;assert.match(calculateColumns(input).error,/勾选确认/)
  input.calculation.confirmed=true;input.calculation.xUnit='';assert.match(calculateColumns(input).error,/单位/)
  input.calculation.xUnit='件';input.calculation.resultColumn=0;assert.match(calculateColumns(input).error,/循环/)
  input.calculation.resultColumn=29;assert.match(calculateColumns(input).error,/不存在/)
  assert.ok(validateCalculation({...emptyCalculation(),tolerance:null}))
  assert.ok(validateCalculation({...emptyCalculation(),tolerance:Infinity}))
})
test('physical lines, shape errors, zero denominators and invalid claimed results are explicit',()=>{
  const input=sheet();input.csv='数量,单价,金额\n\n1,0,0\n2,2,wrong\n1,2,3,4';input.calculation.expression='x/y'
  const report=calculateColumns(input)
  assert.equal(report.rows[0].line,3);assert.match(report.rows[0].error,/除数/)
  assert.equal(report.rows[1].value,1);assert.equal(report.rows[1].status,'结果列需核对')
  assert.match(report.rows[2].error,/列数/)
})
test('changed formulas appear in version diff and export includes reproducible inputs',()=>{
  const before=emptyProject(),after={...before,dataSheet:sheet()}
  assert.match(projectChanges(before,after).find(c=>c.label==='数据表与检查设置').after,/x\*y/)
  assert.match(projectMarkdown(after,1),/列公式复算/)
  assert.match(projectMarkdown(after,1),/x=3，y=4/)
  assert.equal(calculationMarkdown(emptyDataSheet()),'')
})
