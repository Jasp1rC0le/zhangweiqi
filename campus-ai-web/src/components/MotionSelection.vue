<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createSelectionIndicator } from '@/utils/selectionIndicator'

const props = defineProps({ activeKey: [String, Number], selector: { type: String, default: 'button[aria-pressed="true"]' } })
const marker = ref(), box = ref(null)
let controller
const position = computed(() => box.value ? {
  width: `${box.value.width}px`, height: `${box.value.height}px`,
  transform: `translate3d(${box.value.x}px, ${box.value.y}px, 0)`,
} : undefined)
onMounted(() => { controller = createSelectionIndicator(marker.value?.parentElement, value => { box.value = value }, { selector: props.selector }) })
watch(() => props.activeKey, () => controller?.update(true), { flush: 'post' })
onBeforeUnmount(() => controller?.stop())
</script>

<template>
  <span ref="marker" class="motion-selection-indicator" :data-ready="Boolean(box)" :style="position" aria-hidden="true"></span>
</template>
