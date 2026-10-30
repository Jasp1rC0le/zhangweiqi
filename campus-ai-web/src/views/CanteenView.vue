<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
import { merchantCategories, inMerchantCategory, merchantPlaceLabel } from '@/utils/merchantCategories'
import { selectMerchants } from '@/utils/merchantList'
import { createLatestRequest } from '@/utils/latestRequest'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { userSessionGeneration } from '@/api/http'
import { pendingCanteenDraftIds, reconcileCanteenDraft } from '@/utils/canteenDrafts'

defineProps({ demo: Boolean })
const auth = useAuthStore()
const canteens = ref([])
const merchants = ref([])
const selectedCanteen = ref('all')
const selectedCategory = ref('all')
const ratingDrafts = reactive({})
const loading = ref(true)
const loadError = ref('')
const savingId = ref(null)
const likingId = ref(null)
const reportingReview = ref(null), reportReason = ref('内容不实'), reportingBusy = ref(false)
const expandedId = ref(null)
const photoMerchant = ref(null)
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
function reviewTime(value) {
  const date=new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(value)?value:value+'+08:00')
  return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date):'时间未知'
}
const scoreLabel = ['选一个星级', '不太满意', '有待改进', '还不错', '值得再来', '特别推荐']

function resetFilters() {
  searchQuery.value = ''
  selectedCanteen.value = 'all'
  selectedCategory.value = 'all'
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
function writeReview(merchant) {
  expandedId.value = merchant.id
  readReviews(merchant)
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
  for (const values of [ratingDrafts, comments, savedScores, savedComments, reviews, reviewLoading, reviewErrors, actionErrors, actionStatus]) {
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
  <div class="table-page">
    <main class="table-main">
      <aside v-if="demo" class="table-demo" role="note">
        <strong>交互样例</strong
        ><span>虚构商家、插画与评分，仅供验收 · 操作只留在本页，刷新即重置</span>
      </aside>
      <section class="table-intro">
        <div>
          <h1>今天吃什么<span>？</span></h1>
        </div>
        <div class="table-intro-note">
          <span class="table-rating-key" aria-label="满分5分"><el-icon v-for="star in 5" :key="star" aria-hidden="true"><StarFilled /></el-icon><b>5分制</b></span>
        </div>
      </section>
      <div v-if="loading" class="table-empty" aria-busy="true">正在加载商家…</div>
      <div v-else-if="loadError" class="table-empty" role="alert">
        <h2>暂时没能读到商家</h2>
        <p>{{ loadError }}</p>
        <button @click="load">重新加载</button>
      </div>
      <template v-else>
        <div class="table-draft-notice" role="status">
          <span v-if="pendingDraftIds.length">{{ pendingDraftIds.length }} 家评价尚未发布</span>
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
          <button
            :class="{ active: selectedCanteen === 'all' }"
            :aria-pressed="selectedCanteen === 'all'"
            @click="selectedCanteen = 'all'"
          >
            全部食堂 <span>{{ merchants.length }}</span>
          </button>
          <button
            v-for="canteen in canteens"
            :key="canteen.id"
            :class="{ active: selectedCanteen === canteen.id }"
            :aria-pressed="selectedCanteen === canteen.id"
            @click="selectedCanteen = canteen.id"
          >
            {{ canteen.name }}
          </button>
        </nav>
        <nav v-if="merchants.length" class="table-categories" aria-label="按想吃的类型筛选">
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
            :aria-label="merchant.name"
          >
            <div class="merchant-overview">
              <button class="merchant-media" type="button" :disabled="!merchant.hasPhoto" :aria-label="merchant.hasPhoto ? `查看${merchant.name}菜单照片` : `${merchant.name}暂无照片`" @click="photoMerchant = { id: merchant.id, name: merchant.name }">
                <CanteenFoodArt v-if="demo && merchant.demoArt" :kind="merchant.demoArt" />
                <img
                  v-else-if="merchant.hasPhoto"
                  :src="canteenMerchantPhotoUrl(merchant.id, '', true)"
                  :alt="merchant.name + '照片'"
                  loading="lazy"
                />
                <span v-else class="table-no-photo" aria-label="暂无店铺照片"
                  ><el-icon><Food /></el-icon></span
                >
                <span v-if="merchant.hasPhoto" class="merchant-media-caption">查看菜单<el-icon><ArrowRight /></el-icon></span>
              </button>
              <div class="merchant-details">
                <p class="table-location">
                  {{ merchantPlaceLabel(merchant) }}
                </p>
                <h3>{{ merchant.name }}</h3>
                <p v-if="merchant.description" class="table-description">{{ merchant.description }}</p>
                <span v-if="merchant.operatingStatus === 'CLOSED'" class="table-status"
                  >暂停营业</span
                >
              </div>
              <div class="merchant-score">
                <strong>{{
                  merchant.ratingCount ? Number(merchant.averageScore).toFixed(1) : '—'
                }}</strong
                ><span>{{
                  merchant.ratingCount ? merchant.ratingCount + ' 人评分' : '等你首评'
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
              <button class="merchant-write-review" type="button" @click="writeReview(merchant)">写评价</button>

              <button
                class="table-review-toggle"
                :aria-expanded="expandedId === merchant.id"
                :aria-controls="'reviews-' + merchant.id"
                @click="toggleReviews(merchant)"
              >
                {{ expandedId === merchant.id ? '收起短评' : '短评 ' + (merchant.reviewCount || 0)
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
              <div
                v-if="canRate"
                class="table-stars"
                role="group"
                :aria-label="'给' + merchant.name + '评分'"
              >
                <span>{{ merchant.myScore ? '我的评分' : '我来打分' }}</span
                ><button
                  v-for="score in 5"
                  type="button"
                  :key="score"
                  :class="{ filled: score <= ratingDrafts[merchant.id] }"
                  :aria-label="score + '分'"
                  :aria-pressed="ratingDrafts[merchant.id] === score"
                  :disabled="writeBusy"
                  @click="ratingDrafts[merchant.id] = score; actionStatus[merchant.id] = ''; actionErrors[merchant.id] = ''"
                >
                  <el-icon><StarFilled /></el-icon>
                </button>
              </div>
                    <label :for="'comment-' + merchant.id"
                      >写一句你的真实体验 <span>选填</span></label
                    ><textarea
                      :id="'comment-' + merchant.id"
                      v-model="comments[merchant.id]"
                      @input="actionStatus[merchant.id] = ''; actionErrors[merchant.id] = ''"
                      rows="3"
                      maxlength="500"
                      placeholder="比如：阿姨的手不抖，我的筷子停不了"
                      :disabled="writeBusy"
                    />
                    <div class="table-comment-meta">
                      <span
                        >自动检查后公开。修改文字会清空旧点赞。</span
                      ><span>{{ (comments[merchant.id] || '').length }}/500</span>
                    </div>
                    <div class="table-comment-footer">
                      <span>{{ scoreLabel[ratingDrafts[merchant.id] || 0] }}</span
                      ><button type="submit" :disabled="!ratingDrafts[merchant.id] || writeBusy">
                        {{ savingId === merchant.id ? '发布中…' : '发布评价' }}
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
                  <p v-if="!reviews[merchant.id]?.length">暂时没有公开短评，你可以写下第一条</p>
                  <small v-else class="table-review-limit"
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
.table-categories{display:flex;gap:8px;overflow-x:auto;padding:0 0 18px;scrollbar-color:#c6b5a8 transparent}.table-categories button{flex:none;min-height:44px;padding:9px 18px;border:0;border-radius:12px;background:#f5eee7;color:#74513b;font:inherit;font-size:15px;cursor:pointer}.table-categories button[aria-pressed=true]{background:#a34c1f;color:#fff}.table-categories button:hover:not([aria-pressed=true]){background:#eddfd1}.table-categories button:focus-visible{outline:2px solid #a34c1f;outline-offset:3px}
.table-draft-notice{display:flex;align-items:center;gap:12px;height:44px;box-sizing:border-box;overflow:auto;color:#5d6876;font-size:14px;line-height:1.5}
.merchant-review-time{display:block;margin-top:8px;color:#5d6876;font-size:12px}.table-review{flex-wrap:wrap}.table-review .merchant-review-actions{display:flex;gap:12px;flex:0 0 auto}.merchant-review-actions button,.merchant-report-form button{min-height:44px;padding:8px 12px;border:0;background:#f2f5fa;color:#5d6876;border-radius:10px;font:inherit;cursor:pointer}.merchant-report-form{flex-basis:100%;display:flex;gap:12px;align-items:end;flex-wrap:wrap}.merchant-report-form label{display:grid;gap:6px}.merchant-report-form select{font:inherit;font-size:16px;min-height:44px;max-width:100%;padding:8px;border:1px solid #d6dde5;border-radius:10px}
@media(min-width:1100px){.merchant-catalog{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}.merchant-catalog .merchant-overview{grid-template-columns:minmax(0,1fr) auto;gap:16px}.merchant-catalog .merchant-media{grid-column:1/-1}.merchant-catalog .merchant-media img{height:180px}}
.merchant-overview{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:20px 16px}
.merchant-media{position:relative;grid-column:1/-1;display:block;min-width:0;width:100%;padding:0;border:0;overflow:hidden;border-radius:12px;background:#f6f3ef;text-decoration:none;cursor:zoom-in}
.merchant-media-caption{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-height:32px;padding:3px 12px;background:#f6f3ef;color:#6d452c;font-size:13px;line-height:1.5}.merchant-media-caption .el-icon{font-size:14px}.merchant-media:disabled{opacity:1;cursor:default}
.merchant-media img{display:block;width:100%;height:190px;object-fit:contain}
.merchant-media :deep(svg){display:block;width:100%;height:220px}
.merchant-details{min-width:0}.merchant-details h3{margin:6px 0 0;font-size:24px;line-height:1.35;letter-spacing:-.025em;overflow-wrap:anywhere}
.merchant-details .table-location{font-size:14px;line-height:1.6;margin:0;color:#6f5948}.merchant-details .table-description{font-size:14px;line-height:1.6;margin:8px 0 0;color:#5d6876;overflow-wrap:anywhere}
.merchant-score{display:grid;gap:6px;justify-items:end;min-width:68px;padding-top:4px;font-variant-numeric:tabular-nums}.merchant-score strong{font-size:32px;line-height:1.15;color:#a34c1f;font-weight:600}.merchant-score span{font-size:12px;color:#6f5948;white-space:nowrap}
.table-card-actions .merchant-write-review{min-height:44px;padding:10px 18px;border:0;border-radius:12px;background:#a34c1f;color:#fff;font:inherit;font-size:15px;cursor:pointer}
.merchant-media:focus-visible,.merchant-write-review:focus-visible{outline:2px solid #a34c1f;outline-offset:3px}
.table-card .table-stars{width:100%;margin:0 0 16px;flex-wrap:wrap}.table-card .table-stars button{width:44px;height:44px}.review-account-note{font-size:14px;line-height:1.6;color:#5d6876}
@media(min-width:900px){.merchant-overview{grid-template-columns:200px minmax(0,1fr) auto;gap:24px}.merchant-media{grid-column:auto}.merchant-media img,.merchant-media :deep(svg){height:160px}.table-card :is(.table-featured,.table-first-review,.table-card-actions,.table-reviews,.table-action-feedback){margin-left:0;padding-left:0}}
.table-draft-notice,
.table-action-feedback {
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.table-action-feedback { margin: 12px 0 0; }
.table-action-feedback.is-error { color: var(--assistant-danger, #bf303d); }
.table-page {
  min-height: 100svh;
  background: #f6f6f2;
  color: #28362f;
  font-family: inherit;
}
button,
input,
select,
textarea {
  font: inherit;
}
button {
  cursor: pointer;
  touch-action: manipulation;
}
button:disabled {
  cursor: default;
  opacity: 0.55;
}
button:focus-visible,
select:focus-visible,
input:focus-visible,
textarea:focus-visible,
summary:focus-visible {
  outline: 2px solid #3558d5;
  outline-offset: 4px;
}
.table-header {
  height: 76px;
  border-bottom: 1px solid #dedfd8;
  padding: 0 max(24px, calc((100vw - 1080px) / 2));
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.table-back {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  color: #526057;
  font-size: 14px;
  min-height: 44px;
}
.table-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.04em;
}
.table-brand .camp-mark {
  width: 28px;
  height: 28px;
}
.table-main {
  max-width: 1080px;
  margin: auto;
  padding: 20px 24px 90px;
  box-sizing: content-box;
}
.table-demo {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 13px 18px;
  background: #ebeef9;
  border: 1px solid #d5dcee;
  border-radius: 16px;
  color: #3d4e82;
  font-size: 13px;
  line-height: 1.6;
}
.table-demo strong {
  white-space: nowrap;
}
.table-intro {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 24px;
  padding: 24px 0;
}
.table-eyebrow {
  font-size: 12px;
  letter-spacing: 0.14em;
  color: #748175;
  margin: 0 0 14px;
}
.table-intro h1 {
  font-size: clamp(34px, 4.2vw, 54px);
  line-height: 1.2;
  letter-spacing: -0.045em;
  margin: 0;
  font-weight: 650;
}
.table-intro h1 span {
  color: #698172;
}
.table-lead {
  font-size: 16px;
  color: #677267;
  margin: 14px 0 0;
}
.table-intro-note {
  border-left: 1px solid #d6dace;
  padding-left: 25px;
  color: #6d786d;
  font-size: 13px;
}
.table-intro-note p {
  font-size: 18px;
  color: #374c40;
  margin: 9px 0;
}
.table-intro-note small {
  font-size: 12px;
}
.table-tools {
  display: flex;
  gap: 18px;
  padding: 18px 0;
  border-top: 1px solid #dedfd8;
}
.table-search {
  display: flex;
  gap: 12px;
  align-items: center;
  flex: 1;
  min-width: 0;
}
.table-search .el-icon {
  font-size: 21px;
  color: #768377;
}
.table-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  background: transparent;
  font-size: 16px;
  color: #28362f;
  height: 44px;
}
.table-tools select {
  max-width: 150px;
  border: 1px solid #dadfd6;
  border-radius: 14px;
  background: #fffefb;
  padding: 0 12px;
  font-size: 14px;
  color: #475948;
}
.table-filters {
  display: flex;
  gap: 9px;
  overflow-x: auto;
  padding: 0 0 22px;
  scrollbar-width: thin;
}
.table-filters button {
  flex: none;
  min-height: 42px;
  border: 1px solid #dce0d5;
  border-radius: 100px;
  background: transparent;
  color: #526251;
  padding: 9px 18px;
  font-size: 14px;
}
.table-filters button.active {
  background: #304c3e;
  color: white;
  border-color: #304c3e;
}
.table-filters button span {
  opacity: 0.75;
  margin-left: 5px;
  font-size: 12px;
}
.table-list-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0 18px;
}
.table-list-heading h2 {
  font-size: 18px;
  margin: 0;
  font-weight: 650;
}
.table-list-heading h2 span {
  font-size: 12px;
  color: #778172;
  font-weight: 400;
  margin-left: 10px;
}
.table-list-heading > span {
  font-size: 13px;
  color: #788271;
}
.table-list {
  display: grid;
  gap: 16px;
}
.table-card {
  border: 1px solid #e0e3db;
  background: #fffefa;
  border-radius: 24px;
  overflow: hidden;
  padding: 24px 26px 0;
}
.table-shop-top {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) 100px;
  gap: 22px;
  align-items: center;
}
.table-photo {
  width: 100px;
  height: 100px;
  border-radius: 20px;
  overflow: hidden;
  background: #eff0e9;
}
.table-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.table-no-photo {
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  color: #85917e;
}
.table-no-photo .el-icon {
  font-size: 25px;
}
.table-no-photo small {
  font-size: 11px;
}
.table-shop-info {
  min-width: 0;
}
.table-location {
  font-size: 12px;
  color: #778371;
  margin: 0 0 9px;
}
.table-shop-info h3 {
  font-size: 23px;
  letter-spacing: -0.025em;
  margin: 0;
  color: #2c3c31;
  overflow-wrap: anywhere;
}
.table-description {
  font-size: 14px;
  color: #6b7868;
  line-height: 1.65;
  margin: 8px 0 0;
  overflow-wrap: anywhere;
}
.table-status {
  display: inline-block;
  font-size: 11px;
  color: #80552e;
  background: #f5ecdf;
  border-radius: 6px;
  padding: 2px 6px;
  margin-top: 5px;
}
.table-score {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-self: center;
  font-variant-numeric: tabular-nums;
}
.table-score strong {
  font-size: 46px;
  line-height: 1;
  letter-spacing: -0.055em;
  color: #24858c;
  font-weight: 650;
}
.table-score span {
  font-size: 12px;
  color: #6c786e;
}
.table-score small {
  font-size: 11px;
  color: #899386;
}
.table-featured {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0 5px;
  background: #fbf2df;
  border-radius: 13px;
  padding: 7px 11px 7px 14px;
}
.table-featured-tag {
  font-size: 12px;
  font-weight: 700;
  color: #a06a2d;
  flex: none;
}
.table-featured p {
  margin: 0;
  flex: 1;
  font-size: 15px;
  line-height: 1.6;
  color: #855324;
  overflow-wrap: anywhere;
}
.table-featured button,
.table-review > button {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 52px;
  min-height: 44px;
  border: 0;
  background: none;
  color: #946a34;
  font-size: 13px;
}
.table-featured button[aria-pressed='true'],
.table-review > button[aria-pressed='true'] {
  color: #2648c0;
  background: #e8eafb;
  border-radius: 12px;
}
.table-first-review {
  font-size: 13px;
  color: #8b9587;
  margin: 20px 0 5px;
  min-height: 46px;
  display: flex;
  align-items: center;
}
.table-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 70px;
}
.table-stars {
  display: flex;
  align-items: center;
  gap: 0;
  margin-right: auto;
}
.table-stars > span {
  font-size: 13px;
  color: #7c8876;
  margin-right: 12px;
}
.table-stars button {
  display: grid;
  place-items: center;
  border: 0;
  padding: 0;
  background: none;
  color: #d7ded4;
  width: 38px;
  height: 44px;
  font-size: 23px;
}
.table-stars button.filled {
  color: #c99a45;
}
.table-review-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  background: none;
  border: 0;
  font-size: 13px;
  color: #53684f;
  padding: 0 8px;
}
.table-review-toggle[aria-expanded='true'] .el-icon {
  transform: rotate(90deg);
}
.table-save-score,
.table-comment-footer button,
.table-empty button {
  border: 0;
  border-radius: 100px;
  background: #304c3e;
  color: white;
  padding: 11px 18px;
  min-height: 42px;
  font-size: 13px;
}
.table-reviews {
  border-top: 1px solid var(--assistant-line, #e2e7ec);
  padding: 10px 0 24px;
  color: var(--assistant-muted, #5d6876);
  font-size: 14px;
}
.table-review {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.table-review > div {
  flex: 1;
  min-width: 0;
}
.table-review strong {
  font-size: 14px;
  font-weight: 600;
  color: var(--assistant-ink, #29323c);
}
.table-review strong span {
  margin-left: 12px;
  font-weight: 400;
  color: var(--assistant-muted, #5d6876);
}
.table-review p {
  margin: 7px 0 0;
  font-size: 16px;
  line-height: 1.7;
  color: var(--assistant-ink, #29323c);
  overflow-wrap: anywhere;
}
.table-review small {
  display: block;
  margin-top: 5px;
  color: #966d35;
  font-size: 12px;
}
.table-review-limit {
  display: block;
  font-size: 14px;
  margin-top: 12px;
  color: var(--assistant-muted, #5d6876);
}
.table-comment-form {
  margin-top: 22px;
}
.table-comment-form label {
  display: block;
  font-size: 14px;
  color: var(--assistant-ink, #29323c);
  margin-bottom: 10px;
}
.table-comment-form label span {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
  margin-left: 8px;
}
.table-comment-form textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 13px 15px;
  resize: vertical;
  border: 1px solid #d9dfd0;
  border-radius: 16px;
  color: #344c2f;
  background: #f8f9f4;
  font-size: 15px;
  line-height: 1.65;
}
.table-comment-meta {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 14px;
  line-height: 1.7;
  margin-top: 8px;
  color: var(--assistant-muted, #5d6876);
}
.table-comment-meta > span:last-child {
  white-space: nowrap;
}
.table-comment-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  font-size: 14px;
}
.table-text-button {
  background: none;
  border: 0;
  color: #3558d5;
  min-height: 44px;
}
.table-rules {
  margin-top: 28px;
  color: #798373;
  font-size: 13px;
  line-height: 1.8;
}
.table-rules summary {
  cursor: pointer;
  min-height: 44px;
  color: #52634b;
}
.table-rules p {
  margin: 0 0 12px;
}
.table-empty {
  text-align: center;
  padding: 65px 20px;
  color: #73816e;
}
.table-empty h2 {
  font-size: 21px;
  color: #34482e;
}
.table-empty > .el-icon {
  font-size: 32px;
}
@media (min-width: 900px) {
  .table-card {
    padding: 26px 30px 0;
  }
  .table-featured,
  .table-first-review {
    margin-left: 122px;
  }
  .table-card-actions {
    padding-left: 122px;
  }
  .table-reviews,
  .table-action-feedback {
    margin-left: 122px;
  }
}
@media (max-width: 600px) {
  .table-header {
    height: 62px;
    padding: 0 18px;
  }
  .table-brand {
    font-size: 17px;
  }
  .table-main {
    padding: 18px 14px 70px;
  }
  .table-demo {
    padding: 10px 13px;
    font-size: 11px;
    gap: 8px;
    align-items: start;
  }
  .table-intro {
    padding: 28px 3px 26px;
  }
  .table-eyebrow {
    font-size: 10px;
  }
  .table-intro-note {
    display: none;
  }
  .table-lead {
    font-size: 14px;
  }
  .table-tools {
    gap: 10px;
    padding: 12px 0;
  }
  .table-search {
    gap: 7px;
  }
  .table-search input {
    font-size: 16px;
  }
  .table-search input::placeholder {
    font-size: 13px;
  }
  .table-tools select {
    max-width: 122px;
    font-size: 12px;
    padding: 0 8px;
  }
  .table-filters {
    padding-bottom: 12px;
  }
  .table-filters button {
    padding: 8px 14px;
    font-size: 13px;
  }
  .table-list-heading > span {
    font-size: 11px;
  }
  .table-list-heading h2 {
    font-size: 16px;
  }
  .table-card {
    border-radius: 20px;
    padding: 16px 14px 0;
  }
  .table-shop-top {
    grid-template-columns: 70px minmax(0, 1fr) 57px;
    gap: 12px;
  }
  .table-photo {
    width: 70px;
    height: 78px;
    border-radius: 14px;
  }
  .table-location {
    font-size: 10px;
    margin-bottom: 5px;
    line-height: 1.5;
  }
  .table-shop-info h3 {
    font-size: 18px;
  }
  .table-description {
    font-size: 12px;
    line-height: 1.6;
    margin-top: 5px;
  }
  .table-score strong {
    font-size: 34px;
  }
  .table-score span,
  .table-score small {
    font-size: 10px;
  }
  .table-featured {
    margin-top: 16px;
    gap: 8px;
    padding-left: 10px;
  }
  .table-featured p {
    font-size: 13px;
  }
  .table-featured-tag {
    font-size: 11px;
  }
  .table-featured button {
    min-width: 40px;
    font-size: 11px;
  }
  .table-stars > span {
    font-size: 11px;
    margin-right: 6px;
  }
  .table-stars button {
    width: 31px;
    font-size: 21px;
    height: 44px;
  }
  .table-card-actions {
    gap: 6px;
    min-height: 62px;
  }
  .table-review-toggle {
    font-size: 12px;
    padding: 0 4px;
  }
  .table-save-score {
    width: 100%;
    margin-bottom: 14px;
  }
  .table-comment-meta {
    font-size: 11px;
  }
  .table-list {
    gap: 12px;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .table-expand-enter-active,
  .table-expand-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }
  .table-expand-enter-from,
  .table-expand-leave-to {
    opacity: 0;
    transform: translateY(-5px);
  }
  .table-stars button,
  .table-review-toggle .el-icon {
    transition:
      color 0.15s ease,
      transform 0.18s ease;
  }
  .table-stars button:active {
    transform: scale(1.15);
  }
}
</style>
