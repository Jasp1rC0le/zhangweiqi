<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ArrowRight, Search, StarFilled, Pointer, Food } from '@element-plus/icons-vue'
import {
  canteenMerchantPhotoUrl,
  getCanteens,
  getCanteenMerchants,
  getCanteenMerchantReviews,
  rateCanteenMerchant,
  likeCanteenReview,
  reportCanteenReview,
} from '@/api/canteen'
import { useAuthStore } from '@/stores/auth'
import CanteenFoodArt from '@/components/CanteenFoodArt.vue'
import MerchantPhotoViewer from '@/components/MerchantPhotoViewer.vue'
import { merchantCategories, inMerchantCategory, merchantPlaceLabel, orderCanteens, canteenFilterLabel } from '@/utils/merchantCategories'
import { selectMerchants } from '@/utils/merchantList'
import { createLatestRequest } from '@/utils/latestRequest'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { userSessionGeneration } from '@/api/http'
import { pendingCanteenDraftIds, reconcileCanteenDraft } from '@/utils/canteenDrafts'
import { animateContentChange, stopContentMotion } from '@/utils/interactionMotion'
import MotionSelection from '@/components/MotionSelection.vue'
import { merchantPhotoShape, rememberMerchantPhotoShape } from '@/utils/merchantPhotoShape'

defineProps({ demo: Boolean })
const auth = useAuthStore()
const canteens = ref([])
const merchants = ref([])
const orderedCanteens = computed(() => orderCanteens(canteens.value))
const canteenCounts = computed(() => merchants.value.reduce((counts, merchant) => {
  counts[merchant.canteenId] = (counts[merchant.canteenId] || 0) + 1
  return counts
}, {}))
const selectedCanteen = ref('all')
const selectedCategory = ref('all')
const catalogRoot = ref()
const ratingDrafts = reactive({})
const loading = ref(true)
const loadError = ref('')
const savingId = ref(null)
const likingId = ref(null)
const reportingReview = ref(null), reportReason = ref('内容不实'), reportingBusy = ref(false)
const expandedId = ref(null)
const photoMerchant = ref(null)
const photoShapes = reactive({}), photoFailures = reactive({})
const reviews = reactive({})
const reviewErrors = reactive({})
const reviewLoading = reactive({})
const comments = reactive({})
const savedScores = reactive({}), savedComments = reactive({})
const actionErrors = reactive({}), actionStatus = reactive({})
const writeBusy = computed(() => savingId.value !== null || likingId.value !== null || reportingBusy.value)
const pendingDraftIds = computed(() => pendingCanteenDraftIds(ratingDrafts, comments, savedScores, savedComments))
useUnsavedChanges(() => pendingDraftIds.value.length > 0, () => writeBusy.value)
const scope = computed(() => auth.user ? `${auth.user.id}:${auth.user.schoolId}:${auth.user.role}:${userSessionGeneration.value}` : '')
let disposed = false, lifetime = new AbortController()
const reviewRequests = new Map()
const searchQuery = ref('')
const sortBy = ref('default')
const canRate = computed(() => ['STUDENT','TEACHER','COUNSELOR','SECRETARY','ADMIN'].includes(auth.user?.role))
const visibleMerchants = computed(() =>
  selectMerchants(merchants.value, {
    canteen: selectedCanteen.value,
    query: searchQuery.value,
    sort: sortBy.value,
  }).filter(merchant => inMerchantCategory(merchant, selectedCategory.value)),
)
function animateCatalogChange() {
  if (!disposed && scope.value && !loading.value && !loadError.value)
    animateContentChange(catalogRoot.value?.querySelector('.merchant-catalog, .table-empty'), window, {
      distance: 10, opacity: .4, duration: 280,
    })
}
watch([selectedCanteen, selectedCategory, sortBy], animateCatalogChange, { flush: 'post' })
function reviewTime(value) {
  const date=new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value)?value:value+'+08:00')
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date):'时间未知'
}

function resetFilters() {
  const searchOnly = searchQuery.value && selectedCanteen.value === 'all' && selectedCategory.value === 'all'
  searchQuery.value = ''
  selectedCanteen.value = 'all'
  selectedCategory.value = 'all'
  if (searchOnly) nextTick(animateCatalogChange)
}

function applyMerchants(rows) {
  merchants.value = rows
  for (const merchant of rows) {
    const score = merchant.myScore || 0
    ratingDrafts[merchant.id] = reconcileCanteenDraft(ratingDrafts[merchant.id], savedScores[merchant.id], score)
    savedScores[merchant.id] = score
  }
}
const listRequest = createLatestRequest({
  load: options => Promise.all([getCanteens(options), getCanteenMerchants(options)]),
  onStart: () => { loading.value = true; loadError.value = ''; photoMerchant.value = null },
  onSuccess: ([places, rows]) => { canteens.value = places; applyMerchants(rows) },
  onError: error => { loadError.value = error.response?.data?.message || '暂时无法读取食堂信息，请稍后重试' },
  onFinish: () => { loading.value = false },
})
function load() {
  if (!disposed && scope.value && !writeBusy.value) return listRequest.run()
}
function applyReviews(id, rows) {
  reviews[id] = rows
  const comment = rows.find(item => item.mine)?.comment || ''
  comments[id] = reconcileCanteenDraft(comments[id], savedComments[id], comment)
  savedComments[id] = comment
}
function reviewRequest(id) {
  if (!reviewRequests.has(id)) reviewRequests.set(id, createLatestRequest({
    load: options => getCanteenMerchantReviews(id, options),
    onStart: () => { reviewLoading[id] = true; reviewErrors[id] = '' },
    onSuccess: rows => applyReviews(id, rows),
    onError: error => { reviewErrors[id] = error.response?.data?.message || '短评未能读取，请重试；未保存的填写仍在本页' },
    onFinish: () => { reviewLoading[id] = false },
  }))
  return reviewRequests.get(id)
}
function readReviews(merchant) {
  if (!disposed && scope.value && !writeBusy.value && !reviewLoading[merchant.id]) return reviewRequest(merchant.id).run()
}

function toggleReviews(merchant) {
  if (expandedId.value === merchant.id) {
    expandedId.value = null
    return
  }
  expandedId.value = merchant.id
  readReviews(merchant)
}
function rememberPhotoShape(id, event) {
  const image = event.target
  const shape = rememberMerchantPhotoShape(canteenMerchantPhotoUrl(id), image.naturalWidth, image.naturalHeight)
  if (shape) photoShapes[id] = shape
}

async function submitRating(merchant, includeComment = false) {
  if (!canRate.value || !ratingDrafts[merchant.id] || writeBusy.value || loading.value || disposed) return
  const owner = scope.value, score = ratingDrafts[merchant.id]
  const comment = includeComment ? (comments[merchant.id] || '').trim() : undefined
  const current = () => !disposed && owner === scope.value
  savingId.value = merchant.id
  actionErrors[merchant.id] = ''; actionStatus[merchant.id] = ''
  reviewRequest(merchant.id).cancel()
  try {
    // Undefined means leave existing comment untouched, not delete it.
    const rows = await rateCanteenMerchant(merchant.id, score, comment, { signal: lifetime.signal })
    if (!current()) return
    applyMerchants(rows)
    if (includeComment) { comments[merchant.id] = comment; savedComments[merchant.id] = comment }
    actionStatus[merchant.id] = includeComment ? comment ? '评价已保存' : '评分已保存，短评已清空' : '评分已保存'
    if (expandedId.value === merchant.id) {
      await reviewRequest(merchant.id).run()
      const mine=reviews[merchant.id]?.find(item=>item.mine)
      if (current() && includeComment && comment && mine && !reviewErrors[merchant.id]) actionStatus[merchant.id]=mine.status==='PUBLISHED'?'评价已发布':'评价已保存，当前未公开'
    }
  } catch (error) {
    if (current()) actionErrors[merchant.id] = error.response?.data?.message || '未能确认保存成功，评分与短评仍保留在本页，请重试'
  } finally {
    if (current()) savingId.value = null
  }
}

async function likeReview(merchant, review) {
  if (writeBusy.value || loading.value || review.mine || !canRate.value || disposed) return
  const owner = scope.value, current = () => !disposed && owner === scope.value
  likingId.value = review.id
  actionErrors[merchant.id] = ''; actionStatus[merchant.id] = ''
  reviewRequest(merchant.id).cancel()
  try {
    const rows = await likeCanteenReview(merchant.id, review.id, !review.liked, { signal: lifetime.signal })
    if (!current()) return
    applyReviews(merchant.id, rows)
    const confirmed = reviews[merchant.id].find((item) => item.id === review.id)
    if (confirmed && merchant.featuredReview?.id === review.id)
      Object.assign(merchant.featuredReview, confirmed)
    try {
      const next = await getCanteenMerchants({ signal: lifetime.signal })
      if (current()) applyMerchants(next)
    } catch {
      if (current()) actionStatus[merchant.id] = '点赞状态已保存，神评排序暂未刷新'
    }
  } catch (error) {
    if (current()) actionErrors[merchant.id] = error.response?.data?.message || '未能确认点赞状态，请重试'
  } finally {
    if (current()) likingId.value = null
  }
}

async function reportReview(merchant, review) {
  if (writeBusy.value || disposed || !scope.value) return
  const owner=scope.value; reportingBusy.value=true; actionErrors[merchant.id]=''
  try {
    await reportCanteenReview(merchant.id,review.id,reportReason.value,{signal:lifetime.signal})
    if (disposed || owner!==scope.value) return
    reportingReview.value=null;actionStatus[merchant.id]='举报已提交，管理员可核实并下架'
  } catch(e) { if (!disposed && owner===scope.value) actionErrors[merchant.id]=e.response?.data?.message || '举报未确认成功，请稍后核对' }
  finally { if (!disposed && owner===scope.value) reportingBusy.value=false }
}

watch(scope, (next, previous) => {
  if (!previous) return
  lifetime.abort(); lifetime = new AbortController(); listRequest.cancel()
  for (const request of reviewRequests.values()) request.dispose()
  reviewRequests.clear()
  for (const values of [ratingDrafts, comments, savedScores, savedComments, reviews, reviewLoading, reviewErrors, actionErrors, actionStatus, photoShapes, photoFailures]) {
    for (const key of Object.keys(values)) delete values[key]
  }
  merchants.value = []; canteens.value = []; expandedId.value = null
  photoMerchant.value = null
  selectedCategory.value = 'all'
  savingId.value = null; likingId.value = null
  reportingReview.value=null;reportingBusy.value=false
  if (next) load()
}, { flush: 'sync' })
onBeforeUnmount(() => {
  stopContentMotion(catalogRoot.value?.querySelector('.merchant-catalog, .table-empty'))
  disposed = true; lifetime.abort(); listRequest.dispose()
  for (const request of reviewRequests.values()) request.dispose()
})

onMounted(async () => {
  if (!auth.user) {
    try {
      await auth.loadCurrentUser()
    } catch {
      return
    }
  }
  if (!disposed) await load()
})
</script>

<template>
  <div ref="catalogRoot" class="table-page">
    <main class="table-main">
      <aside v-if="demo" class="table-demo" role="note">
        <strong>交互样例</strong
        ><span>虚构商家、插画与评分，仅供验收 · 操作只留在本页，刷新即重置</span>
      </aside>
      <section class="table-intro">
        <div>
          <h1>今天吃什么<span>？</span></h1>
        </div>
      </section>
      <div v-if="loading" class="table-empty" aria-busy="true">正在加载商家…</div>
      <div v-else-if="loadError" class="table-empty" role="alert">
        <h2>暂时没能读到商家</h2>
        <p>{{ loadError }}</p>
        <button @click="load">重新加载</button>
      </div>
      <template v-else>
        <div v-if="pendingDraftIds.length" class="table-draft-notice" role="status">
          <span>{{ pendingDraftIds.length }} 家评价尚未保存</span>
          <button v-if="pendingDraftIds.length && (searchQuery || selectedCanteen !== 'all' || selectedCategory !== 'all')" type="button" class="table-text-button" @click="resetFilters">显示全部商家</button>
        </div>
        <div v-if="merchants.length" class="table-tools">
          <label class="table-search"
            ><el-icon><Search /></el-icon
            ><input
              v-model="searchQuery"
              type="search"
              placeholder="搜索店铺或口味"
              aria-label="搜索商家"
          /></label>
          <select v-model="sortBy" aria-label="商家排序">
            <option value="default">综合推荐</option>
            <option value="rating">评分最高</option>
            <option value="popular">评分人数最多</option>
          </select>
        </div>
        <nav v-if="merchants.length && canteens.length > 1" class="table-filters" aria-label="选择食堂">
          <MotionSelection :active-key="selectedCanteen" />
          <button
            :class="{ active: selectedCanteen === 'all' }"
            :aria-pressed="selectedCanteen === 'all'"
            @click="selectedCanteen = 'all'"
          >
            全部 <span>{{ merchants.length }}</span>
          </button>
          <button
            v-for="canteen in orderedCanteens"
            :key="canteen.id"
            :aria-label="`${canteen.name}，${canteenCounts[canteen.id] || 0}个窗口`"
            :title="canteen.name"
            :class="{ active: selectedCanteen === canteen.id }"
            :aria-pressed="selectedCanteen === canteen.id"
            @click="selectedCanteen = canteen.id"
          >
            {{ canteenFilterLabel(canteen) }} <span>{{ canteenCounts[canteen.id] || 0 }}</span>
          </button>
        </nav>
        <nav v-if="merchants.length" class="table-categories" aria-label="按想吃的类型筛选">
          <MotionSelection :active-key="selectedCategory" />
          <button v-for="category in merchantCategories" :key="category.id" type="button" :aria-pressed="selectedCategory === category.id" @click="selectedCategory = category.id">{{ category.label }}</button>
        </nav>
        <div v-if="merchants.length" class="table-list-heading">
          <h2>
            店铺 <span>{{ visibleMerchants.length }} 家</span>
          </h2>
          <span>校园评价</span>
        </div>
        <section v-if="!visibleMerchants.length" class="table-empty">
          <el-icon><Food /></el-icon>
          <h2>{{ merchants.length ? '没有匹配的店铺' : '商家即将开放' }}</h2>
          <p>{{ merchants.length ? '换个口味搜搜' : '核实后上架，欢迎来尝鲜' }}</p>
          <button
            v-if="merchants.length"
            @click="resetFilters"
          >
            查看全部商家
          </button>
        </section>
        <section v-else class="table-list merchant-catalog" aria-label="商家口碑列表">
          <article
            v-for="merchant in visibleMerchants"
            :key="merchant.id"
            class="table-card"
            :class="{ 'table-card--wide': merchant.hasPhoto && (photoShapes[merchant.id] || merchantPhotoShape(canteenMerchantPhotoUrl(merchant.id))) === 'wide', 'table-card--expanded': expandedId === merchant.id }"
            :aria-label="merchant.name"
          >
            <div class="merchant-overview">
              <button class="merchant-media" type="button" :disabled="!merchant.hasPhoto" :aria-label="merchant.hasPhoto ? `查看${merchant.name}菜单照片` : `${merchant.name}暂无照片`" @click="photoMerchant = { id: merchant.id, name: merchant.name }">
                <CanteenFoodArt v-if="demo && merchant.demoArt" :kind="merchant.demoArt" />
                <img
                  v-else-if="merchant.hasPhoto && !photoFailures[merchant.id]"
                  :src="canteenMerchantPhotoUrl(merchant.id, '', true)"
                  :alt="merchant.name + '照片'"
                  loading="lazy"
                  decoding="async"
                  @load="rememberPhotoShape(merchant.id, $event)"
                  @error="photoFailures[merchant.id] = true"
                />
                <span v-else class="table-no-photo" aria-label="暂无店铺照片"
                  ><el-icon><Food /></el-icon></span
                >
                <span v-if="merchant.hasPhoto" class="merchant-media-caption">菜单<el-icon><ArrowRight /></el-icon></span>
              </button>
              <div class="merchant-details">
                <h3>{{ merchant.name }}</h3>
                <p class="table-location">
                  {{ merchantPlaceLabel(merchant) }}
                </p>
                <span v-if="merchant.operatingStatus === 'CLOSED'" class="table-status"
                  >暂停营业</span
                >
              </div>
              <div class="merchant-score">
                <strong>{{
                  merchant.ratingCount ? Number(merchant.averageScore).toFixed(1) : '—'
                }}</strong
                ><span>{{
                  merchant.ratingCount ? merchant.ratingCount + ' 人评分' : '暂无评分'
                }}</span
                >
              </div>
            </div>
            <div v-if="merchant.featuredReview" class="table-featured">
              <span class="table-featured-tag">{{
                merchant.featuredReview.likes ? '神评' : '同学说'
              }}</span>
              <p>{{ merchant.featuredReview.comment }}</p>
              <button
                :disabled="!canRate || merchant.featuredReview.mine || writeBusy"
                :aria-pressed="merchant.featuredReview.liked"
                :aria-label="
                  (merchant.featuredReview.liked ? '取消点赞' : '点赞') + merchant.name + '的神评'
                "
                @click="likeReview(merchant, merchant.featuredReview)"
              >
                <el-icon><Pointer /></el-icon><span>{{ merchant.featuredReview.likes }}</span>
              </button>
            </div>
            <div class="table-card-actions">
              <div v-if="canRate" class="merchant-quick-rating">
                <div class="table-stars" role="group" :aria-label="'给' + merchant.name + '评分'">
                  <button v-for="score in 5" :key="score" type="button" :class="{ filled: score <= ratingDrafts[merchant.id] }" :aria-label="score + '分'" :aria-pressed="ratingDrafts[merchant.id] === score" :disabled="writeBusy || loading" @click="ratingDrafts[merchant.id] = score; actionStatus[merchant.id] = ''; actionErrors[merchant.id] = ''"><el-icon><StarFilled /></el-icon></button>
                </div>
                <button v-if="ratingDrafts[merchant.id] !== savedScores[merchant.id]" class="table-save-score" type="button" :disabled="writeBusy || loading || !ratingDrafts[merchant.id]" @click="submitRating(merchant)">{{ savingId === merchant.id ? '保存中…' : '保存' }}</button>
              </div>
              <button
                class="table-review-toggle"
                :aria-expanded="expandedId === merchant.id"
                :aria-controls="'reviews-' + merchant.id"
                @click="toggleReviews(merchant)"
              >
                {{ expandedId === merchant.id ? '收起' : merchant.reviewCount ? '短评 ' + merchant.reviewCount : '短评'
                }}<el-icon><ArrowRight /></el-icon>
              </button>

            </div>
            <p v-if="actionErrors[merchant.id]" class="table-action-feedback is-error" role="alert">{{ actionErrors[merchant.id] }}</p>
            <p v-else-if="actionStatus[merchant.id]" class="table-action-feedback" role="status">{{ actionStatus[merchant.id] }}</p>
            <Transition name="table-expand">
              <section
                v-if="expandedId === merchant.id"
                :id="'reviews-' + merchant.id"
                class="table-reviews"
                aria-label="短评与评分"
              >
                <p v-if="reviewLoading[merchant.id]" role="status">正在读取短评…</p>
                <div v-else-if="reviewErrors[merchant.id]" role="alert">
                  {{ reviewErrors[merchant.id] }}
                  <button class="table-text-button" @click="readReviews(merchant)">重试</button>
                </div>
                <template v-else>
                  <form
                    v-if="canRate"
                    class="table-comment-form"
                    @submit.prevent="submitRating(merchant, true)"
                  >
                    <label :for="'comment-' + merchant.id"
                      >短评 <span>选填</span></label
                    ><textarea
                      :id="'comment-' + merchant.id"
                      v-model="comments[merchant.id]"
                      @input="actionStatus[merchant.id] = ''; actionErrors[merchant.id] = ''"
                      rows="2"
                      maxlength="500"
                      placeholder="写短评"
                      :disabled="writeBusy"
                    />
                    <div class="table-comment-meta">
                      <span v-if="savedComments[merchant.id] && comments[merchant.id] !== savedComments[merchant.id] && reviews[merchant.id]?.some(review => review.mine && review.likes > 0)">修改后旧点赞将清空</span>
                      <span v-if="comments[merchant.id]?.length">{{ comments[merchant.id].length }}/500</span>
                    </div>
                    <div class="table-comment-footer">
                      <span v-if="ratingDrafts[merchant.id]">{{ ratingDrafts[merchant.id] }}/5</span>
                      <button type="submit" :disabled="!ratingDrafts[merchant.id] || writeBusy">
                        {{ savingId === merchant.id ? '发布中…' : '公开发布' }}
                      </button>
                    </div>
                  </form>
                  <div v-for="review in reviews[merchant.id]" :key="review.id" class="table-review">
                    <div>
                      <strong
                        >{{ review.mine ? '我' : '一位校园用户'
                        }}<span>{{ review.score }} 分</span></strong
                      >
                      <p>{{ review.comment }}</p><time v-if="review.updatedAt" class="merchant-review-time">{{reviewTime(review.updatedAt)}}</time>
                      <small v-if="review.status !== 'PUBLISHED'">{{
                        review.status === 'PENDING' ? '待审核，仅你可见' : '未公开，仅你可见'
                      }}</small>
                    </div>
                    <div v-if="!review.mine" class="merchant-review-actions"><button type="button" :disabled="writeBusy" @click="reportingReview=review.id">举报</button>
                    <button
                      v-if="review.status === 'PUBLISHED' && !review.mine && canRate"
                      :disabled="writeBusy"
                      :aria-pressed="review.liked"
                      :aria-label="(review.liked ? '取消点赞' : '点赞') + '短评：' + review.comment"
                      @click="likeReview(merchant, review)"
                    >
                      <el-icon><Pointer /></el-icon>{{ review.likes }}
                    </button></div>
                    <form v-if="reportingReview===review.id" class="merchant-report-form" @submit.prevent="reportReview(merchant,review)"><label>举报原因<select v-model="reportReason" :disabled="writeBusy"><option v-for="reason in ['隐私泄露','辱骂攻击','广告诈骗','内容不实','其他问题']" :key="reason">{{reason}}</option></select></label><button type="submit" :disabled="writeBusy">提交举报</button><button type="button" :disabled="writeBusy" @click="reportingReview=null">取消</button></form>
                  </div>
                  <small v-if="reviews[merchant.id]?.length" class="table-review-limit"
                    >最近20条 · 我的评价优先</small
                  >
                  <p v-if="!canRate" class="review-account-note">当前账号仅可查看评价。</p>

                </template>
              </section>
            </Transition>
          </article>
        </section>
        <details class="table-rules">
          <summary>评分规则</summary>
          <p>
            每个本校账号对一家商家只计一条评分，可以修改。综合推荐使用 5 票、3.5
            分的先验平滑，降低少量评分冲榜的影响；展示分数仍是真实评分均值。神评仅从公开的短评中按点赞数选出，同赞时展示较新的一条，无赞时显示“同学说”。点赞不影响商家星级。
          </p>
          <p>
            短评不公开账号和姓名；自动检查通过直接公开，管理员可根据举报下架。点击评价旁的“举报”可提交问题。手机号等明显敏感信息会被拦截，但规则无法识别所有隐私，发布前请自行核对。
          </p>
        </details>
      </template>
    </main>
    <MerchantPhotoViewer v-if="photoMerchant" :merchant="photoMerchant" :scope="scope" @close="photoMerchant=null" />
  </div>
</template>

<style scoped>
.table-page {
  color: var(--assistant-ink, #29323c);
  --menu-accent: #a34c1f;
  --menu-muted: #6f5948;
  --menu-line: #efdfd2;
  --menu-soft: #fff4e7;
}
.table-main { max-width: 1180px; margin: auto; padding: 24px 24px 64px; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; touch-action: manipulation; }
button:disabled { cursor: default; opacity: .55; }
:is(button, input, select, textarea, summary):focus-visible { outline: 2px solid var(--menu-accent); outline-offset: 3px; }
.table-demo { display: flex; gap: 12px; padding: 12px 16px; border-radius: 12px; background: #edf0fd; font-size: 13px; line-height: 1.6; }
.table-intro { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-bottom: 20px; }
.table-intro h1 { margin: 0; font-size: 30px; font-weight: 600; line-height: 1.25; letter-spacing: -.025em; }
.table-intro h1 span { color: var(--menu-accent); }
.table-tools { display: flex; gap: 12px; padding: 0; }
.table-search { display: flex; align-items: center; flex: 1; min-width: 0; gap: 8px; padding: 0 12px; }
.table-search .el-icon { flex: none; font-size: 18px; color: var(--menu-muted); }
.table-search input { width: 100%; min-width: 0; height: 44px; border: 0; background: transparent; color: inherit; font-size: 16px; }
.table-search input::placeholder, textarea::placeholder { color: var(--menu-muted); }
.table-tools select { min-height: 44px; max-width: 140px; padding: 0 12px; border: 1px solid var(--menu-line); border-radius: 12px; background: #fff; color: var(--menu-muted); font-size: 14px; }
.table-filters, .table-categories { display: flex; gap: 8px; max-width: 100%; overflow-x: auto; padding: 0 0 8px; scrollbar-color: #c6b5a8 transparent; }
:is(.table-filters, .table-categories) button { flex: none; min-height: 44px; padding: 8px 16px; border: 0; border-radius: 12px; background: #f8f2ec; color: var(--menu-muted); font-size: 14px; }
:is(.table-filters, .table-categories) button:is(.active, [aria-pressed='true']) { background: var(--menu-accent); color: #fff; }
:is(.table-filters, .table-categories) button:hover:not(.active, [aria-pressed='true']) { background: #f0e5da; }
.table-filters span { margin-left: 4px; }
.table-list-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.table-list-heading h2 { margin: 0; font-size: 16px; font-weight: 600; }
.table-list-heading h2 span, .table-list-heading > span { margin-left: 8px; color: var(--menu-muted); font-size: 12px; font-weight: 400; }
.merchant-catalog { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); align-items: start; gap: 12px; }
.table-card { min-width: 0; padding: 16px; border: 1px solid var(--menu-line); border-radius: 16px; background: #fff; }
.merchant-overview { display: grid; grid-template-columns: 80px minmax(0, 1fr); grid-template-rows: auto 1fr; align-items: start; gap: 8px 12px; }
.merchant-media { position: relative; grid-column: 1; grid-row: 1 / span 2; display: block; width: 100%; aspect-ratio: 1; padding: 0; overflow: hidden; border: 0; border-radius: 12px; background: #f7f3ed; cursor: zoom-in; }
.merchant-media:disabled { opacity: 1; cursor: default; }
.merchant-media img, .merchant-media :deep(svg) { display: block; width: 100%; height: 100%; object-fit: contain; }
.merchant-media-caption { position: absolute; right: 4px; bottom: 4px; display: inline-flex; align-items: center; gap: 2px; padding: 4px 6px; border-radius: 6px; background: #fff9f1; color: #733b1d; font-size: 11px; line-height: 1.4; }
.table-no-photo { display: grid; place-items: center; width: 100%; height: 100%; color: var(--menu-muted); }
.table-no-photo .el-icon { font-size: 28px; }
.merchant-details { grid-column: 2; min-width: 0; }
.merchant-details h3 { margin: 0; font-size: 18px; line-height: 1.4; font-weight: 600; letter-spacing: -.02em; overflow-wrap: anywhere; }
.table-location { margin: 4px 0 0; color: var(--menu-muted); font-size: 12px; line-height: 1.5; }
.table-description { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; overflow: hidden; margin: 4px 0 0; color: var(--menu-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.table-status { display: inline-block; padding: 2px 6px; margin-top: 4px; border-radius: 4px; background: var(--menu-soft); color: #874624; font-size: 12px; }
.merchant-score { grid-column: 2; display: flex; align-items: baseline; gap: 8px; font-variant-numeric: tabular-nums; }
.merchant-score strong { color: var(--menu-accent); font-size: 26px; font-weight: 600; line-height: 1.15; }
.merchant-score span { color: var(--menu-muted); font-size: 12px; }
.table-card--wide .merchant-overview { grid-template-columns: minmax(0, 1fr) auto; }
.table-card--wide .merchant-media { grid-column: 1 / -1; grid-row: 1; height: 112px; aspect-ratio: auto; margin-bottom: 4px; }
.table-card--wide .merchant-details { grid-column: 1; grid-row: 2; }
.table-card--wide .merchant-score { grid-column: 2; grid-row: 2; flex-direction: column; align-items: end; gap: 4px; }
.table-card-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; margin-top: 8px; }
.merchant-quick-rating { display: flex; flex: 1 1 220px; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: min(100%, 220px); }
.table-stars { display: flex; flex: none; flex-wrap: wrap; max-width: 100%; }
.table-stars button { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; color: #8d958e; font-size: 23px; border-radius: 8px; }
.table-stars button.filled { color: var(--menu-accent); }
.table-stars button:hover:not(:disabled) { background: var(--menu-soft); color: var(--menu-accent); }
.table-review-toggle, .table-text-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; padding: 0 4px; border: 0; background: transparent; color: var(--menu-muted); font-size: 13px; }
.table-review-toggle[aria-expanded='true'] .el-icon { transform: rotate(90deg); }
.table-save-score, .table-comment-footer button, .table-empty button { min-height: 44px; padding: 8px 16px; border: 0; border-radius: 12px; background: var(--menu-accent); color: #fff; font-size: 14px; }
.table-save-score:hover:not(:disabled), .table-comment-footer button:hover:not(:disabled) { background: #853913; }
.table-featured { display: flex; align-items: center; gap: 8px; margin: 12px 0 0; padding-top: 8px; border-top: 1px solid var(--menu-line); }
.table-featured-tag { flex: none; font-size: 12px; color: var(--menu-accent); }
.table-featured p { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; flex: 1; overflow: hidden; margin: 0; font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.table-card--expanded .table-featured p { display: block; -webkit-line-clamp: unset; overflow: visible; }
.table-featured button, .merchant-review-actions button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 44px; min-height: 44px; padding: 4px 8px; border: 0; border-radius: 8px; background: transparent; color: var(--menu-muted); font-size: 13px; }
.table-featured button[aria-pressed='true'], .merchant-review-actions button[aria-pressed='true'] { background: var(--menu-soft); color: var(--menu-accent); }
.table-draft-notice { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; color: var(--menu-muted); font-size: 13px; }
.table-action-feedback { margin: 8px 0 0; color: var(--menu-accent); font-size: 13px; line-height: 1.6; overflow-wrap: anywhere; }
.table-action-feedback.is-error { color: var(--assistant-danger, #bf303d); }
.table-reviews { margin-top: 8px; padding-top: 12px; border-top: 1px solid var(--menu-line); font-size: 14px; line-height: 1.6; }
.table-comment-form { margin: 0; }
.table-comment-form label { display: block; margin-bottom: 8px; font-size: 14px; }
.table-comment-form label span { margin-left: 8px; color: var(--menu-muted); font-size: 12px; }
.table-comment-form textarea { box-sizing: border-box; display: block; width: 100%; min-height: 72px; padding: 10px 12px; resize: vertical; border: 1px solid var(--menu-line); border-radius: 12px; background: #fffdf9; color: inherit; font-size: 16px; line-height: 1.5; }
.table-comment-meta { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 12px; line-height: 1.5; color: var(--menu-muted); }
.table-comment-meta > span:last-child { white-space: nowrap; }
.table-comment-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 13px; color: var(--menu-muted); }
.table-review { display: flex; align-items: start; flex-wrap: wrap; gap: 8px; padding: 12px 0; border-bottom: 1px solid var(--menu-line); }
.table-review > div:first-child { flex: 1; min-width: 0; }
.table-review strong { font-size: 13px; font-weight: 500; }
.table-review strong span { margin-left: 8px; color: var(--menu-accent); }
.table-review p { margin: 4px 0 0; overflow-wrap: anywhere; }
.table-review small, .merchant-review-time { display: block; margin-top: 4px; color: var(--menu-muted); font-size: 12px; }
.merchant-review-actions { display: flex; flex: none; }
.merchant-report-form { display: flex; flex-basis: 100%; align-items: end; gap: 8px; flex-wrap: wrap; }
.merchant-report-form label { display: grid; gap: 4px; }
.merchant-report-form select { max-width: 100%; min-height: 44px; padding: 8px; border: 1px solid var(--menu-line); border-radius: 8px; font-size: 16px; }
.merchant-report-form button { min-height: 44px; padding: 8px 12px; border: 0; border-radius: 8px; background: var(--menu-soft); color: var(--menu-accent); }
.table-review-empty, .table-review-limit, .review-account-note { display: block; margin: 12px 0 0; color: var(--menu-muted); font-size: 12px; }
.table-rules { margin-top: 20px; color: var(--menu-muted); font-size: 13px; line-height: 1.7; }
.table-rules summary { min-height: 44px; align-content: center; cursor: pointer; }
.table-rules p { margin: 0 0 12px; max-width: 70ch; }
.table-empty { padding: 32px 20px; text-align: center; }
.table-empty h2 { font-size: 20px; }
.table-empty p { line-height: 1.6; }
.table-page ::selection { background: #ffe5c9; color: #493b32; }
textarea { caret-color: var(--menu-accent); }
@media (max-width: 600px) {
  .table-main { padding: 20px 16px 48px; }
  .table-tools { gap: 8px; }
  .table-tools select { max-width: 122px; padding-inline: 8px; font-size: 13px; }
  .merchant-overview { grid-template-columns: 80px minmax(0, 1fr); }
  .table-card--wide .merchant-media { height: 112px; }
}
@media (prefers-reduced-motion: no-preference) {
  .table-expand-enter-active, .table-expand-leave-active { transition: opacity .18s ease; }
  .table-expand-enter-from, .table-expand-leave-to { opacity: 0; }
  .table-stars button, .table-review-toggle .el-icon { transition: color .14s ease, background-color .14s ease; }
}
</style>
