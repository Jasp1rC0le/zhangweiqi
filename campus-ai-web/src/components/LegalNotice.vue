<script setup>
const operator = (import.meta.env.VITE_PUBLIC_OPERATOR || '').trim()
const filing = (import.meta.env.VITE_ICP_FILING || '').trim()
const psb = (import.meta.env.VITE_PSB_FILING || '').trim()
const psbCode = psb.replace(/\D/g, '')
</script>

<template>
  <div class="legal-notice">
    <span v-if="operator">运营主体：{{ operator }}</span>
    <a v-if="filing" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ filing }}</a>
    <span v-else>内部测试 · 尚未开放公测</span>
    <a v-if="psb && /^\d{14}$/.test(psbCode)" :href="`https://beian.mps.gov.cn/#/query/webSearch?code=${psbCode}`" target="_blank" rel="noopener noreferrer">{{ psb }}</a>
  </div>
</template>

<style scoped>
.legal-notice { display: flex; justify-content: center; align-items: center; gap: 10px 22px; flex-wrap: wrap; padding: 16px 24px 24px; color: #6b756a; font-size: 13px; line-height: 1.6; }
a { color: inherit; text-decoration: none; } a:hover { text-decoration: underline; } a:focus-visible { outline: 2px solid #3348de; outline-offset: 4px; }
</style>
