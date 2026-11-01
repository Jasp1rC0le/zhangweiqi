<script setup>
const operator = (import.meta.env.VITE_PUBLIC_OPERATOR || '').trim()
const filing = (import.meta.env.VITE_ICP_FILING || '').trim()
const psb = (import.meta.env.VITE_PSB_FILING || '津公网安备12011202001267号').trim()
const psbCode = psb.replace(/\D/g, '')
</script>

<template>
  <div class="legal-notice">
    <span v-if="operator">运营主体：{{ operator }}</span>
    <a v-if="filing" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ filing }}</a>
    <span v-else>内部测试 · 尚未开放公测</span>
    <a v-if="psb && /^\d{14}$/.test(psbCode)" class="psb-filing" :href="`https://beian.mps.gov.cn/#/query/webSearch?code=${psbCode}`" target="_blank" rel="noopener noreferrer"><img src="/psb-filing.png" width="18" height="18" alt="" aria-hidden="true" /><span>{{ psb }}</span></a>
  </div>
</template>

<style scoped>
.legal-notice { position: relative; z-index: 5; display: flex; justify-content: center; align-items: center; gap: 10px 22px; flex-wrap: wrap; padding: 16px 24px 24px; background: inherit; color: #6b756a; font-size: 13px; line-height: 1.6; }
.psb-filing { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; white-space: nowrap; }
.psb-filing img { flex: none; width: 18px; height: 18px; }
a { color: inherit; text-decoration: none; } a:hover { text-decoration: underline; } a:focus-visible { outline: 2px solid #3348de; outline-offset: 4px; }
</style>
