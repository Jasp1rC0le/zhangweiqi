<script setup>
import {computed, onBeforeUnmount, onMounted, reactive, ref} from 'vue'
import {onBeforeRouteLeave, useRouter} from 'vue-router'
import {createConversation, sendMessage} from '@/api/chat'
import {createProject} from '@/api/projects'
import {emptyProject} from '@/utils/projectStudio'
import {studyPrompt, studySnapshot} from '@/utils/studyTask'
import {renderMarkdown,safeExternalUrl} from '@/utils/safeMarkdown'
import AttachmentImportPanel from '@/components/AttachmentImportPanel.vue'
const router=useRouter(), importer=ref(), source=ref(''), consent=ref(false), busy=ref(false), saving=ref(false), error=ref(''), answer=ref(''), conversation=ref(null), saved=ref(false), snapshot=ref(null), projectId=ref(crypto.randomUUID())
const form=reactive({kind:'experiment',course:'',task:'',blocker:'',attempt:''})
const dirty=computed(()=>!saved.value && !!(form.task || form.blocker || form.attempt || form.course || answer.value))
const changed=computed(()=>snapshot.value && JSON.stringify(snapshot.value.form)!==JSON.stringify(form))
const references=ref([])
function keepReferences(result){references.value=[...(result.sources||[]).map((s,i)=>({label:`资料${i+1}`,title:s.title,url:safeExternalUrl(s.sourceUrl)})),...(result.webSources||[]).map((s,i)=>({label:`网络${i+1}`,title:s.title,url:safeExternalUrl(s.url)}))].slice(0,30)}
function referenceText(){return references.value.length?'\n\n## 检索返回的参考资料（未逐项证实）\n'+references.value.map(s=>`${s.label} · ${s.title||'未命名资料'}${s.url?' · '+s.url:''}`).join('\n'):''}
function imported(value){if(form.task && !window.confirm('用附件文字替换当前题目要求？'))return;form.task=value.text;source.value=value.source;importer.value?.close();saved.value=false}
async function help(){if(busy.value||saving.value)return;error.value='';try{const prompt=studyPrompt(form);if(!consent.value)throw new Error('请先确认把本页文字发送给 AI');busy.value=true;answer.value='';references.value=[];saved.value=false;const submitted={form:structuredClone({...form}),source:source.value};const c=await createConversation(`${form.course} · 学习辅导`.slice(0,100));conversation.value=c.id;const result=await sendMessage(c.id,prompt,'standard');if(!result.assistantMessage?.content)throw new Error('未收到完整结果，请在最近对话中查看，不要重复提交');answer.value=result.assistantMessage.content;keepReferences(result);snapshot.value=submitted;projectId.value=crypto.randomUUID()}catch(e){error.value=e.response?.data?.message||e.message||'暂时未完成，请稍后再试；请求可能已保存在最近对话中'}finally{busy.value=false}}
async function save(){if(!answer.value||saving.value||busy.value)return;saving.value=true;error.value='';try{const f=snapshot.value.form;const manuscript=studySnapshot(f,answer.value,snapshot.value.source)+referenceText();if(manuscript.length>50000)throw new Error('结果超过项目正文上限，请先在最近对话中保留并按任务拆分');const p=await createProject(projectId.value,{...emptyProject(),title:`${f.course} · ${f.kind==='experiment'?'实验':'作业'}记录`.slice(0,100),track:f.kind==='experiment'?'engineering':'general',brief:f.task,manuscript});saved.value=true;await router.push(`/projects/${p.id}`)}catch(e){error.value=e.response?.data?.message||e.message||'项目保存失败，辅导结果仍留在本页'}finally{saving.value=false}}
function leave(){if(saved.value)return true;if(busy.value||saving.value)return false;return !dirty.value||window.confirm('离开会清除本页草稿。已生成的辅导仍保留在最近对话中，确认离开？')}
onBeforeRouteLeave(leave)
function unload(e){if(dirty.value||busy.value){e.preventDefault();e.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',unload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',unload))
</script>
<template>
  <div class="work-page study-page">
    <header class="work-heading"><div><h1>从卡住的这一步开始</h1><p>带上题目和你已经做的部分，先弄懂，再动手<br>实验、专业课作业，都不用从一段空白聊天开始</p></div><RouterLink class="work-button" to="/instruments">查仪器说明 ↗</RouterLink></header>
    <form class="work-form" @submit.prevent="help">
      <fieldset :disabled="busy || saving">
        <div class="work-tabs" aria-label="学习任务类型"><button type="button" :aria-pressed="form.kind==='experiment'" @click="form.kind='experiment'">实验不会做</button><button type="button" :aria-pressed="form.kind==='homework'" @click="form.kind='homework'">作业卡住了</button></div>
        <label>哪门课<input v-model="form.course" required maxlength="100" placeholder="例如：大学物理、电路基础、统计学" /></label>
        <label>题目或实验要求<textarea v-model="form.task" required maxlength="20000" rows="5" placeholder="粘贴老师的题目、实验目的和已知条件，不用先整理成报告"></textarea></label>
        <button class="work-button" type="button" @click="importer?.open('brief')">从 PDF / Word / 表格提取文字</button><p class="work-help">附件在本机解析，扫描图片暂不支持识字；确认前不会发送给 AI</p>
        <AttachmentImportPanel ref="importer" @apply="imported" />
        <label>具体卡在哪里<textarea v-model="form.blocker" required maxlength="3000" rows="3" placeholder="例如：不明白这一步为什么用线性回归；读数一直不稳定"></textarea></label>
        <label>已经试过什么 <span>选填</span><textarea v-model="form.attempt" maxlength="8000" rows="3" placeholder="写出你的步骤、计算过程或观察到的现象，避免 AI 让你重复做"></textarea></label>
        <details><summary>发送范围和使用额度</summary><p class="work-help">点击下方按钮才会把这些文字发送到服务器和当前 AI 服务，保存为你的私有对话，并按实际模型用量计入账户额度。请移除姓名、学号、联系方式及未获授权的资料。不会自动发布到校园墙，也不会转成公共知识。</p></details>
        <label class="study-consent"><input v-model="consent" type="checkbox" required />我确认材料可以用于 AI 辅导，且已去除他人隐私</label>
        <button class="work-button primary" :disabled="busy || saving">{{busy?'正在分析，请稍候…':'帮我理清下一步'}}</button>
      </fieldset>
    </form>
    <p v-if="error" class="work-error" role="alert">{{error}}</p><p v-if="busy" class="work-status" role="status">正在结合你的题目分析，请不要关闭页面；最多等待约两分钟</p>
    <details v-if="references.length"><summary>检索返回的参考资料 · {{references.length}} 项</summary><p class="work-help">返回资料不代表 AI 已采用或内容已经核实，请逐项对照</p><ul><li v-for="s in references" :key="s.label">{{s.label}} · <a v-if="s.url" :href="s.url" target="_blank" rel="noopener noreferrer">{{s.title}}</a><span v-else>{{s.title}}</span></li></ul></details>
    <section v-if="answer" class="study-answer" aria-label="辅导结果"><header><h2>下一步怎么做</h2><span>AI 建议 · 请对照教材和教师要求核验</span></header><div class="answer-markdown" v-html="renderMarkdown(answer)"></div><p v-if="changed" class="work-status">上方题目已修改，以下结果和保存的项目仍对应上次提交的材料</p><div class="work-actions"><button class="work-button primary" :disabled="saving||busy" @click="save">{{saving?'正在保存…':'整理成一个私有项目'}}</button></div><p class="work-help">题目、问题、尝试过程、辅导结果和待办会一起归档，之后可以继续补充真实数据</p></section>
  </div>
</template>
<style scoped>
.study-page{max-width:980px}.study-page fieldset{border:0;padding:0;margin:0;display:grid;gap:18px;min-width:0}.study-page label span{font-weight:400;color:#63705d}.study-consent{display:flex!important;align-items:flex-start;font-weight:400!important;line-height:1.7}.study-consent input{width:18px;height:18px;flex-shrink:0;margin-top:4px}.study-page summary{cursor:pointer;color:#4c5946}.study-answer{background:#fffefa;border:1px solid #d6dccd;border-radius:24px;padding:28px;line-height:1.8;overflow-wrap:anywhere}.study-answer header{margin-bottom:22px}.study-answer h2{margin:0;font-size:25px}.study-answer header span{font-size:14px;color:#66725e}.study-answer :deep(pre){overflow:auto;max-width:100%;padding:16px;background:#f0f2eb;border-radius:12px}.study-answer :deep(table){display:block;overflow:auto}.study-page :deep(.studio-file-input){display:none}@media(max-width:760px){.study-answer{padding:20px}}
</style>
