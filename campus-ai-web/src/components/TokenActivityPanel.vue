<script setup>
import {computed,onMounted,ref} from 'vue'
import http from '@/api/http'
import { quotaPresentation } from '@/utils/quotaPresentation.js'
const rows=ref([]),quota=ref(null),loading=ref(false),error=ref('')
const quotaDisplay=computed(()=>quotaPresentation(quota.value))
const labels={RESERVED:'已预留 · 待结算',SETTLED:'已结算',RELEASED:'失败预留已退回'}
async function load(){loading.value=true;error.value='';try{const [q,a]=await Promise.all([http.get('/api/ai/quota'),http.get('/api/ai/quota/activity')]);quota.value=q.data;rows.value=a.data}catch{error.value='额度记录暂时无法读取，请确认后端已更新后重试'}finally{loading.value=false}}
onMounted(load)
</script>
<template>
  <section id="token-activity" class="account-card">
    <h2>额度用在哪里</h2><p>这是 AI Token 使用记录，不是人民币账单。尚未开通付费订阅；本地附件解析、规则检查和项目审阅不扣 Token。</p>
    <p v-if="quotaDisplay"><strong>{{ quotaDisplay.label }}</strong> · {{ quotaDisplay.hint }}<template v-if="quota?.unlimited !== true">；剩余额度已扣除进行中的预留</template></p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading" role="status">正在读取记录</p>
    <ul class="token-records"><li v-for="(row,index) in rows" :key="index"><strong>{{ labels[row.state]||'待核对' }}</strong><time>{{ new Date(row.createdAt).toLocaleString('zh-CN') }}</time><span>预留 {{ row.reservedTokens }} · {{ row.actualTokens===null?'尚未结算':`结算 ${row.actualTokens} Token` }}</span></li></ul>
    <p v-if="!loading&&!error&&!rows.length">新账本暂时没有记录；历史调用未回填，不代表从未使用</p>
    <p class="token-note">仅展示最近50条。失败退回与结算按每次预留处理，重复回调不重复记账；长时间未结算可能是任务中断，需要人工核对，不会伪装为已退款。</p><button class="secondary" :disabled="loading" @click="load">刷新额度记录</button>
  </section>
</template>
<style scoped>
.token-records{padding:0;list-style:none}.token-records li{display:grid;gap:8px;padding:16px 0;border-bottom:1px solid #dce1d4}.token-records time,.token-records span,.token-note{font-size:14px;color:#536047;line-height:1.6}
</style>
