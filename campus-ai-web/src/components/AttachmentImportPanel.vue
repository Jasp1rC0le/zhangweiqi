<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { startAttachmentImport } from '@/utils/attachmentImport'
const emit = defineEmits(['apply'])
const picker = ref(), target = ref('brief'), filename = ref(''), loading = ref(false), result = ref(null), error = ref(''), selected = ref(0), visible = ref(false)
const panel = ref()
let task, sequence = 0
const choice = computed(() => result.value?.choices[selected.value])
const limit = computed(() => target.value === 'brief' ? 20000 : 50000)
const targetLabel = computed(() => ({brief:'任务要求',manuscript:'材料正文',dataSheet:'数据检查'})[target.value])
const tooLong = computed(() => (choice.value?.text.length || 0) > limit.value)
function open(value) { if (loading.value) return; target.value = value; picker.value.click() }
async function read(event) {
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file) return
  const current = ++sequence
  visible.value = true; loading.value = true; result.value = null; error.value = ''; selected.value = 0; filename.value = file.name
  await nextTick(); panel.value?.scrollIntoView({block:'start',behavior:'auto'})
  try { task = startAttachmentImport(file,target.value); const parsed = await task.promise; if (current === sequence) result.value = parsed }
  catch (e) { if (current === sequence) error.value = e.message }
  finally { if (current === sequence) { loading.value = false; task = null } }
}
function close() { sequence++; task?.cancel(); task = null; loading.value = false; result.value = null; visible.value = false }
function apply() { if (choice.value && !tooLong.value) emit('apply',{target:target.value,text:choice.value.text,source:`${filename.value} · ${choice.value.label}`.slice(0,300)}) }
defineExpose({open,close})
onBeforeUnmount(close)
</script>
<template>
  <input ref="picker" class="studio-file-input" type="file" :accept="target === 'dataSheet' ? '.csv,.xlsx' : '.pdf,.docx,.xlsx,.txt,.md,.csv'" aria-label="选择项目附件" @change="read" />
  <section v-if="visible" ref="panel" class="attachment-import" aria-label="附件导入预览" :aria-busy="loading">
    <div class="section-heading"><div><h2>{{ loading ? '正在本机读取附件' : '先看一遍，再放入项目' }}</h2><p>{{ filename }} → {{ targetLabel }}</p></div><button @click="close">{{ loading ? '取消解析' : '关闭预览' }}</button></div>
    <p class="data-help">本地解析免费 · 不消耗 Token · 文件不上传服务器或模型。确认后只写入本页草稿，保存项目才上传提取文字。</p>
    <p v-if="loading" role="status">最多等待20秒，可以随时取消；不读取宏、外部链接或附件脚本</p>
    <p v-if="error" class="studio-error" role="alert">{{ error }}<button @click="open(target)">重新选择</button></p>
    <template v-if="result">
      <label v-if="result.choices.length > 1" class="text-label">选择工作表<select v-model.number="selected"><option v-for="(item,index) in result.choices" :key="index" :value="index">{{ item.label }}</option></select></label>
      <ul class="attachment-notes"><li v-for="warning in result.warnings" :key="warning">{{ warning }}</li></ul>
      <label class="text-label" for="attachment-extracted">提取预览 · {{ choice?.label }}</label>
      <textarea id="attachment-extracted" :value="choice?.text" rows="7" readonly spellcheck="false"></textarea>
      <p v-if="tooLong" class="studio-error" role="alert">此文本{{ choice.text.length }}字，{{ targetLabel }}最多{{ limit }}字；请拆分文件，原材料未改变</p>
      <div class="issue-actions"><button class="primary" :disabled="tooLong || !choice?.text.trim()" @click="apply">确认放入{{ targetLabel }}</button><span class="data-help">若已有内容，会先询问是否替换</span></div>
    </template>
  </section>
</template>
<style scoped>
.attachment-import { margin:24px 0; padding:24px; background:#f1f4e9; border:1px solid #d0d8c4; border-radius:24px; }
.attachment-import .section-heading { margin-top:0; }.attachment-import p { overflow-wrap:anywhere; }
.attachment-notes { padding-left:20px; font-size:14px; color:#536047; line-height:1.65; }
.attachment-import select { display:block; margin:10px 0; }
.attachment-import [readonly] { font-size:14px; color:#344238; }
@media(max-width:760px) { .attachment-import { padding:18px; }.attachment-import [readonly] { font-size:16px; } }
</style>
