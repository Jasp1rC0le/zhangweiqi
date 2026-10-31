<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { userSessionGeneration } from '@/api/http'
import { focusWorkflowElement } from '@/utils/teachingWorkflows'
import SchoolInvoiceInfo from '@/components/SchoolInvoiceInfo.vue'

const auth = useAuthStore(), route = useRoute(), invoice = ref()
const owner = computed(() => auth.user ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
let disposed = false
async function focusInvoice() {
  const current = owner.value
  if (!current || route.hash !== '#invoice-info') return
  await nextTick()
  if (!disposed && owner.value === current && route.hash === '#invoice-info')
    focusWorkflowElement(invoice.value?.$el, () => !disposed && owner.value === current && route.hash === '#invoice-info')
}
watch([owner, () => route.hash], focusInvoice, { flush: 'post' })
onMounted(focusInvoice)
onBeforeUnmount(() => { disposed = true })
</script>

<template>
  <main class="work-page campus-page">
    <header class="work-heading"><h1>校园资料</h1></header>
    <SchoolInvoiceInfo ref="invoice" />
  </main>
</template>

<style scoped>
.campus-page { max-width: 880px; }
</style>
