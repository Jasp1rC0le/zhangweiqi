<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ refinement: { type: Object, required: true }, active: Boolean })
const emit = defineEmits(['select-course'])
const limit = ref(12)
const visible = computed(() => props.refinement.courseChoices.slice(0, limit.value))
const remaining = computed(() => Math.max(0, props.refinement.courseChoices.length - limit.value))
</script>

<template>
  <fieldset class="course-choices" :disabled="!active">
    <legend>同日期范围的已保存课程</legend>
    <p>只更换课程名；日期、时段和先后顺序保持不变，不修改课表。</p>
    <template v-if="refinement.choicesComplete">
      <ul>
        <li v-for="name in visible" :key="name">
          <button
            type="button"
            :aria-label="`查询课程名：${name}`"
            @click="emit('select-course', name)"
          >
            {{ name }}
          </button>
        </li>
      </ul>
      <button v-if="remaining" type="button" @click="limit += 12">
        再显示{{ Math.min(12, remaining) }}个名称 · 还剩{{ remaining }}个
      </button>
    </template>
    <p v-else>课程名称超过200个，请缩小日期范围或打开完整课表；没有截取一部分冒充全部。</p>
    <button class="course-choice-clear" type="button" @click="emit('select-course', '')">
      不限定课程名，按原条件再查
    </button>
  </fieldset>
</template>

<style scoped>
.course-choices {
  min-width: 0;
  margin: 20px 0 8px;
  padding: 0;
  border: 0;
  font-size: 16px;
}
.course-choices legend {
  padding: 0;
  font-weight: 600;
}
.course-choices p {
  margin: 8px 0 12px;
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
  line-height: 1.65;
}
.course-choices ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.course-choices li {
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.course-choices button {
  min-height: 44px;
  max-width: 100%;
  padding: 10px 0;
  border: 0;
  background: transparent;
  color: var(--assistant-accent, #0b62db);
  font: inherit;
  text-align: left;
  line-height: 1.5;
  overflow-wrap: anywhere;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
}
.course-choices li button {
  width: 100%;
}
.course-choices button:hover {
  color: var(--assistant-accent-hover, #084db0);
}
.course-choices button:focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 2px;
  border-radius: 4px;
}
.course-choices:disabled {
  opacity: 0.65;
}
.course-choices:disabled button {
  cursor: default;
}
.course-choice-clear {
  margin-top: 12px;
}
</style>
