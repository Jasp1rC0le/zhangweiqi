<script setup>
import { computed, nextTick, ref } from 'vue'
import ColumnCalculationPanel from './ColumnCalculationPanel.vue'
import { emptyDataSheet, parseCsv, inspectDataSheet, formatNumber, dataBoundary, DATA_CHECK_VERSION } from '@/utils/projectDataCheck'

const props = defineProps({ modelValue: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'import'])
const sheet = computed(() => props.modelValue || emptyDataSheet())
const parsed = computed(() => parseCsv(sheet.value.csv))
const report = ref(null), checkedInput = ref(''), selectedLine = ref(null), page = ref(0)
const snapshot = () => JSON.stringify(sheet.value)
const stale = computed(() => checkedInput.value !== snapshot())
const selectedRow = computed(() => report.value?.rows.find(row => row.line === selectedLine.value))
const issuePages = computed(() => Math.ceil((report.value?.issues.length || 0) / 20))
const visibleIssues = computed(() => report.value?.issues.slice(page.value * 20, (page.value + 1) * 20) || [])
function update(key, value) {
  const next = { ...sheet.value, [key]: value }
  if (['measuredColumn', 'referenceColumn', 'unit', 'csv'].includes(key)) next.sameUnitConfirmed = false
  if (key === 'csv' && next.calculation) next.calculation = {...next.calculation,confirmed:false}
  if (key === 'csv' && JSON.stringify(parseCsv(value).headers) !== JSON.stringify(parsed.value.headers)) {
    next.measuredColumn = -1; next.referenceColumn = -1
  }
  emit('update:modelValue', next)
}
function check() { report.value = inspectDataSheet(sheet.value); checkedInput.value = snapshot(); selectedLine.value = null; page.value = 0 }
async function locate(issue) {
  selectedLine.value = issue.line > 0 ? issue.line : null
  await nextTick()
  const id = issue.line > 0 ? 'data-row-detail' : issue.code === 'source' ? 'data-source' : issue.code === 'mapping' ? 'data-measured-column' : 'data-unit-confirmation'
  if (!issue.line && issue.code !== 'source') document.getElementById('data-check-settings').open = true
  const target = document.getElementById(id)
  target?.scrollIntoView({ block: 'center', behavior: 'auto' }); target?.focus({ preventScroll: true })
}
function example() {
  emit('update:modelValue', { ...emptyDataSheet(), source: '演示数据，非真实实验记录', csv: '试验编号,实测值,参考值\nA01,10.2,10\nA02,12,10\nA03,,10\nA02,12,10', measuredColumn: 1, referenceColumn: 2, unit: 'V', tolerancePercent: 5 })
}
</script>

<template>
  <section class="data-panel">
    <div class="section-heading"><div><h2>让数据，经得起复查</h2><p>经管报告检查表格质量，实验报告复算相对误差。保留原始记录，不自动改数据</p></div></div>
    <label class="text-label" for="data-source">数据来源与版本</label>
    <input id="data-source" :value="sheet.source" maxlength="300" placeholder="例如：本人采集的实验记录，9月23日第2版" @input="update('source', $event.target.value)" />
    <div class="data-input-heading"><label class="text-label" for="project-csv">CSV 原始数据</label><button v-if="!sheet.csv" @click="example">试用演示数据</button><button @click="emit('import')">导入 Excel / CSV</button></div>
    <textarea id="project-csv" :value="sheet.csv" rows="7" maxlength="50000" spellcheck="false" placeholder="第一行为表头，使用英文逗号分隔。保留空值，不要粘贴身份证、电话等无关信息。" @input="update('csv', $event.target.value)"></textarea>
    <p class="data-help">支持 UTF-8 CSV，最多5万字、2000条数据、30列。引号内可含逗号或换行；不执行 Excel 公式。保存版本后才上传私有项目。</p>
    <p v-if="sheet.csv && parsed.error" class="studio-warning" role="status">{{ parsed.error }}</p>
    <div v-else-if="parsed.headers.length" class="data-preview" tabindex="0" role="region" aria-label="CSV 前5条预览，可横向滚动">
      <table><caption>数据预览 · {{ parsed.rows.length }}条记录 / {{ parsed.headers.length }}列 · 前5条</caption><thead><tr><th scope="col">原始行</th><th v-for="(header, i) in parsed.headers" :key="i" scope="col">{{ i + 1 }} · {{ header || '空表头' }}</th></tr></thead><tbody><tr v-for="row in parsed.rows.slice(0, 5)" :key="row.line"><th scope="row">{{ row.line }}</th><td v-for="(cell, i) in row.cells" :key="i">{{ cell || '（空）' }}</td></tr></tbody></table>
    </div>
    <ColumnCalculationPanel :sheet="sheet" @update="update('calculation',$event)" />
    <details id="data-check-settings" class="data-settings" tabindex="-1">
      <summary>实验数据：相对误差复算（可选）</summary>
      <p class="data-help">|实测值 − 参考值| ÷ |参考值| × 100%。参考值为0时不计算；先统一单位，再确认列含义。</p>
      <div class="data-config-grid">
        <label>实测值列<select id="data-measured-column" :value="sheet.measuredColumn" @change="update('measuredColumn', Number($event.target.value))"><option :value="-1">不选择</option><option v-for="(header, i) in parsed.headers" :key="i" :value="i">{{ i + 1 }} · {{ header || '空表头' }}</option></select></label>
        <label>参考值列<select :value="sheet.referenceColumn" @change="update('referenceColumn', Number($event.target.value))"><option :value="-1">不选择</option><option v-for="(header, i) in parsed.headers" :key="i" :value="i">{{ i + 1 }} · {{ header || '空表头' }}</option></select></label>
        <label>两列共同单位<input :value="sheet.unit" maxlength="40" placeholder="例如 V、mm、无量纲" @input="update('unit', $event.target.value)" /></label>
        <label>你设定的误差阈值（%）<input :value="sheet.tolerancePercent" type="number" min="0" max="1000" step="any" @input="update('tolerancePercent', $event.target.value === '' ? '' : Number($event.target.value))" /></label>
      </div>
      <label class="archive-filter"><input id="data-unit-confirmation" :checked="sheet.sameUnitConfirmed" type="checkbox" @change="update('sameUnitConfirmed', $event.target.checked)" />我已核对两列含义、统一单位；阈值是我的检查设置</label>
    </details>
    <div class="data-run"><div><strong>规则检查 · 免费</strong><p>在浏览器本地计算，不调用模型、不消耗 Token</p></div><button class="primary" :disabled="!sheet.csv.trim()" @click="check">{{ report ? '重新检查数据' : '检查数据' }}</button></div>
    <p v-if="report && stale" class="studio-warning" role="status">数据或设置已经变化，以下结果已过期，请重新检查</p>
    <template v-if="report">
      <p v-if="report.error" class="studio-error" role="alert">{{ report.error }}</p>
      <template v-else>
        <div class="data-result-heading" role="status"><h3>{{ report.issueCount ? `${report.issueCount} 处需要核对` : '当前规则未发现问题' }}</h3><p>{{ report.rows.length }}条记录 · {{ report.comparisons.length }}条完成相对误差复算 · {{ DATA_CHECK_VERSION }}</p></div>
        <p v-if="report.issueCount > 200" class="studio-warning">结果过多，列出前200项。请先处理这些问题并重新检查，未列出不等于没有问题。</p>
        <ol class="review-issues"><li v-for="(issue, i) in visibleIssues" :key="`${page}-${i}`"><span>{{ issue.severity }}</span><div><strong>{{ issue.line ? `原始第 ${issue.line} 行` : '检查设置' }}{{ issue.column ? ` · ${issue.column}` : '' }}</strong><p>{{ issue.detail }}</p><p>{{ issue.suggestion }}</p></div><button :disabled="stale" @click="locate(issue)">{{ issue.line ? '查看原行' : '检查设置' }}</button></li></ol>
        <nav v-if="issuePages > 1" class="data-pagination" aria-label="检查结果分页"><button :disabled="page === 0" @click="page--">上一页</button><span>{{ page + 1 }} / {{ issuePages }}</span><button :disabled="page + 1 >= issuePages" @click="page++">下一页</button></nav>
        <div v-if="selectedLine !== null" id="data-row-detail" class="data-row-detail" tabindex="-1"><h3>原始第 {{ selectedLine }} 行 · {{ stale ? '检查时的旧快照' : '只读定位' }}</h3><dl><template v-for="(cell, i) in (selectedRow?.cells || report.headers)" :key="i"><dt>{{ i + 1 }} · {{ report.headers[i] || '空表头' }}</dt><dd>{{ cell || '（空）' }}</dd></template></dl><p>请在上方 CSV 原文中修正，再运行检查。原始行号包含表头和空白行。</p></div>
        <details v-if="report.summaries.length" class="data-details" open><summary>离散程度与误差汇总</summary><p class="data-help">中位数按排序后的中间值计算；样本标准差 s = √[Σ(x − 均值)² / (n − 1)]，n不足2时不计算。不自动删除异常值，不代表总体误差或显著性。</p><div class="data-preview" tabindex="0" role="region" aria-label="离散程度，可横向滚动"><table><thead><tr><th scope="col">数值列</th><th scope="col">有效 n</th><th scope="col">中位数</th><th scope="col">样本标准差 s</th></tr></thead><tbody><tr v-for="column in report.summaries" :key="column.column"><th scope="row">{{ column.header }}</th><td>{{ column.count }}</td><td>{{ formatNumber(column.median) }}</td><td>{{ column.sampleStdDev === null ? '不足2条，不计算' : formatNumber(column.sampleStdDev) }}</td></tr></tbody></table></div><template v-if="report.pairedSummary"><p class="data-help">以下仅统计完成相对误差复算的 {{ report.pairedSummary.count }} 对数据（共{{ report.rows.length }}行）；缺值、参考为0或格式异常的记录未计入。单位：{{ sheet.unit }}</p><ul class="data-calculations"><li>有符号平均差 Σ(实测 − 参考) / n = {{ formatNumber(report.pairedSummary.bias) }}</li><li>平均绝对误差 Σ|实测 − 参考| / n = {{ formatNumber(report.pairedSummary.mae) }}</li><li>均方根误差 √[Σ(实测 − 参考)² / n] = {{ formatNumber(report.pairedSummary.rmse) }}</li></ul></template></details>
        <details v-if="report.summaries.length" class="data-details"><summary>数值列汇总 · {{ report.summaries.length }}列</summary><p class="data-help">仅汇总完全可解析为纯数字的非空列，不自动判断编号是否适合求均值。缺失不补0，重复行仍计入；显示最多10位有效数字。</p><div class="data-preview" tabindex="0" role="region" aria-label="数值列汇总，可横向滚动"><table><thead><tr><th scope="col">列</th><th scope="col">有效 / 缺失</th><th scope="col">合计</th><th scope="col">均值</th><th scope="col">最小</th><th scope="col">最大</th></tr></thead><tbody><tr v-for="column in report.summaries" :key="column.column"><th scope="row">{{ column.column + 1 }} · {{ column.header }}</th><td>{{ column.count }} / {{ column.missing }}</td><td>{{ formatNumber(column.sum) }}</td><td>{{ formatNumber(column.mean) }}</td><td>{{ formatNumber(column.min) }}</td><td>{{ formatNumber(column.max) }}</td></tr></tbody></table></div></details>
        <details v-if="report.comparisons.length" class="data-details"><summary>复算过程 · {{ report.comparisons.length }}条</summary><p class="data-help">页面展示前20条，完整过程包含在项目 Markdown 导出中</p><ol class="data-calculations"><li v-for="row in report.comparisons.slice(0, 20)" :key="row.line">第{{ row.line }}行：|{{ row.measured }} − {{ row.reference }}| ÷ |{{ row.reference }}| × 100% = <strong>{{ formatNumber(row.relative) }}%</strong> · {{ row.exceeded ? '超出用户阈值' : '未超出用户阈值' }}</li></ol></details>
      </template>
    </template>
    <p class="studio-boundary">{{ dataBoundary }}。未发现问题不等于可以提交，实验结果不能作为设备或车辆操作依据。</p>
  </section>
</template>
