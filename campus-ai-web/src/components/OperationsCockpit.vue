<script setup>
import { computed } from 'vue'
import { cockpitComparison, cockpitCount } from '@/utils/cockpit'
const props = defineProps({
  overview: { type: Object, required: true }, actions: { type: Array, required: true },
  usage: { type: Array, default: () => [] }, usageUnavailable: Boolean,
  failedDetailsAvailable: Boolean,
})
defineEmits(['navigate'])
const tasks = computed(() => cockpitComparison(props.actions))
const providers = computed(() => cockpitComparison(props.usage, 'requestCount'))
const missingTasks = computed(() => tasks.value.some(item => item.barPercent === null))
const pendingCategories = computed(() => tasks.value.filter(item => item.count > 0 && item.barPercent !== null).length)
const providerName = provider => ({ deepseek: 'DeepSeek', kimi: 'Kimi', glm: 'GLM' })[provider] || provider || '服务商未知'
</script>

<template>
  <div class="operations-cockpit">
    <div class="operations-columns">
      <section class="operations-queue" aria-label="运营待处理事项">
        <header><h2>待处理事项</h2><span v-if="pendingCategories">{{ pendingCategories }} 类待办</span></header>
        <p class="operations-caption" :class="{ 'operation-warning': missingTasks }">{{ missingTasks ? '部分数量未返回，请刷新核对。' : pendingCategories ? '按数量排列，点击一行进入处理。' : '当前没有待处理事项，仍可进入各模块查看。' }}</p>
        <button v-for="item in tasks" :key="item.tab" type="button" class="operation-task" @click="$emit('navigate', item.tab)">
          <span class="task-label"><b>{{ item.label }}</b><small>{{ item.hint }}</small></span>
          <strong :class="{ 'has-pending': item.count > 0 }">{{ cockpitCount(item.count) }} <small v-if="item.barPercent !== null">项</small></strong>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
          <span v-if="item.barPercent !== null" class="task-track" aria-hidden="true"><i :style="{ width: `${item.barPercent}%` }"></i></span>
        </button>
      </section>
      <div class="operations-context">
        <section aria-label="本校资料与索引队列">
          <header><h2>资料与索引</h2></header>
          <dl class="operations-facts">
            <div><dt>可检索资料</dt><dd>{{ cockpitCount(overview.searchableDocuments) }} <small>份</small></dd><p>已发布且在有效期内</p></div>
            <div><dt>索引队列</dt><dd>{{ cockpitCount(overview.pendingBackgroundJobs) }} <small>项待处理</small></dd><p :class="{ 'operation-warning': overview.failedBackgroundJobs > 0 }">失败 {{ cockpitCount(overview.failedBackgroundJobs) }} 项<span v-if="overview.failedBackgroundJobs > 0">{{ failedDetailsAvailable ? ' · 在下方核对' : ' · 明细暂不可用，请刷新核对' }}</span></p></div>
          </dl>
        </section>
        <section class="operations-usage" aria-label="最近24小时模型使用">
        <header><h2>模型使用</h2><button type="button" @click="$emit('navigate', 'usage')">查看明细</button></header>
        <dl class="usage-totals">
          <div><dt>已保存回答</dt><dd>{{ cockpitCount(overview.recentModelCalls) }} <small>次</small></dd></div>
          <div><dt>服务商返回 Token</dt><dd>{{ cockpitCount(overview.recentModelTokens) }}</dd></div>
        </dl>
        <p class="operations-caption">最近24小时 · 不含失败与重试；未返回的用量不估算为零。</p>
        <p v-if="usageUnavailable" class="operations-empty" role="status">模型明细读取失败，可刷新重试；上方统计来自独立汇总。</p>
        <p v-else-if="!usage.length" class="operations-empty">本次读取暂无模型明细。</p>
        <ul v-else class="provider-list">
          <li v-for="item in providers" :key="`${item.provider}-${item.model}`">
            <div><span>{{ providerName(item.provider) }} · {{ item.model || '模型未知' }}</span><strong>{{ cockpitCount(item.requestCount) }} 次</strong></div>
            <span v-if="item.barPercent !== null" class="provider-track" aria-hidden="true"><i :style="{ width: `${item.barPercent}%` }"></i></span>
          </li>
        </ul>
        <p v-if="!usageUnavailable && providers.length" class="comparison-note">条形按已保存回答次数比较，不代表费用占比。</p>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.operations-cockpit { color: var(--assistant-ink, #29323c); }
.operations-facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin: 18px 0 0; }
.operations-facts > div { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 6px 16px; min-width: 0; }
.operations-facts dt { font-size: 15px; font-weight: 500; }
.operations-facts dd { margin: 0; font-size: 22px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.operations-facts small, .usage-totals small { font-size: 13px; font-weight: 400; }
.operations-facts p { grid-column: 1 / -1; margin: 0; color: var(--assistant-muted, #5d6876); font-size: 13px; }
.operations-facts .operation-warning, .operations-caption.operation-warning { color: var(--assistant-danger, #bf303d); }
.operations-columns { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 40px; padding-top: 24px; border-top: 1px solid var(--assistant-line, #e2e7ec); }
.operations-context { min-width: 0; }
.operations-columns section { min-width: 0; }
.operations-columns header { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.operations-columns h2 { margin: 0; font-size: 18px; font-weight: 500; letter-spacing: -.025em; }
.operations-columns header > span { color: var(--assistant-muted, #5d6876); font-size: 12px; }
.operations-cockpit button { font: inherit; cursor: pointer; }
.operation-task { display: grid; grid-template-columns: minmax(0, 1fr) auto 18px; align-items: center; gap: 12px 16px; width: 100%; min-height: 90px; padding: 16px 8px; text-align: left; border: 0; border-bottom: 1px solid var(--assistant-line, #e2e7ec); background: transparent; color: inherit; border-radius: 0; transition: background-color 150ms ease-out; }
.operation-task:hover { background: var(--assistant-soft, #eaf2ff); }
.operation-task b { display: block; font-weight: 500; font-size: 15px; }
.task-label small { display: block; color: var(--assistant-muted, #5d6876); font-size: 13px; line-height: 1.6; margin-top: 3px; }
.operation-task strong small { color: var(--assistant-muted, #5d6876); font-size: 12px; font-weight: 400; }
.task-track { grid-column: 1 / 3; height: 5px; border-radius: 3px; background: var(--assistant-hover, #e8edf2); overflow: hidden; }
.task-track i { display: block; height: 100%; border-radius: inherit; background: var(--assistant-accent, #0b62db); }
.operation-task strong { font-weight: 500; font-size: 19px; font-variant-numeric: tabular-nums; }
.operation-task .has-pending { color: var(--assistant-accent, #0b62db); }
.operation-task svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; color: var(--assistant-muted, #5d6876); }
.operations-usage header button { min-height: 44px; padding: 8px 0; background: transparent; border: 0; color: var(--assistant-accent, #0b62db); font-size: 14px; }
.operations-usage { border-top: 1px solid var(--assistant-line, #e2e7ec); padding-top: 20px; margin-top: 24px; }
.usage-totals { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 19px 0 12px; }
.usage-totals dt { color: var(--assistant-muted, #5d6876); font-size: 13px; }
.usage-totals dd { margin: 8px 0 0; font-size: 23px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.operations-caption, .operations-empty { font-size: 12px; color: var(--assistant-muted, #5d6876); line-height: 1.7; margin: 0; }
.operations-empty { margin-top: 28px; font-size: 14px; }
.comparison-note { margin: 16px 0 0; color: var(--assistant-muted, #5d6876); font-size: 12px; line-height: 1.7; }
.provider-list { list-style: none; margin: 26px 0 0; padding: 0; }
.provider-list li + li { margin-top: 18px; }
.provider-list li > div { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; margin-bottom: 8px; }
.provider-list li span { overflow-wrap: anywhere; min-width: 0; }
.provider-list strong { font-weight: 500; white-space: nowrap; font-variant-numeric: tabular-nums; }
.provider-track { display: block; height: 5px; border-radius: 3px; background: var(--assistant-hover, #edf1f6); overflow: hidden; }
.provider-track i { display: block; height: 100%; background: var(--assistant-accent, #0b62db); border-radius: inherit; }
.operations-cockpit button:focus-visible { outline: 2px solid var(--assistant-accent, #0b62db); outline-offset: 3px; }
@media (max-width: 900px) { .operations-columns { grid-template-columns: minmax(0, 1fr); gap: 32px; } }
@media (max-width: 520px) { .operations-facts { grid-template-columns: minmax(0, 1fr); gap: 22px; } .operations-facts dd { font-size: 24px; } .operations-columns header > span { font-size: 12px; } }
@media (prefers-reduced-motion: reduce) { .operation-task { transition: none; } }
</style>
