<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useTimetableStore } from '@/stores/timetable'
import { useAuthStore } from '@/stores/auth'
import CourseSchedulePanel from '@/components/CourseSchedulePanel.vue'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import { saveTimetable, confirmTimetable, deleteTimetable } from '@/api/timetable'
import {
  chinaDate,
  defaultSemester,
  firstMondayFrom,
  mondayOf,
  prepareTimetableImage,
  timetableStatus,
} from '@/utils/timetable'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { useTimetableClock } from '@/utils/useTimetableClock'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { captureDraftFields, hasDraftFieldChanges } from '@/utils/formDraft'
const store = useTimetableStore(),
  auth = useAuthStore(),
  courses = useCourseScheduleStore()
const viewMode = ref('image'),
  coursePanel = ref()
async function switchMode(mode) {
  if (
    viewMode.value === mode ||
    busy.value ||
    preparing.value ||
    confirming.value ||
    coursePanel.value?.unavailable
  )
    return
  if (
    (dirty.value || coursePanel.value?.dirty) &&
    !(await confirm('切换查看方式会放弃当前未保存的导入内容，已保存课表不受影响', {
      title: '切换课表查看方式？',
      confirmText: '放弃未保存内容并切换',
      cancelText: '继续编辑',
    }))
  )
    return
  if (mode === 'courses') cancelImport()
  viewMode.value = mode
}
const importing = ref(false),
  preparing = ref(false),
  busy = ref(false),
  error = ref(''),
  versionConflict = ref(false),
  draftRevision = ref(null),
  needsReview = ref(false),
  reviewConfirmed = ref(false),
  notice = ref(''),
  image = ref(null),
  preview = ref(''),
  fileInput = ref(),
  formElement = ref(),
  headingElement = ref()
const form = reactive({
  semester: defaultSemester(),
  weekMonday: mondayOf(chinaDate()),
  startWeek: '',
  endWeek: '',
  mode: 'week',
  remindDays: 7,
})
const draftFields = ['semester', 'weekMonday', 'startWeek', 'endWeek', 'mode', 'remindDays']
const draftBaseline = ref(captureDraftFields(form, draftFields))
const clock = useTimetableClock()
const status = computed(() => timetableStatus(store.timetable, clock.value))
const formVisible = computed(
  () => importing.value || (store.loaded && !store.timetable && !store.error),
)
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '未记录'
const dirty = computed(
  () =>
    !!auth.user &&
    viewMode.value === 'image' &&
    formVisible.value &&
    (!!image.value || hasDraftFieldChanges(form, draftBaseline.value)),
)
useUnsavedChanges(
  () => dirty.value,
  () => busy.value || preparing.value || confirming.value,
)
let accountGeneration = 0,
  prepareGeneration = 0,
  disposed = false
const { confirming, confirm } = useScopedConfirmation(
  () => (store.principal ? `${store.principal}:${accountGeneration}` : null),
  () => !disposed,
)
function clearPreview() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  image.value = null
}
function cancelImport() {
  prepareGeneration++
  preparing.value = false
  clearPreview()
  importing.value = false
  error.value = ''
  versionConflict.value = false
  draftRevision.value = null
  needsReview.value = false
  reviewConfirmed.value = false
  if (fileInput.value) fileInput.value.value = ''
  Object.assign(form, {
    semester: store.timetable?.semester || defaultSemester(),
    weekMonday: mondayOf(chinaDate(clock.value)),
    startWeek: '',
    endWeek: '',
    mode: 'week',
    remindDays: store.timetable?.remindDays ?? 7,
  })
  draftBaseline.value = captureDraftFields(form, draftFields)
}
async function discardImport() {
  if (busy.value || preparing.value || confirming.value) return
  if (
    dirty.value &&
    !(await confirm('未保存的图片、学期、周次、日期和提醒设置会被放弃，已保存课表不受影响', {
      title: '放弃这次截图导入？',
      confirmText: '放弃未保存内容',
      cancelText: '继续编辑',
    }))
  )
    return
  cancelImport()
}
watch(
  [
    image,
    () => form.semester,
    () => form.weekMonday,
    () => form.startWeek,
    () => form.endWeek,
    () => form.mode,
    () => form.remindDays,
  ],
  () => {
    reviewConfirmed.value = false
  },
)
watch(
  () => store.principal,
  () => {
    accountGeneration++
    cancelImport()
    notice.value = ''
    busy.value = false
    Object.assign(form, {
      semester: defaultSemester(),
      weekMonday: mondayOf(chinaDate()),
      startWeek: '',
      endWeek: '',
      mode: 'week',
      remindDays: 7,
    })
    draftBaseline.value = captureDraftFields(form, draftFields)
  },
  { flush: 'sync' },
)
async function openImport() {
  if (confirming.value || busy.value || preparing.value) return
  const owner = store.principal,
    generation = accountGeneration
  importing.value = true
  error.value = ''
  versionConflict.value = false
  draftRevision.value = store.timetable?.revision || 0
  needsReview.value = false
  reviewConfirmed.value = false
  notice.value = ''
  if (store.timetable) {
    form.semester = store.timetable.semester
    form.remindDays = store.timetable.remindDays
  }
  draftBaseline.value = captureDraftFields(form, draftFields)
  await nextTick()
  if (disposed || generation !== accountGeneration || owner !== store.principal) return
  formElement.value?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  })
  fileInput.value?.focus()
}
async function chooseFile(event) {
  const selected = event.target.files?.[0]
  if (!selected) return
  const generation = ++prepareGeneration,
    owner = store.principal
  if (draftRevision.value === null) draftRevision.value = store.timetable?.revision || 0
  preparing.value = true
  error.value = ''
  clearPreview()
  try {
    const next = await prepareTimetableImage(selected)
    if (generation !== prepareGeneration || store.principal !== owner) return
    clearPreview()
    image.value = next
    preview.value = URL.createObjectURL(next)
  } catch (failure) {
    if (generation === prepareGeneration)
      error.value = failure.message || '图片处理失败，请换一张PNG或JPG截图'
  } finally {
    if (generation === prepareGeneration) preparing.value = false
  }
}
async function save() {
  if (
    busy.value ||
    preparing.value ||
    confirming.value ||
    !image.value ||
    !store.loaded ||
    store.error ||
    versionConflict.value ||
    (needsReview.value && !reviewConfirmed.value)
  )
    return
  error.value = ''
  notice.value = ''
  const owner = store.principal,
    generation = accountGeneration
  try {
    if (draftRevision.value !== (store.timetable?.revision || 0)) {
      versionConflict.value = true
      throw new Error('已保存课表发生变化，请先读取最新截图；你选择的图片和填写内容会保留')
    }
    const startWeek = Number(form.startWeek),
      endWeek = form.mode === 'week' ? startWeek : Number(form.endWeek)
    if (!Number.isInteger(endWeek) || endWeek < startWeek || endWeek > 30)
      throw new Error('覆盖结束周应为起始周至30周之间')
    const metadata = {
      revision: draftRevision.value,
      semester: form.semester.trim(),
      firstMonday: firstMondayFrom(form.weekMonday, startWeek),
      startWeek,
      endWeek,
      remindDays: Number(form.remindDays),
    }
    busy.value = true
    const response = await saveTimetable(metadata, image.value)
    if (
      disposed ||
      generation !== accountGeneration ||
      !store.adopt(response.data.timetable, owner)
    )
      return
    cancelImport()
    notice.value = '课表已保存，仅你可见；未进行AI识别或实时教务同步'
    await store.load(true)
    await nextTick()
    if (disposed || generation !== accountGeneration || owner !== store.principal) return
    headingElement.value?.focus({ preventScroll: true })
    headingElement.value?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    })
  } catch (failure) {
    if (!disposed && generation === accountGeneration && owner === store.principal) {
      if (failure.response?.status === 409) versionConflict.value = true
      error.value =
        failure.response?.data?.message || failure.message || '保存结果未确认，请保留截图并重试'
    }
  } finally {
    if (!disposed && generation === accountGeneration && owner === store.principal)
      busy.value = false
  }
}
async function reloadForComparison() {
  if (busy.value || preparing.value || confirming.value) return
  const owner = store.principal,
    generation = accountGeneration
  busy.value = true
  try {
    await store.load(true)
    if (disposed || generation !== accountGeneration || owner !== store.principal) return
    if (store.error) {
      error.value = '最新截图未读取成功；你选择的图片和填写内容已保留，请重试'
      return
    }
    draftRevision.value = store.timetable?.revision || 0
    versionConflict.value = false
    needsReview.value = !!image.value
    reviewConfirmed.value = false
    error.value = ''
    notice.value = '已读取最新保存状态。当前图片和填写内容保留；对照上方课表后，再确认是否替换'
  } finally {
    if (!disposed && generation === accountGeneration && owner === store.principal)
      busy.value = false
  }
}
async function checked() {
  if (busy.value || preparing.value || confirming.value || !store.timetable) return
  const owner = store.principal,
    generation = accountGeneration,
    revision = store.timetable.revision
  if (
    !(await confirm(
      '只有你已经对照教务或老师通知核对后，才记录本次核对时间；本站不能自动替你核对',
      {
        title: '确认课表没有变化？',
        confirmText: '我已核对，记录时间',
      },
    )) ||
    revision !== store.timetable?.revision
  )
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const response = await confirmTimetable(revision)
    if (
      disposed ||
      generation !== accountGeneration ||
      !store.adopt(response.data.timetable, owner)
    )
      return
    notice.value = '已记录本次核对，不代表本站与教务实时同步'
  } catch (failure) {
    if (!disposed && generation === accountGeneration && owner === store.principal) {
      if (failure.response?.status === 409) versionConflict.value = true
      error.value = failure.response?.data?.message || '核对记录未保存，请重试'
    }
  } finally {
    if (!disposed && generation === accountGeneration && owner === store.principal)
      busy.value = false
  }
}
async function remove() {
  if (busy.value || preparing.value || confirming.value || !store.timetable) return
  const owner = store.principal,
    generation = accountGeneration,
    revision = store.timetable.revision
  if (
    !(await confirm('删除本站保存的这份课表后，需要重新导入。学校教务中的课表不会改变', {
      title: '删除本站课表？',
      confirmText: '删除本站课表',
    })) ||
    revision !== store.timetable?.revision
  )
    return
  busy.value = true
  error.value = ''
  try {
    await deleteTimetable(revision)
    if (disposed || generation !== accountGeneration || !store.adopt(null, owner)) return
    notice.value = '本站课表已删除；学校课表未改动'
  } catch (failure) {
    if (!disposed && generation === accountGeneration && owner === store.principal) {
      if (failure.response?.status === 409) versionConflict.value = true
      error.value = failure.response?.data?.message || '删除未确认成功，请重新读取核对'
    }
  } finally {
    if (!disposed && generation === accountGeneration && owner === store.principal)
      busy.value = false
  }
}
onMounted(async () => {
  const owner = store.principal,
    generation = accountGeneration
  await Promise.all([store.load(), courses.load()])
  if (
    !disposed &&
    generation === accountGeneration &&
    owner === store.principal &&
    !dirty.value &&
    !preparing.value &&
    !store.timetable &&
    courses.schedule
  )
    viewMode.value = 'courses'
})
onBeforeUnmount(() => {
  disposed = true
  accountGeneration++
  prepareGeneration++
  clearPreview()
})
</script>
<template>
  <main class="work-page timetable-page" :aria-busy="busy || preparing">
    <header class="timetable-heading">
      <div>
        <h1 ref="headingElement" tabindex="-1">我的课表</h1>
        <p>保存一次，下次登录直接看；不需要教务密码</p>
      </div>
      <button
        v-if="!importing && viewMode === 'image'"
        type="button"
        class="work-button primary"
        :disabled="busy || store.loading || !store.loaded"
        @click="openImport"
      >
        {{ store.timetable ? '更换课表' : '导入课表' }}
      </button>
    </header>
    <div class="work-tabs timetable-views" aria-label="课表查看方式">
      <button
        type="button"
        :aria-pressed="viewMode === 'image'"
        :class="{ active: viewMode === 'image' }"
        @click="switchMode('image')"
      >
        截图版
      </button>
      <button
        type="button"
        :aria-pressed="viewMode === 'courses'"
        :class="{ active: viewMode === 'courses' }"
        @click="switchMode('courses')"
      >
        课程表格{{ courses.schedule ? ` · ${courses.schedule.courses.length}条` : '' }}
      </button>
    </div>
    <CourseSchedulePanel v-if="viewMode === 'courses'" ref="coursePanel" />
    <div v-show="viewMode === 'image'">
      <p v-if="store.loading && !store.loaded" class="timetable-loading" role="status">
        正在读取你的课表…
      </p>
      <div v-if="store.error" class="timetable-alert" role="alert">
        <p>{{ store.error }}</p>
        <button
          type="button"
          class="work-button"
          :disabled="store.loading"
          @click="store.load(true)"
        >
          重新读取
        </button>
      </div>
      <div v-if="error || versionConflict" class="timetable-alert" role="alert">
        <p>{{ error || '已保存课表发生变化，请先读取最新截图；当前图片和填写内容保留' }}</p>
        <button
          v-if="versionConflict"
          type="button"
          class="work-button"
          :disabled="busy || preparing || confirming"
          @click="reloadForComparison"
        >
          读取最新截图，保留当前填写
        </button>
      </div>
      <section v-if="store.timetable" class="saved-timetable" aria-label="已保存课表">
        <div class="timetable-meta">
          <div>
            <h2>{{ store.timetable.semester }}</h2>
            <p>
              覆盖第{{ store.timetable.startWeek
              }}{{
                store.timetable.startWeek === store.timetable.endWeek
                  ? ''
                  : `至${store.timetable.endWeek}`
              }}周 · 仅本人可见
            </p>
          </div>
          <span>核对于 {{ dateLabel(store.timetable.checkedAt) }}</span>
        </div>
        <div
          class="timetable-coverage"
          :class="{ 'needs-check': ['coverage', 'check', 'future'].includes(status.kind) }"
        >
          <p>{{ status.label }}</p>
          <a
            href="https://zdjw.tsguas.edu.cn/app-web/#/tabs/home"
            target="_blank"
            rel="noopener noreferrer"
            >打开教务核对 ↗</a
          >
        </div>
        <figure class="timetable-image" tabindex="0" aria-label="课表图片，手机可横向滚动查看">
          <img
            v-if="store.imageUrl"
            :src="store.imageUrl"
            :alt="`${store.timetable.semester}，第${store.timetable.startWeek}至${store.timetable.endWeek}周的私人课表原图`"
          />
          <figcaption>保存的课表图片 · 手机可横向滚动查看；本站不会推断图片之外的课程</figcaption>
        </figure>
        <div class="timetable-actions">
          <button type="button" class="work-button" :disabled="busy" @click="checked">
            我已核对，课表没变</button
          ><a
            v-if="store.imageUrl"
            class="work-button"
            :href="store.imageUrl"
            download="我的课表.jpg"
            >下载课表图片</a
          ><button type="button" class="timetable-delete" :disabled="busy" @click="remove">
            删除本站课表
          </button>
        </div>
      </section>
      <p v-if="notice" class="timetable-notice" role="status">{{ notice }}</p>
      <div
        v-if="formVisible"
        class="timetable-import-layout"
        :class="{ 'first-import': !store.timetable }"
      >
        <section v-if="!store.timetable" class="timetable-empty">
          <h2>把课表放在你常来的地方</h2>
          <ol>
            <li>自己登录教务，打开课表并截图</li>
            <li>导入图片，确认截图覆盖的周次</li>
            <li>下次登录Campthink，直接在这里查看</li>
          </ol>
          <a
            class="work-button"
            href="https://zdjw.tsguas.edu.cn/app-web/#/tabs/home"
            target="_blank"
            rel="noopener noreferrer"
            >去教务打开课表 ↗</a
          >
          <p>先保存原图，不自动识字。单周截图只覆盖那一周；调课后请更换图片</p>
        </section>
        <form ref="formElement" class="timetable-import" @submit.prevent="save">
          <h2>{{ store.timetable ? '预览新图，再替换' : '导入你的课表' }}</h2>
          <p>裁掉不必要的姓名、学号。只保存到你的个人账号，不公开，也不发送给AI</p>
          <fieldset :disabled="busy || preparing || confirming">
            <label for="timetable-file"
              >课表截图<input
                id="timetable-file"
                ref="fileInput"
                type="file"
                accept="image/png,image/jpeg"
                @change="chooseFile"
              /><small>PNG / JPG，原图小于8MB；在本机压缩后上传，不支持HEIC</small></label
            >
            <p v-if="preparing" role="status">正在本机处理图片…</p>
            <div v-if="preview" class="timetable-preview">
              <img :src="preview" alt="准备保存的课表截图，请核对清晰度和隐私区域" />
            </div>
            <div class="timetable-form-grid">
              <label for="timetable-semester"
                >学期<input
                  id="timetable-semester"
                  v-model="form.semester"
                  required
                  maxlength="100"
                  placeholder="按教务页面的学期填写" /></label
              ><label for="timetable-mode"
                >这张图覆盖<select id="timetable-mode" v-model="form.mode">
                  <option value="week">只有一周</option>
                  <option value="range">多周或整个学期</option>
                </select></label
              ><label for="timetable-start"
                >{{ form.mode === 'week' ? '截图是第几周' : '覆盖起始周'
                }}<input
                  id="timetable-start"
                  v-model="form.startWeek"
                  type="number"
                  required
                  min="1"
                  max="30"
                  placeholder="例如5，以教务显示为准" /></label
              ><label v-if="form.mode === 'range'" for="timetable-end"
                >覆盖结束周<input
                  id="timetable-end"
                  v-model="form.endWeek"
                  type="number"
                  required
                  min="1"
                  max="30"
                  placeholder="例如18，不凭截图猜单双周" /></label
              ><label for="timetable-monday"
                >{{ form.mode === 'week' ? '截图这一周的周一日期' : '起始周的周一日期'
                }}<input
                  id="timetable-monday"
                  v-model="form.weekMonday"
                  type="date"
                  required
                /><small>默认本周周一；如果截图不是本周，请改成图上日期</small></label
              ><label for="timetable-remind"
                >核对提醒<select id="timetable-remind" v-model="form.remindDays">
                  <option :value="3">每3天提醒核对</option>
                  <option :value="7">每7天提醒核对</option>
                  <option :value="14">每14天提醒核对</option>
                  <option :value="0">关闭定期提醒</option></select
                ><small>提醒不代表检测到调课；超出覆盖周次仍会提示</small></label
              >
            </div>
            <label v-if="needsReview" class="timetable-review" for="timetable-review">
              <input id="timetable-review" v-model="reviewConfirmed" type="checkbox" />
              <span>我已对照最新保存的课表，确认仍要保存当前图片和填写内容</span>
            </label>
            <div class="timetable-actions">
              <button
                class="work-button primary"
                type="submit"
                :disabled="
                  !image ||
                  !store.loaded ||
                  !!store.error ||
                  versionConflict ||
                  (needsReview && !reviewConfirmed)
                "
              >
                {{
                  busy ? '正在保存…' : store.timetable ? '确认替换这份课表' : '确认保存课表'
                }}</button
              ><button class="work-button" type="button" @click="discardImport">
                {{ store.timetable ? '取消，保留原课表' : '清空未保存内容' }}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
      <p class="timetable-boundary">
        原图导入版 ·
        尚不支持自动识别课程、下一节课提醒或实时调课同步。关闭网站时不会保证收到提醒；你的课表不进入公共知识库
      </p>
    </div>
  </main>
</template>
<style scoped>
.timetable-page {
  max-width: 1160px;
  color: #273449;
  font-size: 16px;
  line-height: 1.7;
}
.timetable-heading,
.timetable-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.timetable-heading {
  margin-bottom: 30px;
}
.timetable-heading h1 {
  font-size: 32px;
  line-height: 1.3;
  margin: 0 0 12px;
  letter-spacing: -0.025em;
  scroll-margin-top: 16px;
}
.timetable-heading p {
  margin: 0;
  color: #526377;
  max-width: 65ch;
}
.timetable-heading button {
  flex: none;
}
.timetable-views {
  margin-bottom: 24px;
}
.timetable-page h2 {
  font-size: 21px;
  line-height: 1.4;
  margin: 0 0 10px;
  overflow-wrap: anywhere;
}
.timetable-meta > div {
  min-width: 0;
}
.timetable-page p {
  overflow-wrap: anywhere;
}
.timetable-meta p {
  margin: 0;
  color: #526377;
}
.timetable-meta > span {
  color: #526377;
  font-size: 14px;
  text-align: right;
}
.timetable-coverage {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 20px;
  margin: 22px 0;
  background: #edf2ec;
  border-radius: 16px;
  color: #34513d;
}
.timetable-coverage.needs-check {
  background: #f4efe3;
  color: #625133;
}
.timetable-coverage p {
  margin: 0;
}
.timetable-page a {
  color: #2f46c6;
  text-underline-offset: 4px;
}
.timetable-coverage a {
  flex: none;
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
.timetable-image {
  margin: 0;
  overflow: auto;
  background: #fff;
  border: 1px solid #d7dce5;
  border-radius: 16px;
}
.timetable-image img {
  display: block;
  width: 100%;
  min-width: 650px;
  max-width: 100%;
  height: auto;
}
.timetable-image figcaption {
  padding: 14px 18px;
  font-size: 14px;
  color: #526377;
  min-width: 300px;
}
.timetable-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 20px;
}
.timetable-delete {
  font: inherit;
  color: #526377;
  background: none;
  border: 0;
  padding: 10px 8px;
  cursor: pointer;
  min-height: 44px;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.timetable-delete:hover {
  color: #843f32;
}
.timetable-delete:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.timetable-empty {
  padding: 36px 0 26px;
  border-top: 1px solid #d7dce5;
}
.timetable-import-layout.first-import {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.4fr);
  gap: 32px;
  align-items: start;
}
.first-import .timetable-import {
  margin-top: 0;
}
.timetable-empty ol {
  padding-left: 24px;
  margin: 18px 0 26px;
}
.timetable-empty li {
  margin: 10px 0;
}
.timetable-empty > p,
.timetable-boundary {
  font-size: 14px;
  color: #526377;
  max-width: 75ch;
}
.timetable-boundary {
  margin-top: 34px;
  padding-top: 20px;
  border-top: 1px solid #d7dce5;
}
.timetable-alert,
.timetable-notice {
  padding: 16px 20px;
  border-radius: 16px;
  background: #f7eee8;
  color: #774739;
}
.timetable-alert p {
  margin: 0 0 10px;
}
.timetable-notice {
  color: #34513d;
  background: #edf2ec;
}
.timetable-loading {
  min-height: 64px;
  background: #edf0f5;
  padding: 20px;
  border-radius: 16px;
}
.timetable-import {
  margin-top: 34px;
  padding: 26px;
  background: #fffefa;
  border: 1px solid #d7dce5;
  border-radius: 20px;
  scroll-margin-top: 20px;
}
.timetable-import > p {
  color: #526377;
  max-width: 65ch;
}
.timetable-import fieldset {
  padding: 0;
  border: 0;
  min-width: 0;
}
.timetable-import label {
  display: grid;
  gap: 8px;
  font-weight: 550;
  min-width: 0;
}
.timetable-import small {
  color: #526377;
  font-size: 14px;
  line-height: 1.6;
  font-weight: 400;
}
.timetable-import :is(input, select) {
  font: inherit;
  width: 100%;
  min-height: 46px;
  min-width: 0;
  padding: 10px 14px;
  background: #f7f8fb;
  border: 1px solid #cbd3df;
  color: #273449;
  border-radius: 14px;
  caret-color: #334bdb;
}
.timetable-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  margin-top: 24px;
}
.timetable-import .timetable-review {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
  margin-top: 24px;
  font-weight: 400;
  cursor: pointer;
}
.timetable-import .timetable-review input {
  flex: none;
  width: 20px;
  min-height: 20px;
  height: 20px;
  padding: 0;
  margin-top: 4px;
  accent-color: #334bdb;
}
.timetable-preview {
  margin-top: 20px;
  max-height: 300px;
  overflow: auto;
}
.timetable-preview img {
  display: block;
  max-width: 100%;
  height: auto;
}
.timetable-page :is(button, input, select, a):focus-visible {
  outline: 2px solid #334bdb;
  outline-offset: 3px;
}
.timetable-page ::selection {
  background: #dce3ff;
  color: #243667;
}
.timetable-meta,
.timetable-form-grid {
  font-variant-numeric: tabular-nums;
}
@media (max-width: 760px) {
  .timetable-meta,
  .timetable-coverage {
    flex-direction: column;
    gap: 8px;
  }
  .timetable-heading {
    gap: 12px;
    align-items: center;
    margin-bottom: 18px;
  }
  .timetable-heading h1 {
    margin-bottom: 6px;
  }
  .timetable-heading p {
    font-size: 14px;
  }
  .timetable-meta h2 {
    font-size: 18px;
    margin-bottom: 4px;
  }
  .timetable-coverage {
    flex-direction: row;
    flex-wrap: wrap;
    padding: 10px 14px;
    margin: 14px 0;
  }
  .timetable-import-layout.first-import {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  .timetable-empty {
    padding: 18px 0 0;
  }
  .timetable-meta > span {
    text-align: left;
  }
  .timetable-form-grid {
    grid-template-columns: 1fr;
  }
  .timetable-import {
    padding: 20px;
  }
  .timetable-heading h1 {
    font-size: 28px;
  }
  .timetable-actions {
    align-items: stretch;
  }
  .timetable-actions .work-button {
    flex: 1;
  }
  .timetable-image img {
    max-width: none;
    width: 650px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .timetable-import {
    scroll-behavior: auto;
  }
}
.timetable-form-grid {
  align-items: start;
}
.timetable-import input[type='file']::file-selector-button {
  font: inherit;
  color: #273449;
  background: #e8ecf8;
  border: 0;
  border-radius: 10px;
  padding: 7px 12px;
  margin-right: 12px;
  cursor: pointer;
}
.timetable-image:focus-visible {
  outline: 2px solid #334bdb;
  outline-offset: 3px;
}
</style>
