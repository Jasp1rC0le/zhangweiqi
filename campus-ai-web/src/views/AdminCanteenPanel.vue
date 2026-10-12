<script setup>
import { computed, onMounted, onBeforeUnmount, reactive, ref, toRefs, watch } from 'vue'
import * as api from '@/api/admin'
import { userSessionGeneration } from '@/api/http'
import { useAdminAuthStore } from '@/stores/adminAuth'
import { createAdminCatalogScope, createAdminCatalogState, catalogId, sameCatalogEntry, validCatalogList } from '@/utils/adminCatalogScope'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'

const auth = useAdminAuthStore()
const owner = computed(() => auth.isLoggedIn && auth.user?.schoolId
  ? `${auth.user.id}:${auth.user.schoolId}:${userSessionGeneration.value}` : '')
const collections = ['canteens', 'merchants', 'reviews']
const state = reactive(createAdminCatalogState(collections))
const { canteens, merchants, reviews, loading, error, success, busy, needsReload } = toRefs(state)
const photoPreviews = reactive({})
const canteenId = ref(null)
const merchantId = ref(null)
const canteenForm = reactive({ name: '' })
const merchantForm = reactive({ canteenId: '', name: '', location: '', description: '' })
const canteenNames = computed(() => new Map(canteens.value.map((item) => [item.id, item.name])))
let canteenGeneration = 0, merchantGeneration = 0, catalog
const { confirming, confirm } = useScopedConfirmation(() => catalog?.key(), () => Boolean(owner.value))
const locked = computed(() => loading.value || busy.value || confirming.value || !owner.value)
const writeLocked = computed(() => locked.value || needsReload.value)

function resetCanteen() { canteenId.value = null; canteenForm.name = '' }
function resetMerchant() {
  merchantId.value = null
  Object.assign(merchantForm, { canteenId: '', name: '', location: '', description: '' })
}
function clearPhotos() {
  for (const id of Object.keys(photoPreviews)) {
    URL.revokeObjectURL(photoPreviews[id])
    delete photoPreviews[id]
  }
}
const validStatus = (item) => ['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(item.status)
catalog = createAdminCatalogScope({
  owner: () => owner.value, state, collections,
  read: async (options) => {
    const [canteens, merchants, reviews] = await Promise.all([
      api.getAdminCanteens(options), api.getAdminCanteenMerchants(options), api.getAdminMerchantReviews(options),
    ])
    return { canteens, merchants, reviews }
  },
  validate: (data) => data && validCatalogList(data.canteens, (item) => typeof item.name === 'string' && validStatus(item))
    && validCatalogList(data.merchants, (item) => catalogId(item.canteenId) && typeof item.name === 'string' && validStatus(item)
      && ['UNKNOWN', 'OPEN', 'CLOSED'].includes(item.operatingStatus))
    && validCatalogList(data.reviews, (item) => catalogId(item.merchantId) && Number.isInteger(item.score) && item.score >= 1 && item.score <= 5
      && (item.comment == null || typeof item.comment === 'string') && ['PENDING', 'PUBLISHED', 'HIDDEN'].includes(item.status), 100),
  onReset: () => { resetCanteen(); resetMerchant(); clearPhotos() },
})
watch(owner, () => catalog.reset(), { flush: 'sync' })
watch(() => [canteenId.value, canteenForm.name], () => { canteenGeneration++ }, { flush: 'sync' })
watch(() => [merchantId.value, ...Object.values(merchantForm)], () => { merchantGeneration++ }, { flush: 'sync' })
onMounted(() => catalog.load())
onBeforeUnmount(() => catalog.dispose())
const reload = () => catalog.load()

function editCanteen(item) {
  if (locked.value) return
  canteenId.value = item.id
  canteenForm.name = item.name
}
function editMerchant(item) {
  if (locked.value) return
  merchantId.value = item.id
  Object.assign(merchantForm, { canteenId: item.canteenId, name: item.name,
    location: item.location || '', description: item.description || '' })
}
async function submitCanteen() {
  if (writeLocked.value || !canteenForm.name.trim() || canteenForm.name.trim().length > 120) return
  const id = canteenId.value, generation = canteenGeneration
  const payload = Object.freeze({ name: canteenForm.name.trim() })
  return catalog.run({
    targetCurrent: () => generation === canteenGeneration,
    execute: (signal) => api.saveAdminCanteen(payload, id, { signal }),
    committed: () => { if (generation === canteenGeneration) resetCanteen() },
    success: '食堂已保存为草稿，核实后再发布。',
  })
}
async function submitMerchant() {
  if (writeLocked.value || !catalogId(Number(merchantForm.canteenId)) || !merchantForm.name.trim()
    || merchantForm.name.trim().length > 120 || merchantForm.location.length > 120 || merchantForm.description.length > 1000) return
  const id = merchantId.value, generation = merchantGeneration
  const payload = Object.freeze({ ...merchantForm, canteenId: Number(merchantForm.canteenId), name: merchantForm.name.trim() })
  return catalog.run({
    targetCurrent: () => generation === merchantGeneration && canteens.value.some((item) => item.id === payload.canteenId),
    execute: (signal) => api.saveAdminCanteenMerchant(payload, id, { signal }),
    committed: () => { if (generation === merchantGeneration) resetMerchant() },
    success: '商家已保存为草稿，核实后再发布。',
  })
}
async function changePublished(item, type) {
  if (writeLocked.value || !['canteen', 'merchant'].includes(type)) return
  const snapshot = Object.freeze({ ...item }), published = item.status !== 'PUBLISHED'
  const list = () => type === 'canteen' ? canteens.value : merchants.value
  return catalog.run({
    confirm: () => confirm(published
      ? `确认发布“${snapshot.name}”？请核对真实名称、位置和介绍；发布后本校用户可见。`
      : `确认下架“${snapshot.name}”？用户不再看到该条目，已有评分保留。`,
    { title: published ? '确认发布' : '确认下架', confirmText: published ? '发布' : '下架', cancelText: '取消，保留状态' }),
    targetCurrent: () => sameCatalogEntry(list(), snapshot),
    execute: (signal) => type === 'canteen'
      ? api.setAdminCanteenPublished(snapshot.id, published, { signal })
      : api.setAdminMerchantPublished(snapshot.id, published, { signal }),
    success: published ? '已发布。' : '已下架。',
  })
}
async function changeOperating(item, status) {
  if (writeLocked.value || !['UNKNOWN', 'OPEN', 'CLOSED'].includes(status) || status === item.operatingStatus) return
  const snapshot = Object.freeze({ ...item })
  return catalog.run({
    targetCurrent: () => sameCatalogEntry(merchants.value, snapshot),
    execute: (signal) => api.setAdminMerchantOperatingStatus(snapshot.id, status, { signal }),
    success: '营业状态已更新。',
  })
}
async function uploadPhoto(item, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || writeLocked.value) return
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0) {
    state.error = '请选择不超过5MB的JPEG或PNG照片，原照片不会替换。'
    return
  }
  const snapshot = Object.freeze({ ...item })
  return catalog.run({
    targetCurrent: () => sameCatalogEntry(merchants.value, snapshot),
    execute: (signal) => api.uploadAdminMerchantPhoto(snapshot.id, file, { signal }),
    committed: () => {
      const preview = URL.createObjectURL(file)
      if (photoPreviews[snapshot.id]) URL.revokeObjectURL(photoPreviews[snapshot.id])
      photoPreviews[snapshot.id] = preview
    },
    success: '照片已提交，服务端压缩并移除元数据；本页预览是刚选择的原文件。',
  })
}
async function moderate(review, status) {
  if (writeLocked.value || !['PUBLISHED', 'HIDDEN'].includes(status) || status === review.status) return
  const snapshot = Object.freeze({ ...review })
  return catalog.run({
    confirm: () => confirm(`确认${status === 'PUBLISHED' ? '公开' : '隐藏'}“${snapshot.merchantName}”的这条短评？请核对个人信息及原文。`,
      { title: '确认短评审核', confirmText: '提交审核', cancelText: '取消，保留短评' }),
    targetCurrent: () => sameCatalogEntry(reviews.value, snapshot),
    execute: (signal) => api.setAdminMerchantReviewStatus(snapshot.id, status, snapshot.comment, { signal }),
    success: status === 'PUBLISHED' ? '短评已公开。' : '短评已隐藏。',
  })
}
</script>

<template>
  <section class="canteen-admin" :aria-busy="locked">
    <p v-if="!owner" role="alert">管理员身份已变化，请重新核验后打开管理。</p>
    <p v-if="success" role="status">{{ success }}</p>
    <p v-if="busy" role="status">正在处理。离开页面不会撤销已提交的操作。</p>
    <button class="catalog-refresh" type="button" :disabled="locked" @click="reload">刷新本校资料</button>
    <div class="panel-intro">
      <p>先建食堂，再建商家。核实后发布；照片自动压缩并移除元数据。学生短评须审核，不进入 AI 知识库。</p>
    </div>
    <p v-if="loading" class="panel-message">正在加载本校食堂资料…</p>
    <div v-else-if="error" class="panel-message error" role="alert">
      <span>{{ error }}</span><button type="button" :disabled="locked" @click="reload">重试</button>
    </div>
    <template v-else>
      <div class="editor-grid">
        <form class="editor" @submit.prevent="submitCanteen">
          <h3>{{ canteenId ? '编辑食堂' : '新增食堂' }}</h3>
          <label>食堂名称<input v-model="canteenForm.name" :disabled="locked" required maxlength="120" placeholder="填写真实名称" /></label>
          <div class="form-actions">
            <button type="submit" :disabled="writeLocked || !canteenForm.name.trim()">保存草稿</button>
            <button v-if="canteenId" type="button" class="quiet" :disabled="locked" @click="resetCanteen">取消编辑</button>
          </div>
        </form>
        <form class="editor" @submit.prevent="submitMerchant">
          <h3>{{ merchantId ? '编辑商家' : '新增商家' }}</h3>
          <label>所属食堂<select v-model="merchantForm.canteenId" :disabled="locked" required>
            <option value="" disabled>选择食堂</option>
            <option v-for="item in canteens" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select></label>
          <label>商家名称<input v-model="merchantForm.name" :disabled="locked" required maxlength="120" placeholder="填写真实名称" /></label>
          <label>位置 / 档口<input v-model="merchantForm.location" :disabled="locked" maxlength="120" placeholder="可选，核实后填写" /></label>
          <label>介绍<textarea v-model="merchantForm.description" :disabled="locked" maxlength="1000" rows="3" placeholder="只写已核实的信息，不填宣传文案" /></label>
          <div class="form-actions">
            <button type="submit" :disabled="writeLocked || !merchantForm.canteenId || !merchantForm.name.trim()">保存草稿</button>
            <button v-if="merchantId" type="button" class="quiet" :disabled="locked" @click="resetMerchant">取消编辑</button>
          </div>
        </form>
      </div>

      <div class="list-section">
        <h3>食堂 <span>{{ canteens.length }}</span></h3>
        <p v-if="!canteens.length" class="no-data">还没有食堂。请先填写上面的真实名称。</p>
        <article v-for="item in canteens" :key="item.id" class="admin-row">
          <div><strong>{{ item.name }}</strong><small>{{ item.status === 'PUBLISHED' ? '已发布' : item.status === 'DRAFT' ? '草稿' : '已下架' }}</small></div>
          <div class="row-actions"><button type="button" :disabled="locked" @click="editCanteen(item)">编辑</button>
            <button type="button" :disabled="writeLocked" @click="changePublished(item, 'canteen')">{{ item.status === 'PUBLISHED' ? '下架' : '发布' }}</button></div>
        </article>
      </div>

      <div class="list-section">
        <h3>商家 <span>{{ merchants.length }}</span></h3>
        <p v-if="!merchants.length" class="no-data">还没有商家。商家发布后才会出现在学生页面。</p>
        <article v-for="item in merchants" :key="item.id" class="admin-row">
          <div><strong>{{ item.name }}</strong><small>{{ canteenNames.get(item.canteenId) || '未知食堂' }} / {{ item.status === 'PUBLISHED' ? '已发布' : item.status === 'DRAFT' ? '草稿' : '已下架' }}</small><img v-if="photoPreviews[item.id]" class="admin-photo-preview" :src="photoPreviews[item.id]" :alt="`${item.name}刚上传的照片预览`" /></div>
          <div class="row-actions">
            <label class="photo-upload">上传商家照片<input type="file" accept="image/jpeg,image/png" :disabled="writeLocked" @change="uploadPhoto(item, $event)" /></label>
            <label class="operating-label">营业状态
              <select :value="item.operatingStatus" :disabled="writeLocked" @change="changeOperating(item, $event.target.value)">
                <option value="UNKNOWN">待确认</option><option value="OPEN">营业中</option><option value="CLOSED">暂停营业</option>
              </select>
            </label>
            <button type="button" :disabled="locked" @click="editMerchant(item)">编辑</button>
            <button type="button" :disabled="writeLocked" @click="changePublished(item, 'merchant')">{{ item.status === 'PUBLISHED' ? '下架' : '发布' }}</button>
          </div>
        </article>
      </div>
      <div class="list-section">
        <h3>学生短评 <span>{{ reviews.length }}</span></h3>
        <p v-if="!reviews.length" class="no-data">暂无需要审核的短评。</p>
        <article v-for="review in reviews" :key="review.id" class="admin-row review-admin-row">
          <div><strong>{{ review.merchantName }} · {{ review.score }} 分</strong><small>{{ review.comment }} · {{ review.status === 'PENDING' ? '待审核' : review.status === 'PUBLISHED' ? '已公开' : '已隐藏' }}</small></div>
          <div class="row-actions"><button v-if="review.status !== 'PUBLISHED'" type="button" :disabled="writeLocked" @click="moderate(review, 'PUBLISHED')">通过</button><button v-if="review.status !== 'HIDDEN'" type="button" :disabled="writeLocked" @click="moderate(review, 'HIDDEN')">隐藏</button></div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.canteen-admin { display: grid; gap: 28px; color: #252a31; }
.panel-intro p { max-width: 70ch; margin: 0; color: #6b7480; font-size: 14px; line-height: 1.7; }
.editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 16px; }
.editor { display: grid; gap: 13px; padding: 24px; background: #fff; border: 1px solid #e2e6eb; border-radius: 16px; }
.editor h3 { margin: 0 0 2px; font-size: 17px; }
.editor label { display: grid; gap: 6px; color: #505b67; font-size: 14px; font-weight: 650; }
.editor input, .editor select, .editor textarea, .operating-label select { box-sizing: border-box; width: 100%; min-height: 44px; padding: 10px 12px; color: #252a31; background: #f7f8fa; border: 1px solid #d6dde5; border-radius: 14px; font: inherit; font-size: 16px; }
.editor textarea { resize: vertical; }
.canteen-admin :focus-visible { outline: 2px solid #286caa; outline-offset: 2px; }
.form-actions { display: flex; gap: 8px; }
.form-actions button, .row-actions button, .panel-message button, .catalog-refresh { min-height: 44px; padding: 9px 14px; color: #fff; background: #245e96; border: 0; border-radius: 14px; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.catalog-refresh { justify-self: end; color: #31526d; background: #ecf2f6; }
.form-actions button.quiet, .row-actions button:first-of-type { color: #31526d; background: #ecf2f6; }
.form-actions button:disabled, .row-actions button:disabled, .catalog-refresh:disabled { opacity: .5; cursor: default; }
.list-section { padding: 23px 25px; background: #fff; border: 1px solid #e2e6eb; border-radius: 16px; }
.list-section h3 { margin: 0 0 11px; font-size: 17px; }
.list-section h3 span { color: #84929e; font-size: 12px; }
.admin-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 0; border-top: 1px solid #edf0f3; }
.admin-row > div:first-child { display: grid; gap: 5px; min-width: 0; }
.admin-row strong { overflow-wrap: anywhere; font-size: 16px; }
.admin-row small, .no-data { color: #65727d; font-size: 14px; }
.row-actions { display: flex; align-items: center; gap: 7px; }
.operating-label { display: flex; align-items: center; gap: 7px; color: #5d6872; font-size: 14px; white-space: nowrap; }
.operating-label select { min-width: 100px; }
.photo-upload { position:relative; display:inline-flex; align-items:center; min-height:44px; box-sizing:border-box; overflow:hidden; padding:9px 14px; border-radius:14px; background:#ecf2f6; color:#31526d; cursor:pointer; white-space:nowrap; font-size:14px; font-weight:700; }
.photo-upload input { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; }
.photo-upload:focus-within { outline:2px solid #286caa; outline-offset:2px; }
.review-admin-row small { max-width:70ch; overflow-wrap:anywhere; line-height:1.6; }
.admin-photo-preview { width:90px; height:68px; border-radius:7px; object-fit:cover; }
.panel-message { padding: 26px; background: #fff; border-radius: 14px; color: #65727d; }
.panel-message.error { display: flex; align-items: center; justify-content: space-between; }
@media (max-width: 800px) { .editor-grid { grid-template-columns: 1fr; } .admin-row { align-items: flex-start; flex-direction: column; } .row-actions { flex-wrap: wrap; } }
</style>
