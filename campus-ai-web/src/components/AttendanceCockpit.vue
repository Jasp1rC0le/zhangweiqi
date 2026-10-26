<script setup>
import { computed } from 'vue'
import { attendanceDistribution, cockpitCount, distributionPercent } from '@/utils/cockpit'
import AttendanceDistribution from './AttendanceDistribution.vue'
import AttendanceSummaryCopy from './AttendanceSummaryCopy.vue'
const props = defineProps({
  counts: { type: Object, required: true }, planned: { type: Number, default: undefined },
  absentStudents: { type: Number, default: undefined },
  from: { type: String, default: '' }, to: { type: String, default: '' },
  stale: Boolean,
  summaryContext: { type: Object, default: null },
})
const distribution = computed(() => attendanceDistribution(props.counts))
const reviewCount = computed(() => distribution.value ? props.counts.absent + props.counts.earlyLeave : null)
const recordedShare = computed(() => distribution.value?.total ? distribution.value.recorded / distribution.value.total * 100 : 0)
</script>

<template>
  <section class="attendance-cockpit" aria-label="授权范围考勤概览">
    <header class="cockpit-heading">
      <h2>考勤概览</h2>
      <span>{{ from }} — {{ to }}<b v-if="stale">上次数据</b></span>
    </header>
    <template v-if="distribution">
      <AttendanceSummaryCopy v-if="summaryContext" :context="summaryContext" :counts="counts" :planned="planned" :absent-students="absentStudents" :from="from" :to="to" :disabled="stale" />
      <section class="cockpit-attention" :class="{ 'needs-review': reviewCount > 0 }" aria-label="考勤核对重点">
        <div>
          <h3 v-if="reviewCount > 0">优先核对 {{ cockpitCount(reviewCount) }} 人次旷课或早退</h3>
          <h3 v-else-if="!distribution.total">当前范围暂无考勤记录</h3>
          <h3 v-else-if="counts.unknown">还有 {{ cockpitCount(counts.unknown) }} 人次待点名</h3>
          <h3 v-else>已读取记录中，无旷课或早退</h3>
          <p v-if="reviewCount > 0">旷课 {{ cockpitCount(counts.absent) }} 人次 · 早退 {{ cockpitCount(counts.earlyLeave) }} 人次</p>
          <p v-else-if="!distribution.total">调整日期或班级，核对是否已配置课程。</p>
          <p v-else-if="counts.unknown">可能尚未上课或未填写，不代表缺勤。</p>
          <p v-else>仅反映当前筛选范围内已读取的记录。</p>
        </div>
        <div v-if="$slots.action" class="cockpit-action"><slot name="action" /></div>
      </section>
      <div class="cockpit-body">
        <section class="cockpit-distribution" aria-label="考勤人次分布">
          <h3>人次分布</h3>
          <AttendanceDistribution :counts="counts" />
        </section>
        <section class="cockpit-registration" aria-label="点名登记进度">
          <h3>登记进度</h3>
          <p class="registration-count"><strong>{{ cockpitCount(distribution.recorded) }}</strong><span>/ {{ cockpitCount(distribution.total) }} 人次已填写</span></p>
          <div v-if="distribution.total" class="registration-track" role="progressbar" aria-label="已填写考勤人次"
            :aria-valuenow="distribution.recorded" :aria-valuemin="0" :aria-valuemax="distribution.total"
            :aria-valuetext="`${cockpitCount(distribution.recorded)} / ${cockpitCount(distribution.total)} 人次已填写，${distributionPercent(recordedShare)}，不是出勤率`">
            <span :style="{ width: `${recordedShare}%` }"></span>
          </div>
          <p class="registration-pending">待点名 <strong>{{ cockpitCount(counts.unknown) }}</strong> 人次<span>未上课或未填写，不计入旷课。</span></p>
          <dl class="cockpit-facts">
            <div><dt>涉及旷课学生</dt><dd>{{ cockpitCount(absentStudents) }} <small>人 · 去重</small></dd></div>
            <div><dt>已配置安排</dt><dd>{{ cockpitCount(planned) }} <small>项</small></dd></div>
          </dl>
          <p class="cockpit-readonly">只读核对；记录更正由任课教师完成。</p>
        </section>
      </div>
      <details class="cockpit-definition"><summary>统计口径</summary><p>当前授权筛选范围的完整汇总，不是当前页小计。人数去重，人次按每节记录累计；已取消课程不计入。登记进度仅表示已填写记录的占比，不是出勤率。待点名可能包含尚未上课的安排。</p></details>
    </template>
    <p v-else class="cockpit-incomplete" role="status">考勤统计不完整，请重新读取；未将缺失值显示为零。</p>
  </section>
</template>

<style scoped>
.attendance-cockpit { margin-block: 24px 30px; color: var(--assistant-ink, #29323c); }
.cockpit-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px 20px; flex-wrap: wrap; }
.cockpit-heading h2 { margin: 0; font-size: 22px; font-weight: 500; letter-spacing: -.025em; }
.cockpit-heading > span { color: var(--assistant-muted, #5d6876); font-size: 13px; font-variant-numeric: tabular-nums; }
.cockpit-heading b { display: inline-block; margin-left: 12px; color: var(--assistant-warning, #9a5400); font-weight: 500; }
.cockpit-attention { display: flex; align-items: center; justify-content: space-between; gap: 16px 24px; margin-top: 18px; padding: 18px 20px; border-radius: 12px; background: var(--assistant-panel, #f2f5fa); }
.cockpit-attention.needs-review { background: var(--assistant-danger-soft, #fff0f1); }
.cockpit-attention h3 { font-size: 16px; font-weight: 500; margin: 0; line-height: 1.6; }
.cockpit-attention.needs-review h3, .cockpit-attention.needs-review p { color: var(--assistant-danger, #bf303d); }
.cockpit-attention p { margin: 4px 0 0; color: var(--assistant-muted, #5d6876); font-size: 13px; line-height: 1.6; }
.cockpit-action { flex-shrink: 0; }
.cockpit-action :deep(a), .cockpit-action :deep(button) { display: inline-flex; align-items: center; min-height: 44px; padding: 8px 14px; border: 1px solid currentColor; border-radius: 10px; background: transparent; color: var(--assistant-accent, #0b62db); font: inherit; font-size: 14px; text-decoration: none; cursor: pointer; }
.cockpit-action :deep(a:hover), .cockpit-action :deep(button:hover:not(:disabled)) { background: var(--assistant-surface, #fff); }
.cockpit-action :deep(button:disabled) { opacity: .55; cursor: default; }
.cockpit-action :deep(a:focus-visible), .cockpit-action :deep(button:focus-visible), .cockpit-definition summary:focus-visible { outline: 2px solid var(--assistant-accent, #0b62db); outline-offset: 3px; }
.cockpit-body { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(230px, 1fr); gap: 40px; margin-top: 26px; }
.cockpit-body h3 { font-size: 15px; font-weight: 500; margin: 0; }
.cockpit-registration { min-width: 0; }
.registration-count { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; margin: 16px 0 12px; font-variant-numeric: tabular-nums; }
.registration-count strong { font-size: 24px; font-weight: 500; }
.registration-count > span { font-size: 13px; color: var(--assistant-muted, #5d6876); }
.registration-track { height: 6px; border-radius: 3px; background: var(--assistant-line, #e2e7ec); overflow: hidden; }
.registration-track > span { display: block; height: 100%; background: var(--assistant-accent, #0b62db); border-radius: inherit; }
.registration-pending { font-size: 13px; margin: 12px 0 20px; }
.registration-pending strong { font-weight: 500; font-variant-numeric: tabular-nums; }
.registration-pending > span { display: block; margin-top: 3px; color: var(--assistant-muted, #5d6876); font-size: 12px; }
.cockpit-facts { margin: 0; padding-top: 12px; border-top: 1px solid var(--assistant-line, #e2e7ec); }
.cockpit-facts > div { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-block: 6px; font-size: 13px; }
.cockpit-facts dt { color: var(--assistant-muted, #5d6876); }
.cockpit-facts dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }
.cockpit-facts small { font-size: 12px; color: var(--assistant-muted, #5d6876); font-weight: 400; }
.cockpit-readonly { margin: 12px 0 0; color: var(--assistant-muted, #5d6876); font-size: 12px; line-height: 1.7; }
.cockpit-definition { margin-top: 18px; border-top: 1px solid var(--assistant-line, #e2e7ec); color: var(--assistant-muted, #5d6876); font-size: 12px; }
.cockpit-definition summary { width: fit-content; min-height: 44px; align-content: center; cursor: pointer; }
.cockpit-definition p { max-width: 70ch; margin: 0 0 8px; line-height: 1.8; }
.cockpit-incomplete { padding-block: 20px; font-size: 14px; line-height: 1.7; }
@media (max-width: 1100px) { .cockpit-body { grid-template-columns: minmax(0, 1fr); gap: 28px; } }
@media (max-width: 600px) {
  .cockpit-attention { align-items: flex-start; flex-direction: column; padding: 16px; gap: 12px; }
  .cockpit-heading > span { font-size: 12px; }
  .cockpit-body { margin-top: 22px; gap: 24px; }
  .cockpit-definition { font-size: 13px; }
}
</style>
