<script setup>
import {computed,ref} from 'vue'
import {emptyCalculation,calculationPresets} from '@/utils/formulaEngine'
import {calculateColumns} from '@/utils/columnCalculation'
import {parseCsv,formatNumber} from '@/utils/projectDataCheck'
const props=defineProps({sheet:{type:Object,required:true}})
const emit=defineEmits(['update'])
const settings=computed(()=>props.sheet.calculation||emptyCalculation())
const headers=computed(()=>parseCsv(props.sheet.csv).headers)
const report=ref(null),checked=ref(''),page=ref(0)
const snapshot=()=>JSON.stringify({csv:props.sheet.csv,calculation:settings.value})
const stale=computed(()=>checked.value!==snapshot())
const rows=computed(()=>report.value?.rows.slice(page.value*20,page.value*20+20)||[])
function update(key,value){emit('update',{...settings.value,[key]:value,confirmed:key==='confirmed'?value:false})}
function usePreset(event){const preset=calculationPresets[Number(event.target.value)];if(preset)update('expression',preset.expression)}
function calculate(){report.value=calculateColumns(props.sheet);checked.value=snapshot();page.value=0}
</script>
<template>
  <details class="column-calculation">
    <summary>公式复算与结果核对</summary>
    <p>把表格列对应到 x、y，逐行算一次；如果报告已有结果，再选一列来比较。不会修改原始数据。</p>
    <div class="formula-fields">
      <label>从常见算式开始<select aria-label="选择常见算式" @change="usePreset"><option value="">选择模板（可选）</option><option v-for="(preset,index) in calculationPresets" :key="preset.label" :value="index">{{ preset.label }}</option></select></label>
      <label class="formula-wide">你的算式<input :value="settings.expression" maxlength="200" placeholder="例如 (x - y) / y * 100" spellcheck="false" @input="update('expression',$event.target.value)" /></label>
      <label>x 对应哪一列<select :value="settings.xColumn" @change="update('xColumn',Number($event.target.value))"><option :value="-1">请选择</option><option v-for="(header,index) in headers" :key="index" :value="index">{{ index+1 }} · {{ header||'空表头' }}</option></select></label>
      <label>x 的单位<input :value="settings.xUnit" maxlength="40" placeholder="例如 元、mm、无量纲" @input="update('xUnit',$event.target.value)" /></label>
      <label>y 对应哪一列（算式用到才填）<select :value="settings.yColumn" @change="update('yColumn',Number($event.target.value))"><option :value="-1">不使用</option><option v-for="(header,index) in headers" :key="index" :value="index">{{ index+1 }} · {{ header||'空表头' }}</option></select></label>
      <label>y 的单位<input :value="settings.yUnit" maxlength="40" placeholder="例如 元、mm、无量纲" @input="update('yUnit',$event.target.value)" /></label>
      <label>结果单位<input :value="settings.outputUnit" maxlength="40" placeholder="例如 %、元、无量纲" @input="update('outputUnit',$event.target.value)" /></label>
      <label>与报告中的结果比较（选填）<select :value="settings.resultColumn" @change="update('resultColumn',Number($event.target.value))"><option :value="-1">只计算，不比较</option><option v-for="(header,index) in headers" :key="index" :value="index">{{ index+1 }} · {{ header||'空表头' }}</option></select></label>
      <label v-if="settings.resultColumn>=0">允许绝对差（结果单位）<input :value="settings.tolerance" type="number" min="0" max="1000000" step="any" @input="update('tolerance',$event.target.value===''?null:Number($event.target.value))" /></label>
    </div>
    <p class="data-help">支持 + − * /、括号、abs()、sqrt()；不支持Excel函数、脚本或自动单位换算。变化率的 y 是基期，毛利率的 x 是收入。%按百分数填写（20%填20）。数值限±10¹²，浮点结果显示10位有效数字，容差由你设置。</p>
    <label class="formula-consent"><input :checked="settings.confirmed" type="checkbox" @change="update('confirmed',$event.target.checked)" />我已核对列含义、单位、算式适用条件；单位文字不代表系统做过量纲验证</label>
    <button class="primary" :disabled="!settings.confirmed||!settings.expression.trim()||!sheet.csv.trim()" @click="calculate">{{ report?'重新复算':'逐行复算' }}</button>
    <p v-if="report&&stale" role="status" class="studio-warning">数据或算式已修改，下方为旧结果，请重新确认并复算</p>
    <p v-if="report?.error" role="alert" class="studio-error">{{ report.error }}</p>
    <template v-if="report&&!report.error">
      <p role="status">{{ report.summary?.count||0 }} / {{ report.rows.length }}行得到数值结果；{{ report.rows.filter(row=>row.status==='差异超出容差').length }}行差异超出容差，{{ report.rows.filter(row=>row.error).length }}行需人工核对</p>
      <p class="data-help">本次算式：{{ report.settings.expression }} · 结果单位：{{ report.settings.outputUnit }}。不是专业结论正确性判定；完整逐行过程包含在项目导出中。</p>
      <div class="data-preview" tabindex="0" role="region" aria-label="公式复算结果，可横向滚动"><table><thead><tr><th scope="col">原始行</th><th scope="col">输入变量</th><th scope="col">复算值</th><th scope="col">原结果 / 绝对差</th><th scope="col">状态与原因</th></tr></thead><tbody><tr v-for="row in rows" :key="row.line"><th scope="row">{{ row.line }}</th><td>{{ Object.entries(row.inputs).map(([key,value])=>`${key}=${formatNumber(value)}`).join('，')||'未读取' }}</td><td>{{ row.value===null?'未计算':formatNumber(row.value) }}</td><td>{{ row.claimed===null?'未比较':`${formatNumber(row.claimed)} / ${formatNumber(row.difference)}` }}</td><td>{{ row.status }}{{ row.error?`：${row.error}`:'' }}</td></tr></tbody></table></div>
      <nav v-if="report.rows.length>20" class="data-pagination" aria-label="公式结果分页"><button :disabled="page===0" @click="page--">上一页</button><span>{{ page+1 }} / {{ Math.ceil(report.rows.length/20) }}</span><button :disabled="(page+1)*20>=report.rows.length" @click="page++">下一页</button></nav>
    </template>
  </details>
</template>
<style scoped>
.column-calculation{margin:28px 0;padding:20px 0;border-block:1px solid #d9ddce}.column-calculation>summary{font-size:18px!important;font-weight:600}.column-calculation>p{line-height:1.7;max-width:72ch}.formula-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin:24px 0}.formula-fields label{display:grid;gap:8px;font-size:14px;min-width:0}.formula-wide{grid-column:1/-1}.formula-consent{display:flex;align-items:flex-start;gap:10px;margin:24px 0;font-size:14px;line-height:1.7}.formula-consent input{flex-shrink:0;margin-top:5px}.column-calculation table{font-variant-numeric:tabular-nums}
@media(max-width:760px){.formula-fields{grid-template-columns:1fr}.formula-fields label{font-size:16px}.formula-consent{font-size:16px}.column-calculation>summary{font-size:18px!important}}
</style>
