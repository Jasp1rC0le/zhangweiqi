<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowLeft, ArrowRight, Close, FullScreen } from '@element-plus/icons-vue'
import { canteenGalleryPhotoUrl, getMerchantPhotos } from '@/api/canteen'
const props = defineProps({ merchant: { type: Object, required: true }, scope: String })
const emit = defineEmits(['close'])
const dialog = ref(), photos = ref([{ id: 0 }]), selected = ref(0), loading = ref(true), error = ref(''), imageError = ref(false)
const request = new AbortController(), owner = props.scope, merchantId = props.merchant.id
let disposed = false
const url = computed(() => canteenGalleryPhotoUrl(merchantId, photos.value[selected.value]?.id ?? 0))
function move(delta) { selected.value = (selected.value + delta + photos.value.length) % photos.value.length }
watch(url, () => { imageError.value = false })
watch(() => [props.scope, props.merchant.id], () => emit('close'), { flush: 'sync' })
onMounted(async () => {
  dialog.value?.showModal()
  try {
    const result = await getMerchantPhotos(merchantId, { signal: request.signal })
    if (disposed || props.scope !== owner) return
    if (!Array.isArray(result) || !result.length || result.length > 10 || new Set(result.map(p => p?.id)).size !== result.length
      || result.some(p => !Number.isSafeInteger(p?.id) || p.id < 0)) throw new Error('照片列表未能核对')
    photos.value = result
  } catch (e) {
    if (!disposed && props.scope === owner) error.value = e.response?.status === 404 ? '商家已下架，无法继续查看' : '其余照片未能读取，可关闭后重试'
  } finally { if (!disposed) loading.value = false }
})
onBeforeUnmount(() => { disposed = true; request.abort(); dialog.value?.close() })
</script>
<template>
  <dialog ref="dialog" class="merchant-viewer" aria-labelledby="merchant-viewer-title" @close="emit('close')" @keydown.left.prevent="move(-1)" @keydown.right.prevent="move(1)">
    <header><h2 id="merchant-viewer-title">{{ merchant.name }}</h2><button type="button" aria-label="关闭菜单照片" autofocus @click="dialog.close()"><el-icon><Close /></el-icon></button></header>
    <div class="merchant-viewer-stage">
      <img v-if="!imageError" :src="url" :alt="`${merchant.name}第${selected + 1}张菜单照片`" @error="imageError = true" />
      <p v-else role="alert">这张图片暂时无法显示</p>
    </div>
    <footer>
      <span role="status">{{ loading ? '正在读取菜单…' : `${selected + 1} / ${photos.length}` }}</span>
      <div class="merchant-viewer-controls"><button v-if="photos.length > 1" type="button" aria-label="上一张菜单" @click="move(-1)"><el-icon><ArrowLeft /></el-icon></button><button v-if="photos.length > 1" type="button" aria-label="下一张菜单" @click="move(1)"><el-icon><ArrowRight /></el-icon></button><a :href="url" target="_blank" rel="noopener noreferrer" aria-label="在新页面放大图片"><el-icon><FullScreen /></el-icon></a></div>
    </footer>
    <nav v-if="photos.length > 1" class="merchant-viewer-strip" aria-label="选择菜单照片"><button v-for="(photo,index) in photos" :key="photo.id" type="button" :aria-label="`查看第${index + 1}张菜单`" :aria-pressed="selected === index" @click="selected=index"><img :src="canteenGalleryPhotoUrl(merchantId,photo.id)" alt="" loading="lazy" /></button></nav>
    <p v-if="error" class="merchant-viewer-error" role="alert">{{ error }}</p>
    <small>价格与供应以窗口为准</small>
  </dialog>
</template>
<style scoped>
.merchant-viewer{box-sizing:border-box;width:min(1040px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:20px;border:0;border-radius:16px;background:#fff;color:#29323c;box-shadow:0 20px 70px #18202d40;overflow:auto;font-family:inherit}
.merchant-viewer::backdrop{background:#141a26a6}.merchant-viewer header,.merchant-viewer footer,.merchant-viewer-controls{display:flex;align-items:center;justify-content:space-between;gap:12px}.merchant-viewer h2{margin:0;font-size:20px;line-height:1.4;font-weight:600;letter-spacing:-.02em;overflow-wrap:anywhere}
.merchant-viewer button,.merchant-viewer a{box-sizing:border-box;display:inline-grid;place-items:center;flex:none;min-width:44px;min-height:44px;padding:10px;border:0;border-radius:10px;background:#f2f5f8;color:#455263;font:inherit;cursor:pointer;text-decoration:none}.merchant-viewer :is(button,a):hover{background:#e4ecf6}.merchant-viewer :is(button,a):focus-visible{outline:2px solid #0b62db;outline-offset:3px}.merchant-viewer .el-icon{font-size:20px}.merchant-viewer-stage{display:grid;place-items:center;min-height:230px;height:min(57dvh,560px);margin:16px 0;background:#f6f3ef;border-radius:12px;overflow:auto}.merchant-viewer-stage img{display:block;width:100%;height:100%;object-fit:contain}.merchant-viewer footer{font-size:14px;color:#5d6876;font-variant-numeric:tabular-nums}.merchant-viewer-strip{display:flex;gap:10px;overflow-x:auto;padding:12px 3px;scrollbar-color:#b5c3d2 #f2f5f8}.merchant-viewer-strip button{padding:4px;width:80px;height:60px;border:2px solid transparent}.merchant-viewer-strip button[aria-pressed=true]{border-color:#0b62db;background:#eaf2ff}.merchant-viewer-strip img{width:100%;height:100%;object-fit:contain}.merchant-viewer small{display:block;font-size:13px;color:#5d6876;margin-top:8px}.merchant-viewer-error{font-size:14px;color:#a43e42}.merchant-viewer ::selection{background:#eaf2ff}
@media(max-width:600px){.merchant-viewer{padding:16px;width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}.merchant-viewer h2{font-size:18px}.merchant-viewer-stage{height:52dvh;min-height:200px}}
</style>
