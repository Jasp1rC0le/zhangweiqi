<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, ArrowRight, Search, StarFilled, Pointer, Food } from '@element-plus/icons-vue'
import {
  canteenMerchantPhotoUrl,
  getCanteens,
  getCanteenMerchants,
  getCanteenMerchantReviews,
  rateCanteenMerchant,
  likeCanteenReview,
} from '@/api/canteen'
import { useAuthStore } from '@/stores/auth'
import CampMark from '@/components/CampMark.vue'
import CanteenFoodArt from '@/components/CanteenFoodArt.vue'
import { selectMerchants } from '@/utils/merchantList'

defineProps({ demo: Boolean })
const router = useRouter()
const auth = useAuthStore()
const canteens = ref([])
const merchants = ref([])
const selectedCanteen = ref('all')
const ratingDrafts = reactive({})
const loading = ref(true)
const loadError = ref('')
const savingId = ref(null)
const likingId = ref(null)
const expandedId = ref(null)
const reviews = reactive({})
const reviewErrors = reactive({})
const reviewLoading = reactive({})
const comments = reactive({})
const searchQuery = ref('')
const sortBy = ref('default')
const canRate = computed(() => auth.user?.role === 'STUDENT')
const visibleMerchants = computed(() =>
  selectMerchants(merchants.value, {
    canteen: selectedCanteen.value,
    query: searchQuery.value,
    sort: sortBy.value,
  }),
)
const scoreLabel = ['选一个星级', '不太满意', '有待改进', '还不错', '值得再来', '特别推荐']

function resetFilters() {
  searchQuery.value = ''
  selectedCanteen.value = 'all'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [nextCanteens, nextMerchants] = await Promise.all([getCanteens(), getCanteenMerchants()])
    canteens.value = nextCanteens
    merchants.value = nextMerchants
    for (const merchant of nextMerchants) ratingDrafts[merchant.id] = merchant.myScore || 0
  } catch (error) {
    loadError.value = error.response?.data?.message || '暂时无法读取食堂信息，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function readReviews(merchant) {
  if (reviewLoading[merchant.id]) return
  reviewLoading[merchant.id] = true
  reviewErrors[merchant.id] = ''
  try {
    reviews[merchant.id] = await getCanteenMerchantReviews(merchant.id)
    if (comments[merchant.id] === undefined)
      comments[merchant.id] = reviews[merchant.id].find((item) => item.mine)?.comment || ''
  } catch (error) {
    reviewErrors[merchant.id] = error.response?.data?.message || '短评未能读取，请重试'
  } finally {
    reviewLoading[merchant.id] = false
  }
}

function toggleReviews(merchant) {
  if (expandedId.value === merchant.id) {
    expandedId.value = null
    return
  }
  expandedId.value = merchant.id
  readReviews(merchant)
}

async function submitRating(merchant, includeComment = false) {
  if (!ratingDrafts[merchant.id] || savingId.value) return
  savingId.value = merchant.id
  try {
    // Undefined means leave existing comment untouched, not delete it.
    merchants.value = await rateCanteenMerchant(
      merchant.id,
      ratingDrafts[merchant.id],
      includeComment ? comments[merchant.id] : undefined,
    )
    if (expandedId.value === merchant.id) await readReviews(merchant)
    ElMessage.success(includeComment && comments[merchant.id]?.trim() ? '已保存，短评审核后公开' : '评分已保存')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '未能保存，请重试')
  } finally {
    savingId.value = null
  }
}

async function likeReview(merchant, review) {
  if (likingId.value || review.mine || !canRate.value) return
  likingId.value = review.id
  try {
    reviews[merchant.id] = await likeCanteenReview(merchant.id, review.id, !review.liked)
    const confirmed = reviews[merchant.id].find((item) => item.id === review.id)
    if (confirmed && merchant.featuredReview?.id === review.id)
      Object.assign(merchant.featuredReview, confirmed)
    try {
      merchants.value = await getCanteenMerchants()
    } catch {
      ElMessage.warning('点赞已保存，神评排序稍后刷新')
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '操作未保存，请重试')
  } finally {
    likingId.value = null
  }
}

onMounted(async () => {
  if (!auth.user) {
    try {
      await auth.loadCurrentUser()
    } catch {
      return
    }
  }
  await load()
})
</script>

<template>
  <div class="table-page">
    <header class="table-header">
      <button class="table-back" @click="router.push('/chat')">
        <el-icon><ArrowLeft /></el-icon><span>校园助手</span>
      </button>
      <div class="table-brand"><CampMark /><span>Campthink.</span></div>
    </header>
    <main class="table-main">
      <aside v-if="demo" class="table-demo" role="note">
        <strong>交互样例</strong
        ><span>虚构商家、插画与评分，仅供验收 · 操作只留在本页，刷新即重置</span>
      </aside>
      <section class="table-intro">
        <div>
          <p class="table-eyebrow">CAMPUS TABLE / 校园餐桌</p>
          <h1>今天，吃哪家<span>？</span></h1>
          <p class="table-lead">好吃值得一颗星，有趣值得一个赞</p>
        </div>
        <div class="table-intro-note">
          <span>同学的口味，你的参考</span>
          <p>看评分 · 留短评 · 选神评</p>
          <small>满分 5 分，不把一条好评当成全部</small>
        </div>
      </section>
      <div v-if="loading" class="table-empty" aria-busy="true">正在摆好校园餐桌…</div>
      <div v-else-if="loadError" class="table-empty" role="alert">
        <h2>暂时没能读到商家</h2>
        <p>{{ loadError }}</p>
        <button @click="load">重新加载</button>
      </div>
      <template v-else>
        <div class="table-tools">
          <label class="table-search"
            ><el-icon><Search /></el-icon
            ><input
              v-model="searchQuery"
              type="search"
              placeholder="搜一家店，或一种味道"
              aria-label="搜索商家"
          /></label>
          <select v-model="sortBy" aria-label="商家排序">
            <option value="default">综合推荐</option>
            <option value="rating">评分最高</option>
            <option value="popular">评分人数最多</option>
          </select>
        </div>
        <nav class="table-filters" aria-label="选择食堂">
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
        <div class="table-list-heading">
          <h2>
            校园口碑榜 <span>{{ visibleMerchants.length }} 家</span>
          </h2>
          <span>真实体验，理性评价</span>
        </div>
        <section v-if="!visibleMerchants.length" class="table-empty">
          <el-icon><Food /></el-icon>
          <h2>{{ merchants.length ? '没找到这个味道' : '商家核实后，就在这里见' }}</h2>
          <p>{{ merchants.length ? '换个关键词或食堂试试' : '这里不填充虚构的正式评分' }}</p>
          <button
            v-if="merchants.length"
            @click="resetFilters"
          >
            查看全部商家
          </button>
        </section>
        <section v-else class="table-list" aria-label="商家口碑列表">
          <article
            v-for="merchant in visibleMerchants"
            :key="merchant.id"
            class="table-card"
            :aria-label="merchant.name"
          >
            <div class="table-shop-top">
              <div class="table-photo">
                <CanteenFoodArt v-if="demo && merchant.demoArt" :kind="merchant.demoArt" />
                <img
                  v-else-if="merchant.hasPhoto"
                  :src="canteenMerchantPhotoUrl(merchant.id)"
                  :alt="merchant.name + '照片'"
                  loading="lazy"
                />
                <span v-else class="table-no-photo"
                  ><el-icon><Food /></el-icon><small>照片待补充</small></span
                >
              </div>
              <div class="table-shop-info">
                <p class="table-location">
                  {{ merchant.canteenName }} · {{ merchant.location || '位置待补充' }}
                </p>
                <h3>{{ merchant.name }}</h3>
                <p class="table-description">{{ merchant.description }}</p>
                <span v-if="merchant.operatingStatus === 'CLOSED'" class="table-status"
                  >暂停营业</span
                >
              </div>
              <div class="table-score">
                <strong>{{
                  merchant.ratingCount ? Number(merchant.averageScore).toFixed(1) : '—'
                }}</strong
                ><span>{{
                  merchant.ratingCount ? merchant.ratingCount + ' 人评分' : '等你首评'
                }}</span
                ><small>满分 5 分</small>
              </div>
            </div>
            <div v-if="merchant.featuredReview" class="table-featured">
              <span class="table-featured-tag">{{
                merchant.featuredReview.likes ? '神评' : '同学说'
              }}</span>
              <p>{{ merchant.featuredReview.comment }}</p>
              <button
                :disabled="!canRate || merchant.featuredReview.mine || Boolean(likingId)"
                :aria-pressed="merchant.featuredReview.liked"
                :aria-label="
                  (merchant.featuredReview.liked ? '取消点赞' : '点赞') + merchant.name + '的神评'
                "
                @click="likeReview(merchant, merchant.featuredReview)"
              >
                <el-icon><Pointer /></el-icon><span>{{ merchant.featuredReview.likes }}</span>
              </button>
            </div>
            <div v-else class="table-first-review">还缺一句有意思的真实体验</div>
            <div class="table-card-actions">
              <div
                v-if="canRate"
                class="table-stars"
                role="group"
                :aria-label="'给' + merchant.name + '评分'"
              >
                <span>{{ merchant.myScore ? '我的评分' : '我来打分' }}</span
                ><button
                  v-for="score in 5"
                  :key="score"
                  :class="{ filled: score <= ratingDrafts[merchant.id] }"
                  :aria-label="score + '分'"
                  :aria-pressed="ratingDrafts[merchant.id] === score"
                  :disabled="Boolean(savingId)"
                  @click="ratingDrafts[merchant.id] = score"
                >
                  <el-icon><StarFilled /></el-icon>
                </button>
              </div>
              <button
                class="table-review-toggle"
                :aria-expanded="expandedId === merchant.id"
                :aria-controls="'reviews-' + merchant.id"
                @click="toggleReviews(merchant)"
              >
                {{ expandedId === merchant.id ? '收起短评' : '短评 ' + (merchant.reviewCount || 0)
                }}<el-icon><ArrowRight /></el-icon>
              </button>
              <button
                v-if="
                  canRate &&
                  ratingDrafts[merchant.id] &&
                  ratingDrafts[merchant.id] !== merchant.myScore
                "
                class="table-save-score"
                :disabled="Boolean(savingId)"
                @click="submitRating(merchant)"
              >
                {{
                  savingId === merchant.id ? '保存中…' : '保存 ' + ratingDrafts[merchant.id] + ' 分'
                }}
              </button>
            </div>
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
                  <div v-for="review in reviews[merchant.id]" :key="review.id" class="table-review">
                    <div>
                      <strong
                        >{{ review.mine ? '我' : '一位同学'
                        }}<span>{{ review.score }} 分</span></strong
                      >
                      <p>{{ review.comment }}</p>
                      <small v-if="review.status !== 'PUBLISHED'">{{
                        review.status === 'PENDING' ? '待审核，仅你可见' : '未公开，仅你可见'
                      }}</small>
                    </div>
                    <button
                      v-if="review.status === 'PUBLISHED' && !review.mine && canRate"
                      :disabled="Boolean(likingId)"
                      :aria-pressed="review.liked"
                      :aria-label="(review.liked ? '取消点赞' : '点赞') + '短评：' + review.comment"
                      @click="likeReview(merchant, review)"
                    >
                      <el-icon><Pointer /></el-icon>{{ review.likes }}
                    </button>
                  </div>
                  <p v-if="!reviews[merchant.id]?.length">暂时没有公开短评，你可以写下第一条</p>
                  <small v-else class="table-review-limit"
                    >最多展示 20 条 · 我的短评优先，其余按点赞排序</small
                  >
                  <form
                    v-if="canRate"
                    class="table-comment-form"
                    @submit.prevent="submitRating(merchant, true)"
                  >
                    <label :for="'comment-' + merchant.id"
                      >写一句你的真实体验 <span>选填</span></label
                    ><textarea
                      :id="'comment-' + merchant.id"
                      v-model="comments[merchant.id]"
                      rows="3"
                      maxlength="500"
                      placeholder="比如：阿姨的手不抖，我的筷子停不了"
                      :disabled="Boolean(savingId)"
                    />
                    <div class="table-comment-meta">
                      <span
                        >不写姓名、电话等隐私；修改后重新审核，旧点赞清零<br />清空并保存会删除自己的短评</span
                      ><span>{{ (comments[merchant.id] || '').length }}/500</span>
                    </div>
                    <div class="table-comment-footer">
                      <span>{{ scoreLabel[ratingDrafts[merchant.id] || 0] }}</span
                      ><button :disabled="!ratingDrafts[merchant.id] || Boolean(savingId)">
                        {{ savingId === merchant.id ? '保存中…' : '保存评分与短评' }}
                      </button>
                    </div>
                  </form>
                </template>
              </section>
            </Transition>
          </article>
        </section>
        <details class="table-rules">
          <summary>评分与神评怎么选？</summary>
          <p>
            每个学生账号对一家商家只计一条评分，可以修改。综合推荐使用 5 票、3.5
            分的先验平滑，降低少量评分冲榜的影响；展示分数仍是真实评分均值。神评仅从审核通过的短评中按点赞数选出，同赞时展示较新的一条，无赞时显示“同学说”。点赞不影响商家星级。
          </p>
          <p>
            短评不公开账号和姓名；管理员可审核、隐藏不当内容。发现隐私泄露或不当内容，请通过站内提交意见提供商家及短评内容。手机号等明显敏感信息会被拦截，但规则无法识别所有隐私，发布前请自行核对。
          </p>
        </details>
      </template>
    </main>
  </div>
</template>

<style scoped>
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
  border-top: 1px solid #e6e8df;
  padding: 10px 0 24px;
  color: #697762;
  font-size: 14px;
}
.table-review {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid #edf0e6;
}
.table-review > div {
  flex: 1;
  min-width: 0;
}
.table-review strong {
  font-size: 12px;
  font-weight: 600;
  color: #6d7a62;
}
.table-review strong span {
  margin-left: 12px;
  font-weight: 400;
  color: #8a926e;
}
.table-review p {
  margin: 7px 0 0;
  line-height: 1.65;
  color: #40513b;
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
  font-size: 12px;
  margin-top: 12px;
  color: #7f8875;
}
.table-comment-form {
  margin-top: 22px;
}
.table-comment-form label {
  display: block;
  font-size: 14px;
  color: #3e5236;
  margin-bottom: 10px;
}
.table-comment-form label span {
  font-size: 12px;
  color: #859078;
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
  font-size: 12px;
  line-height: 1.7;
  margin-top: 8px;
  color: #858c7b;
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
  font-size: 13px;
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
  .table-reviews {
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
