<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Plus, Close, Upload } from '@element-plus/icons-vue'
import { publishAdminMerchants } from '@/api/admin'
import { createAdminEditorScope } from '@/utils/adminEditorScope'
import { merchantBatchIssue, merchantFileName, merchantPhotoIssue, publicationMatches } from '@/utils/merchantPublishing'
const props = defineProps({ scope: String, canteens: { type: Array, default: () => [] }, disabled: Boolean })
const emit = defineEmits(['state', 'published'])
const rows = reactive([]), busy = ref(false), error = ref(''), notice = ref(''), uncertain = ref(false), selectedCanteen = ref('')
const places = computed(() => props.canteens.filter(item => item.status === 'PUBLISHED'))
const issue = computed(() => merchantBatchIssue(rows))
const locked = computed(() => props.disabled || busy.value || uncertain.value || !props.scope)
const scope = createAdminEditorScope(() => props.scope, () => null)
let sequence = 0, nextId = 1, revision = 0
function clear() { for (const row of rows) URL.revokeObjectURL(row.preview); rows.splice(0); error.value=''; notice.value=''; uncertain.value=false }
watch(() => props.scope, () => { sequence++; scope.invalidate(); busy.value=false; clear(); selectedCanteen.value='' }, { flush: 'sync' })
watch(places, items => { if (!items.some(item => item.id === Number(selectedCanteen.value))) selectedCanteen.value=items.length===1 ? items[0].id : '' }, { immediate: true })
watch(() => JSON.stringify([rows.map(row=>[row.key,row.name,row.location,row.canteenId]),busy.value]), () => emit('state', { pending:rows.length>0, busy:busy.value, revision:++revision }), { immediate: true })
function addPhotos(event) {
  const files = Array.from(event.target.files || []); event.target.value=''
  if (!files.length || locked.value) return
  error.value = merchantPhotoIssue([...rows.map(row => row.file), ...files]); notice.value=''
  if (error.value) return
  for (const file of files) rows.push({ key:nextId++, file, preview:URL.createObjectURL(file), name:merchantFileName(file.name), location:'', canteenId:selectedCanteen.value })
}
function remove(row) { if (locked.value) return; URL.revokeObjectURL(row.preview); rows.splice(rows.indexOf(row),1); error.value='' }
function applyPlace() { if (!locked.value) for (const row of rows) row.canteenId=selectedCanteen.value }
async function publish() {
  if (locked.value || issue.value) return
  const ticket=scope.capture({abortable:true}), turn=++sequence
  const current=()=>ticket.current() && turn===sequence
  const items=rows.map(row=>({canteenId:Number(row.canteenId),name:row.name.trim(),location:row.location.trim()})), files=rows.map(row=>row.file)
  busy.value=true; error.value=''; notice.value=''
  try {
    const result=await publishAdminMerchants(items,files,{signal:ticket.signal})
    if (!current()) return
    if (!publicationMatches(result,items)) throw new Error('发布回执未能核对')
    clear(); notice.value=`已发布 ${result.length} 家商家`; emit('published')
  } catch (e) {
    if (current()) {
      const status=e.response?.status
      uncertain.value=!(status>=400 && status<500)
      error.value=(e.response?.data?.message || e.response?.data?.detail || e.message || '发布结果未确认')
        +(uncertain.value?'。填写已保留，请先刷新并核对下方商家列表，避免重复发布。':'。本批未发布，修改后可以重新提交。')
    }
  } finally { if (current()) busy.value=false; ticket.release() }
}
onBeforeUnmount(()=>{sequence++;scope.dispose();clear();emit('state',{pending:false,busy:false})})
</script>
<template>
  <section class="merchant-publisher" aria-label="快速发布商家" :aria-busy="busy">
    <header><div><h2>发布商家</h2><p>选照片，填名称和位置。</p></div><label class="merchant-add" :class="{disabled:locked}"><el-icon><Plus /></el-icon>{{ rows.length ? '继续添加' : '添加照片' }}<input type="file" multiple accept="image/jpeg,image/png" :disabled="locked" aria-label="添加商家照片，可多选" @change="addPhotos" /></label></header>
    <p v-if="!places.length && !disabled" class="merchant-publish-error">请先在下方“食堂设置”发布所属食堂。</p>
    <label v-else-if="places.length>1" class="merchant-common-place">这批所在食堂<select v-model="selectedCanteen" :disabled="locked" @change="applyPlace"><option value="">请选择</option><option v-for="place in places" :key="place.id" :value="place.id">{{place.name}}</option></select></label>
    <div v-if="!rows.length" class="merchant-drop-hint"><el-icon><Upload /></el-icon><span>一张一家，也可以多选批量发布</span><small>JPEG / PNG · 每张5MB以内</small></div>
    <div class="merchant-draft-list">
      <article v-for="(row,index) in rows" :key="row.key" class="merchant-draft">
        <figure><img :src="row.preview" :alt="`第${index+1}家商家照片预览`" /></figure>
        <div class="merchant-draft-fields"><label>商家名称<input v-model="row.name" :disabled="locked" maxlength="120" required placeholder="例如：客家面" /></label><label>位置<input v-model="row.location" :disabled="locked" maxlength="120" required placeholder="例如：大食堂二楼" /></label><label v-if="places.length>1">所属食堂<select v-model="row.canteenId" :disabled="locked"><option value="">请选择</option><option v-for="place in places" :key="place.id" :value="place.id">{{place.name}}</option></select></label></div>
        <button class="merchant-remove" type="button" :disabled="locked" :aria-label="`移除第${index+1}张照片`" @click="remove(row)"><el-icon><Close /></el-icon></button>
      </article>
    </div>
    <p v-if="error" class="merchant-publish-error" role="alert">{{error}}</p><p v-else-if="notice" class="merchant-publish-success" role="status">{{notice}}</p>
    <button v-if="uncertain" type="button" class="merchant-resume" @click="uncertain=false;error=''">已核对商家列表，继续编辑</button>
    <footer v-if="rows.length"><span>{{rows.length}} 家<small v-if="issue"> · {{issue}}</small></span><button type="button" class="merchant-publish" :disabled="locked || !!issue" @click="publish">{{busy ? '发布中…' : rows.length>1 ? `发布 ${rows.length} 家商家` : '发布商家'}}</button></footer>
  </section>
</template>
<style scoped>
.merchant-publisher{color:var(--assistant-ink,#29323c);padding:4px 0 24px;border-bottom:1px solid var(--assistant-line,#e2e7ec)}
.merchant-publisher header,.merchant-publisher footer{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.merchant-publisher h2{margin:0;font-size:24px;font-weight:600;letter-spacing:-.025em}.merchant-publisher header p{margin:8px 0 0;color:#5d6876;font-size:15px}
.merchant-add,.merchant-publish{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 18px;border:0;border-radius:12px;background:#2b63cf;color:#fff;cursor:pointer;font:inherit;font-size:16px;box-sizing:border-box;overflow:hidden}
.merchant-add input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}.merchant-add.disabled,.merchant-publisher button:disabled{opacity:.5;cursor:not-allowed}
.merchant-drop-hint{display:grid;justify-items:center;gap:12px;padding:38px 16px;color:#5d6876;background:#f5f7fb;border-radius:14px;margin-top:24px;text-align:center}.merchant-drop-hint>.el-icon{font-size:30px;color:#2b63cf}.merchant-drop-hint small{font-size:13px}
.merchant-common-place,.merchant-draft-fields label{display:grid;gap:8px;font-size:14px}.merchant-common-place{max-width:360px;margin-top:24px}
.merchant-publisher :is(input:not([type=file]),select){box-sizing:border-box;min-width:0;width:100%;min-height:46px;padding:10px 12px;border:1px solid #d6dde5;border-radius:10px;background:#fff;color:#29323c;font:inherit;font-size:16px}
.merchant-draft-list{margin-top:24px}.merchant-draft{position:relative;display:grid;grid-template-columns:minmax(160px,.8fr) minmax(0,1.2fr);gap:24px;padding:24px 0;border-top:1px solid #e2e7ec}.merchant-draft:first-child{border-top:0;padding-top:0}
.merchant-draft figure{margin:0;min-width:0;align-self:start;background:#f5f7fb;border-radius:12px;overflow:hidden}.merchant-draft img{display:block;width:100%;height:180px;object-fit:contain}.merchant-draft-fields{display:grid;gap:16px;min-width:0;padding-right:48px}
.merchant-remove{position:absolute;right:0;top:24px;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:10px;background:#eef2f7;color:#5d6876;font-size:18px;cursor:pointer}.merchant-draft:first-child .merchant-remove{top:0}
.merchant-publisher footer{margin-top:24px;font-size:15px}.merchant-publisher footer small{color:#5d6876}.merchant-publish-error{color:#a43e42;font-size:15px;line-height:1.6}.merchant-publish-success{color:#216b4c;font-size:15px}
.merchant-resume{min-height:44px;padding:10px 14px;color:#2b63cf;background:#eef2f8;border:0;border-radius:10px;font:inherit;cursor:pointer}
.merchant-publisher :focus-visible,.merchant-add:focus-within{outline:2px solid #2b63cf;outline-offset:3px}
@media(max-width:600px){.merchant-draft{grid-template-columns:minmax(0,1fr);gap:18px}.merchant-draft figure{margin-right:52px}.merchant-draft img{height:170px}.merchant-draft-fields{padding-right:0}.merchant-publisher h2{font-size:21px}.merchant-publisher footer{align-items:stretch;flex-direction:column}.merchant-publish{width:100%}}
</style>
