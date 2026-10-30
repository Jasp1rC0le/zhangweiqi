<script setup>
import {computed,onBeforeUnmount,onMounted,reactive,toRefs,watch} from 'vue'
import * as api from '@/api/wall'
import {userSessionGeneration} from '@/api/http'
import {useAdminAuthStore} from '@/stores/adminAuth'
import {createWallModeration,createWallModerationState} from '@/utils/wallModeration'
import {useScopedConfirmation} from '@/utils/useScopedConfirmation'
const auth=useAdminAuthStore()
const owner=computed(()=>auth.isLoggedIn&&auth.user?.schoolId?`${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}`:'')
const state=reactive(createWallModerationState())
const {entries,reports,loading,busy,error,success,notes,parents,needsReload}=toRefs(state)
let moderator
const {confirming,confirm}=useScopedConfirmation(()=>moderator?.key(),()=>Boolean(owner.value))
moderator=createWallModeration({owner:()=>owner.value,state,api,confirm})
const locked=computed(()=>loading.value||busy.value||confirming.value)
watch(owner,()=>moderator.reset(),{flush:'sync'})
onBeforeUnmount(()=>moderator.dispose())
const load=()=>moderator.load(),context=(id)=>moderator.context(id),review=(entry,status)=>moderator.review(entry,status)
onMounted(load)
</script>
<template>
  <section class="wall-admin">
    <header><h2>待处理内容 <small>{{entries.length}}</small></h2><button :disabled="locked||!owner" @click="load">刷新队列</button></header>
    <p>新内容自动检查后公开。这里处理举报与历史待审内容，不进入知识库。</p>
    <p v-if="!owner" role="alert">管理员身份已变化，请重新核验账号后再打开审核。</p>
    <p v-if="error" role="alert">{{error}}</p><p v-if="success" role="status">{{success}}</p>
    <p v-if="busy" role="status">正在处理，请等待结果。离开页面不会撤销已经提交的审核。</p>
    <p v-if="loading" role="status">正在加载…</p><p v-else-if="owner&&!entries.length&&!error">当前没有举报或历史待审内容</p>
    <p v-if="entries.length===100">当前显示最早100条待处理内容，处理后请刷新查看后续内容。</p>
    <article v-for="entry in entries" :key="entry.id">
      <small>{{entry.parentId?'回复':'主题'}} · {{entry.status}} · v{{entry.revision}}</small>
      <h3>{{entry.title}}</h3><p class="wall-admin-body">{{entry.body}}</p>
      <template v-if="entry.parentId"><button :disabled="locked" @click="context(entry.parentId)">查看关联主题</button><aside v-if="parents[entry.parentId]" class="parent-context"><strong>{{parents[entry.parentId].title}}</strong><small> · {{parents[entry.parentId].status}}</small><p class="wall-admin-body">{{parents[entry.parentId].body}}</p></aside></template>
      <ul v-if="reports.some(r=>r.entryId===entry.id)"><li v-for="r in reports.filter(r=>r.entryId===entry.id)" :key="r.reason">{{r.reason}} · {{r.count}} 次举报</li></ul>
      <label>审核说明<input v-model="notes[entry.id]" :disabled="locked" maxlength="300" placeholder="给发布者的说明，不含个人信息" /></label>
      <div class="moderation-actions"><button :disabled="locked||needsReload" @click="review(entry,'PUBLISHED')">{{entry.status==='PUBLISHED'?'保留内容并处理举报':'通过审核'}}</button><button :disabled="locked||needsReload" @click="review(entry,entry.status==='PUBLISHED'?'HIDDEN':'REJECTED')">{{entry.status==='PUBLISHED'?'隐藏内容':'不通过'}}</button></div>
    </article>
  </section>
</template>
<style scoped>
.wall-admin header{display:flex;justify-content:space-between;align-items:center;gap:16px}.wall-admin h2{font-size:22px;margin:8px 0}.wall-admin h2 small{font-size:14px;color:#647057;margin-left:8px}.wall-admin>p{line-height:1.7;color:#586454}.wall-admin article{padding:24px 0;border-top:1px solid #dce1d4}.wall-admin-body{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}.wall-admin input{display:block;width:100%;max-width:600px;margin:10px 0;padding:12px;border:1px solid #cdd5c5;border-radius:14px;font:inherit}.wall-admin button{padding:10px 18px;border-radius:999px;border:1px solid #cdd5c5;background:#fffefa;color:#354732;cursor:pointer;font:inherit}.wall-admin button:disabled{opacity:.5;cursor:not-allowed}.wall-admin :focus-visible{outline:2px solid #3544dc;outline-offset:3px}.wall-admin [role=alert]{background:#f8eae5;color:#843e30;padding:12px 16px;border-radius:14px}.parent-context{background:#edf0e5;border-radius:16px;padding:18px;margin:16px 0}.moderation-actions{display:flex;gap:10px;flex-wrap:wrap}@media(max-width:760px){.wall-admin header{flex-wrap:wrap}.wall-admin h2{font-size:20px}}
</style>
