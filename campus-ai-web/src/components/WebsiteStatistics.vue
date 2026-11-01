<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'
import { getWebsiteStatistics } from '@/api/admin'
import { createLatestRequest } from '@/utils/latestRequest'
import { createWebsiteStatisticsReader, websiteGrowthBuckets } from '@/utils/websiteStatistics'

const props = defineProps({ owner: { type: String, required: true } })
defineEmits(['navigate'])
const days = ref(7), selected = ref(0), state = reactive({ loading: false, error: '', data: null })
const reader = createWebsiteStatisticsReader({ read: getWebsiteStatistics, owner: () => props.owner, days: () => days.value, state, requestFactory: createLatestRequest })
const data = computed(() => state.data)
const buckets = computed(() => data.value ? websiteGrowthBuckets(data.value.daily, days.value) : [])
const maxGrowth = computed(() => Math.max(1, ...buckets.value.map(row => row.newAccounts)))
const maxParticipation = computed(() => Math.max(1, ...(data.value?.features || []).map(row => row.participants)))
const currentBucket = computed(() => buckets.value[selected.value] || buckets.value.at(-1))
const metric = value => Number.isSafeInteger(value) ? value.toLocaleString('zh-CN') : '—'
const shortDate = value => value.slice(5).replace('-', '/')
const readTime = computed(() => data.value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' }).format(new Date(data.value.asOf)) : '')
watch([() => props.owner, days], () => { void reader.refresh() }, { immediate: true, flush: 'sync' })
watch(buckets, rows => { selected.value = Math.max(0, rows.length - 1) })
onBeforeUnmount(() => reader.dispose())
</script>

<template>
  <section v-if="owner" class="website-statistics" aria-labelledby="website-statistics-title" :aria-busy="state.loading">
    <header class="statistics-heading">
      <div><h2 id="website-statistics-title">网站数据</h2><p v-if="data">{{ shortDate(data.from) }}—{{ shortDate(data.to) }} · {{ readTime }} 读取</p></div>
      <div class="statistics-controls"><div class="statistics-period" role="group" aria-label="统计时间范围"><button v-for="period in [7, 30]" :key="period" type="button" :aria-pressed="days === period" @click="days = period">近{{ period }}天</button></div><button type="button" :disabled="state.loading" @click="reader.refresh">刷新</button></div>
    </header>
    <dl class="statistics-totals"><div><dt>正常账号</dt><dd>{{ metric(data?.totalAccounts) }}</dd></div><div><dt>窗口内新增</dt><dd>{{ metric(data?.newAccounts) }}</dd></div><div><dt>业务参与账号</dt><dd>{{ metric(data?.participatingAccounts) }}</dd></div></dl>
    <p v-if="state.error" class="statistics-error" role="alert">{{ state.error }} <button type="button" :disabled="state.loading" @click="reader.refresh">重试</button></p>
    <p v-else-if="state.loading" class="statistics-empty" role="status">正在读取统计…</p>
    <template v-if="data">
      <div class="statistics-charts">
        <section class="statistics-growth" aria-labelledby="statistics-growth-title"><header><h3 id="statistics-growth-title">新增账号走势</h3><span>{{ days === 30 ? '每7天汇总' : '每日' }}</span></header>
          <div class="statistics-growth-scroll"><div class="statistics-bars" :style="{ '--columns': buckets.length }"><button v-for="(row, index) in buckets" :key="row.from" type="button" :aria-pressed="selected === index" :aria-label="`${row.from}至${row.to}，新增${row.newAccounts}个账号`" @click="selected = index" @focus="selected = index"><strong>{{ metric(row.newAccounts) }}</strong><span class="statistics-bar-track" aria-hidden="true"><i :style="{ height: `${row.newAccounts / maxGrowth * 100}%` }"></i></span><small>{{ shortDate(row.from) }}<span v-if="row.from !== row.to">—{{ shortDate(row.to) }}</span></small></button></div></div>
          <p v-if="currentBucket" class="statistics-selection" role="status">{{ shortDate(currentBucket.from) }}<template v-if="currentBucket.from !== currentBucket.to">—{{ shortDate(currentBucket.to) }}</template> · 新增 {{ metric(currentBucket.newAccounts) }} 个账号</p>
        </section>
        <section class="statistics-features" aria-labelledby="statistics-features-title"><header><h3 id="statistics-features-title">功能参与</h3><span>账号</span></header>
          <RouterLink v-for="feature in data.features" :key="feature.code" :to="feature.path" class="statistics-feature" :aria-label="`打开${feature.label}，本期${feature.participants}个参与账号`"><span>{{ feature.label }}</span><strong>{{ metric(feature.participants) }}</strong><ArrowRight aria-hidden="true" /><i class="statistics-feature-track" aria-hidden="true"><b :style="{ width: `${feature.participants / maxParticipation * 100}%` }"></b></i></RouterLink>
        </section>
      </div>
      <div class="statistics-signals" aria-label="改进线索"><span>改进线索</span><button type="button" @click="$emit('navigate', 'feedback')">待跟进 AI 反馈 <strong>{{ metric(data.unhelpfulFeedback) }}</strong><ArrowRight aria-hidden="true" /></button><button type="button" @click="$emit('navigate', 'contact')">待处理意见 <strong>{{ metric(data.openContacts) }}</strong><ArrowRight aria-hidden="true" /></button></div>
      <details class="statistics-definition"><summary>统计口径</summary><p>按本校当前正常账号及保留的业务记录汇总。同一账号可参与多个功能，修改不按点击次数累计；页面浏览和未保存操作暂不统计。今天为截至读取时刻的数据。</p><p>问答按回答用量与反馈记录；食堂按评分、短评和点赞；课表按导入记录；校园墙按提交与点赞；项目按最近保存。保留的问答用量仍计入统计，意见按本校保留提交核对。</p><p>参与较少不直接代表功能不好用，可结合反馈决定更新重点。</p></details>
    </template>
  </section>
</template>

<style scoped>
.website-statistics{min-width:0;margin:0 0 32px;color:var(--assistant-ink,#29323c)}
.statistics-heading,.statistics-controls,.statistics-period,.statistics-charts header{display:flex;align-items:center;justify-content:space-between;gap:12px}.statistics-heading{flex-wrap:wrap}.statistics-heading h2{margin:0;font-size:21px;font-weight:550;letter-spacing:-.025em}.statistics-heading p{margin:7px 0 0;color:var(--assistant-muted,#5d6876);font-size:12px}.statistics-controls{gap:8px}.website-statistics button{font:inherit;cursor:pointer;min-height:44px;border:0;color:var(--assistant-accent,#0b62db);background:transparent;transition:background-color 160ms ease,color 160ms ease}.statistics-controls>button{padding:8px 12px}.statistics-period{gap:0;background:var(--assistant-hover,#edf1f6);padding:3px;border-radius:12px}.statistics-period button{padding:8px 12px;border-radius:9px;color:var(--assistant-muted,#5d6876);font-size:13px}.statistics-period button[aria-pressed=true]{background:#fff;color:var(--assistant-accent,#0b62db)}.website-statistics button:disabled{opacity:.55;cursor:not-allowed}.website-statistics :is(button,a,summary):focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}
.statistics-totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:24px 0 28px}.statistics-totals>div{min-width:0}.statistics-totals dt{color:var(--assistant-muted,#5d6876);font-size:13px;line-height:1.5}.statistics-totals dd{margin:9px 0 0;font-size:clamp(20px,3vw,30px);font-weight:500;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.statistics-charts{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:32px}.statistics-charts>section{min-width:0}.statistics-charts header{margin-bottom:14px}.statistics-charts h3{margin:0;font-size:15px;font-weight:500}.statistics-charts header>span{font-size:12px;color:var(--assistant-muted,#5d6876)}
.statistics-growth-scroll{max-width:100%;overflow-x:auto;scrollbar-color:#b7c9de transparent}.statistics-bars{display:grid;grid-template-columns:repeat(var(--columns),minmax(44px,1fr));gap:4px;min-width:calc(var(--columns)*44px + (var(--columns) - 1)*4px)}.statistics-bars button{display:grid;grid-template-rows:23px 74px minmax(30px,auto);align-items:end;gap:6px;min-width:0;padding:7px 4px;border-radius:8px;color:var(--assistant-muted,#5d6876);font-size:11px}.statistics-bars button[aria-pressed=true],.statistics-bars button:hover{background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent,#0b62db)}.statistics-bars strong{font-weight:500;font-size:13px;font-variant-numeric:tabular-nums}.statistics-bar-track{display:flex;align-items:end;height:74px;width:100%;border-bottom:1px solid var(--assistant-line,#e2e7ec)}.statistics-bar-track i{display:block;width:100%;background:#9abbe6;border-radius:3px 3px 0 0;transition:background-color 160ms ease}.statistics-bars button[aria-pressed=true] .statistics-bar-track i{background:var(--assistant-accent,#0b62db)}.statistics-bars small{align-self:start;font-size:10px;line-height:1.5}.statistics-bars small>span{display:block}.statistics-selection{min-height:20px;margin:14px 0 0;font-size:12px;color:var(--assistant-muted,#5d6876);font-variant-numeric:tabular-nums}
.statistics-feature{display:grid;grid-template-columns:minmax(0,1fr) auto 15px;align-items:center;gap:7px 10px;min-height:44px;padding:7px 0;color:inherit;text-decoration:none;font-size:13px}.statistics-feature strong{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums}.statistics-feature>svg{width:15px;height:15px;color:var(--assistant-muted,#5d6876)}.statistics-feature-track{grid-column:1/3;display:block;height:5px;background:var(--assistant-hover,#edf1f6);border-radius:3px;overflow:hidden}.statistics-feature-track b{display:block;height:100%;background:var(--assistant-accent,#0b62db);border-radius:inherit}.statistics-feature:hover{color:var(--assistant-accent,#0b62db)}
.statistics-signals{display:flex;align-items:center;flex-wrap:wrap;gap:6px 18px;margin-top:22px;padding-top:14px;border-top:1px solid var(--assistant-line,#e2e7ec);font-size:13px}.statistics-signals>span{color:var(--assistant-muted,#5d6876)}.statistics-signals button{display:inline-flex;align-items:center;gap:8px;padding:8px 0;font-size:13px}.statistics-signals strong{font-weight:500;font-variant-numeric:tabular-nums}.statistics-signals svg{width:14px;height:14px}.statistics-definition{font-size:12px;line-height:1.7;color:var(--assistant-muted,#5d6876);margin-top:12px}.statistics-definition summary{cursor:pointer;min-height:44px;align-content:center}.statistics-definition p{margin:4px 0 10px;max-width:68ch}.statistics-error{font-size:13px;color:var(--assistant-danger,#bf303d)}.statistics-error button{padding:8px 12px}.statistics-empty{font-size:13px;color:var(--assistant-muted,#5d6876);padding:18px 0}
@media(max-width:760px){.statistics-charts{grid-template-columns:minmax(0,1fr);gap:24px}.statistics-heading h2{font-size:19px}.statistics-totals{margin-top:20px;gap:10px}.statistics-controls{gap:4px}.statistics-period button{padding:8px 10px}}
@media(prefers-reduced-motion:reduce){.website-statistics button,.statistics-bar-track i{transition:none}}
</style>
