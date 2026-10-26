<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAiBudget, getAiDailyCosts } from '@/api/admin'
import { userSessionGeneration } from '@/api/http'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { createAdminEditorScope } from '@/utils/adminEditorScope'
import { isBudgetOverview } from '@/utils/aiBudget'
import { budgetExportRange, dailyCostsCsv } from '@/utils/budgetExport'

const budget = ref(null)
const pending = ref(false)
const error = ref('')
const exportPending = ref(false)
const exportNotice = ref('')
const exportFrom = ref('')
const exportThrough = ref('')
const auth = useAdminAuthStore()
const owner = computed(() => auth.isLoggedIn && auth.user?.schoolId
  ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const scope = createAdminEditorScope(() => owner.value, () => ({ from: exportFrom.value, through: exportThrough.value }))
let disposed = false
function clearPrivateBudget() {
  budget.value = null; pending.value = false; error.value = ''
  exportPending.value = false; exportNotice.value = ''; exportFrom.value = ''; exportThrough.value = ''
}
watch(owner, () => { scope.invalidate(); clearPrivateBudget() }, { flush: 'sync' })
watch(() => ({ from: exportFrom.value, through: exportThrough.value }), scope.invalidateDraft, { flush: 'sync' })
onBeforeUnmount(() => { disposed = true; scope.dispose(); clearPrivateBudget() })
const money = (value) => value == null ? '未提供' : `¥${Number(value).toFixed(4)}`
const count = (value) => Number(value || 0).toLocaleString('zh-CN')
const percent = (item) => Math.min(100, Math.max(0, Number(item.occupiedCny) / Number(item.limitCny) * 100))

async function refresh() {
  if (disposed || !owner.value || pending.value || exportPending.value) return
  const ticket = scope.capture({ abortable: true })
  pending.value = true
  error.value = ''
  try {
    const result = await getAiBudget({ signal: ticket.signal })
    if (!ticket.current()) return
    if (!isBudgetOverview(result)) throw new Error('Incomplete budget response')
    budget.value = result
    if (!exportFrom.value) exportFrom.value = result.month.from
    if (!exportThrough.value) exportThrough.value = result.date
  }
  catch (failure) {
    if (!ticket.current()) return
    budget.value = null
    error.value = failure.response?.status === 403
      ? '全站预算仅向指定的成本管理员开放，本校用量仍可在下方查看'
      : '暂时无法读取预算，不能据此判断余额，请重试'
  } finally { if (ticket.current()) pending.value = false; ticket.release() }
}
async function exportCosts() {
  if (disposed || !owner.value || !budget.value || exportPending.value || pending.value) return
  exportNotice.value = ''
  let range
  try { range = budgetExportRange(exportFrom.value, exportThrough.value, budget.value.date) }
  catch (failure) { exportNotice.value = failure.message; return }
  const ticket = scope.capture({ abortable: true })
  exportPending.value = true
  try {
    const rows = await getAiDailyCosts(range.from, range.until, { signal: ticket.signal })
    if (!ticket.unchanged()) return
    const content = dailyCostsCsv(rows)
    if (!rows.length) { exportNotice.value = '所选日期没有记录，未生成空账单'; return }
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url
    link.download = `campthink-estimated-cost-${range.from}-${range.through}.csv`
    try { link.click() } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
    exportNotice.value = '已导出北京时间口径的估算明细，不含聊天内容；仍需核对供应商原始账单'
  } catch { if (ticket.unchanged()) exportNotice.value = '导出失败，未生成账单，请检查权限和网络后重试' }
  finally { if (ticket.current()) exportPending.value = false; ticket.release() }
}
onMounted(refresh)
</script>

<template>
  <section class="budget-panel" aria-labelledby="budget-heading" :aria-busy="pending">
    <header>
      <div><h2 id="budget-heading">免费版预算</h2></div>
      <button type="button" :disabled="pending || exportPending || !owner" @click="refresh">{{ pending ? '正在读取…' : '刷新预算' }}</button>
    </header>
    <p v-if="!owner" role="status">管理员身份已变化，请重新核验账号后再查看预算</p>
    <p v-else-if="error" role="status">{{ error }}</p>
    <template v-else-if="budget">
      <p v-if="!budget.enabled" class="budget-warning">预算保护未启用，以下统计不能代表全部调用，正式环境不得关闭</p>
      <p class="budget-context">全站 · 北京时间 {{ budget.date }} · 每次重试和备用模型分别计入</p>
      <div class="budget-windows">
        <article v-for="[label, item] in [['今日', budget.today], ['本月', budget.month]]" :key="label">
          <h3>{{ label }}预算占用</h3>
          <p class="budget-amount">{{ money(item.occupiedCny) }} <small>/ {{ money(item.limitCny) }}</small></p>
          <progress :value="percent(item)" max="100" :aria-label="`${label}预算占用比例`" />
          <dl>
            <div><dt>已确认用量的估算费用</dt><dd>{{ money(item.estimatedCny) }}</dd></div>
            <div><dt>供应商请求</dt><dd>{{ count(item.attempts) }} 次</dd></div>
            <div><dt>待核对 / 其中失败</dt><dd>{{ count(item.unresolved) }} / {{ count(item.failed) }}</dd></div>
            <div><dt>已确认输入 / 输出 Token</dt><dd>{{ count(item.inputTokens) }} / {{ count(item.outputTokens) }}</dd></div>
          </dl>
          <p v-if="item.unresolved > 0" class="budget-warning">待核对请求保留预占金额，不代表实际收费，须与供应商账单核对</p>
          <p v-else-if="item.attempts === 0" class="budget-context">尚无记账记录，不包含功能启用前的历史调用</p>
        </article>
      </div>
      <form class="cost-export" @submit.prevent="exportCosts">
        <label>开始日期<input v-model="exportFrom" type="date" required :disabled="pending || exportPending" :max="budget.date" /></label>
        <label>结束日期（含当天）<input v-model="exportThrough" type="date" required :disabled="pending || exportPending" :min="exportFrom" :max="budget.date" /></label>
        <button type="submit" :disabled="pending || exportPending">{{ exportPending ? '正在导出…' : '导出对账明细' }}</button>
      </form>
      <p v-if="exportNotice" class="budget-context" role="status">{{ exportNotice }}</p>
      <p class="budget-footnote">费用按请求发起时的配置单价估算，包含重试与备用模型，不是供应商账单。预算占用包括正在生成、失败及用量未知的请求；达到预算后停止新模型调用，不影响本地项目工具。服务器、邮件、搜索等费用不在此表内</p>
    </template>
    <p v-else role="status">正在加载预算记录</p>
  </section>
</template>

<style scoped>
.budget-panel { grid-column: 1 / -1; background: #fffefa; border: 1px solid #dfe3d7; border-radius: 24px; padding: clamp(18px, 3vw, 30px); color: #25312e; }
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
header p { margin: 0 0 8px; color: #69756a; font-size: 11px; letter-spacing: .13em; }
h2 { font-size: 24px; margin: 0; } h3 { font-size: 15px; margin: 0; font-weight: 500; }
button { min-height: 42px; padding: 8px 17px; border-radius: 22px; border: 1px solid #cdd6c7; background: #f2f5ee; color: #304535; cursor: pointer; }
button:disabled { opacity: .55; cursor: wait; } button:focus-visible { outline: 2px solid #3348de; outline-offset: 3px; }
.budget-context, .budget-footnote { font-size: 13px; line-height: 1.7; color: #647163; }
.budget-windows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin: 24px 0; }
article { min-width: 0; padding: 20px; border: 1px solid #e1e5dd; border-radius: 18px; }
.budget-amount { font-size: clamp(24px, 2.4vw, 32px); font-variant-numeric: tabular-nums; margin: 14px 0; overflow-wrap: anywhere; }
.budget-amount small { font-size: 14px; color: #687567; }
progress { width: 100%; height: 8px; accent-color: #43583a; }
dl { margin: 20px 0 0; font-size: 13px; } dl div { display: flex; justify-content: space-between; gap: 16px; margin: 12px 0; } dt { color: #687567; } dd { margin: 0; font-variant-numeric: tabular-nums; text-align: right; }
.budget-warning { font-size: 13px; line-height: 1.7; color: #855425; }
.budget-footnote { border-top: 1px solid #e1e5dd; padding-top: 18px; margin-bottom: 0; }
.cost-export { display: flex; gap: 16px; flex-wrap: wrap; align-items: end; margin-block: 24px; }
.cost-export label { display: grid; gap: 8px; font-size: 14px; min-width: 0; }
.cost-export input { min-height: 42px; box-sizing: border-box; max-width: 100%; padding: 8px 12px; border: 1px solid #cdd6c7; border-radius: 14px; color: #304535; background: #fffefa; font: inherit; font-size: 16px; }
.cost-export input:focus-visible { outline: 2px solid #3348de; outline-offset: 3px; }
@media (max-width: 760px) { .budget-windows { grid-template-columns: 1fr; gap: 14px; } }
</style>
