<script setup>
import { computed, ref, watch } from 'vue'
import { attendanceChart, cockpitCount, distributionPercent } from '@/utils/cockpit'
const props = defineProps({ counts: { type: Object, required: true } })
const model = computed(() => attendanceChart(props.counts))
const selected = ref(null)
const active = computed(() => model.value?.rows.find(row => row.key === selected.value))
watch(() => props.counts, () => { selected.value = null })
</script>

<template>
  <figure v-if="model" class="attendance-chart" aria-label="当前授权范围考勤人次占比，不是出勤率">
    <div class="attendance-donut">
      <svg viewBox="0 0 144 144" aria-hidden="true">
        <circle v-if="!model.total" cx="72" cy="72" r="56" class="donut-empty" />
        <circle v-for="segment in model.segments" :key="segment.key" cx="72" cy="72" r="56" pathLength="100" fill="none" stroke-width="15"
          :stroke-dasharray="`${segment.share} ${100 - segment.share}`" :stroke-dashoffset="-segment.offset"
          transform="rotate(-90 72 72)" :data-key="segment.key" :class="{ 'donut-dimmed': selected && selected !== segment.key }" />
      </svg>
      <output class="donut-label" aria-live="polite">
        <template v-if="model.total"><strong v-if="active || model.total < 100000">{{ active ? distributionPercent(active.share) : cockpitCount(model.total) }}</strong><span>{{ active ? active.label : model.total < 100000 ? '总人次' : '全部记录' }}</span></template>
        <span v-else>暂无记录</span>
      </output>
    </div>
    <ul class="attendance-legend">
      <li v-for="row in model.rows" :key="row.key">
        <button type="button" :data-key="row.key" :aria-pressed="selected === row.key" :disabled="!model.total"
          :aria-label="`突出${row.label}：${cockpitCount(row.count)}人次，${model.total ? `占${distributionPercent(row.share)}` : '暂无占比'}`"
          @click="selected = selected === row.key ? null : row.key">
          <span class="legend-name"><i aria-hidden="true"></i>{{ row.label }}</span><strong>{{ cockpitCount(row.count) }} <span>人次</span></strong><small>{{ model.total ? distributionPercent(row.share) : '暂无占比' }}</small>
          <span v-if="model.total" class="legend-track" aria-hidden="true"><span :style="{ width: `${row.share}%` }"></span></span>
        </button>
      </li>
    </ul>
    <figcaption><span v-if="model.total >= 100000">共 {{ cockpitCount(model.total) }} 人次。</span>人次占比 · 非出勤率</figcaption>
  </figure>
</template>

<style scoped>
.attendance-chart { margin: 16px 0 0; display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: center; gap: 16px 24px; }
.attendance-donut { width: 160px; height: 160px; position: relative; }
.attendance-donut svg { display: block; width: 100%; height: 100%; overflow: visible; }
.attendance-donut circle { stroke: var(--slice-color, #8997a8); transition: opacity 140ms ease-out; }
.attendance-donut circle.donut-empty { fill: none; stroke: var(--assistant-line, #e2e7ec); stroke-width: 2; stroke-dasharray: 3 5; }
.attendance-donut .donut-dimmed { opacity: .22; }
[data-key='onTime'] { --slice-color: #2c9972; }
[data-key='absent'] { --slice-color: #d56676; }
[data-key='earlyLeave'] { --slice-color: #d78634; }
[data-key='unknown'] { --slice-color: #e2b85c; }
[data-key='late'] { --slice-color: #477bbb; }
[data-key='excused'] { --slice-color: #8d74bd; }
.donut-label { position: absolute; inset: 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--assistant-muted, #5d6876); font-size: 13px; text-align: center; pointer-events: none; }
.donut-label strong { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--assistant-ink, #29323c); letter-spacing: -.02em; }
.attendance-legend { list-style: none; padding: 0; margin: 0; min-width: 0; }
.attendance-legend button { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 7px 10px; align-items: center; width: 100%; min-height: 52px; padding: 8px; border: 0; border-radius: 8px; color: var(--assistant-ink, #29323c); background: transparent; text-align: left; font: inherit; font-size: 13px; cursor: pointer; }
.legend-name { display: flex; align-items: center; gap: 6px; }
.attendance-legend i { width: 7px; height: 7px; border-radius: 2px; background: var(--slice-color, #8997a8); }
.attendance-legend strong { font-weight: 500; font-variant-numeric: tabular-nums; }
.attendance-legend strong > span { font-size: 11px; font-weight: 400; color: var(--assistant-muted, #5d6876); }
.legend-track { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: var(--assistant-hover, #e8edf2); overflow: hidden; }
.legend-track > span { display: block; height: 100%; border-radius: inherit; background: var(--slice-color, #8997a8); }
.attendance-legend small { min-width: 42px; text-align: right; font-size: 12px; font-variant-numeric: tabular-nums; color: var(--assistant-muted, #5d6876); }
.attendance-legend button:hover:not(:disabled), .attendance-legend button[aria-pressed='true'] { background: var(--assistant-soft, #eaf2ff); }
.attendance-legend button:disabled { cursor: default; opacity: 1; }
.attendance-legend button:focus-visible { outline: 2px solid var(--assistant-accent, #0b62db); outline-offset: -2px; }
.attendance-chart figcaption { grid-column: 1 / -1; font-size: 12px; color: var(--assistant-muted, #5d6876); line-height: 1.7; }
@media (max-width: 600px) {
  .attendance-chart { grid-template-columns: 104px minmax(0, 1fr); gap: 12px; }
  .attendance-donut { width: 104px; height: 104px; }
  .donut-label { inset: 23px; font-size: 12px; }
  .donut-label strong { font-size: 22px; }
  .attendance-legend button { gap: 7px 6px; min-height: 52px; padding-inline: 4px; font-size: 13px; }
  .attendance-legend strong > span { display: none; }
  .attendance-legend small { min-width: 35px; font-size: 11px; }
}
@media (max-width: 360px) { .attendance-chart { grid-template-columns: minmax(0, 1fr); } .attendance-donut { margin-inline: auto; } }
@media (prefers-reduced-motion: reduce) { .attendance-donut circle { transition: none; } }
</style>
