<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useCourseScheduleStore } from '@/stores/courseSchedule'
import {
  saveCourseSchedule,
  confirmCourseSchedule,
  deleteCourseSchedule,
} from '@/api/courseSchedule'
import {
  COURSE_TEMPLATE,
  parseCourseTable,
  diffCourses,
  courseConflicts,
  weekCourses,
  nextImportedCourse,
  validateCourseMetadata,
  courseKey,
} from '@/utils/courseSchedule'
import { chinaDate, dayNumber, defaultSemester } from '@/utils/timetable'
import { useTimetableClock } from '@/utils/useTimetableClock'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { readCourseFile, takeCourseFile } from '@/utils/courseFile'
import { captureDraftFields, hasDraftFieldChanges } from '@/utils/formDraft'

const store = useCourseScheduleStore(),
  clock = useTimetableClock()
const editing = ref(false),
  raw = ref(''),
  preview = ref(null),
  busy = ref(false),
  reading = ref(false),
  error = ref(''),
  versionConflict = ref(false),
  notice = ref(''),
  confirmed = ref(false),
  selectedWeek = ref(1),
  heading = ref(),
  fileError = ref(),
  importHeading = ref()
const form = reactive({ semester: defaultSemester(), firstMonday: '', remindDays: 7 })
const draftFields = ['semester', 'firstMonday', 'remindDays']
const draftBaseline = ref(captureDraftFields(form, draftFields))
const dirty = computed(
    () => editing.value && (!!raw.value.trim() || hasDraftFieldChanges(form, draftBaseline.value)),
  ),
  unavailable = computed(() => busy.value || reading.value || confirming.value)
defineExpose({ dirty, unavailable })
useUnsavedChanges(
  () => dirty.value,
  () => unavailable.value,
)
let disposed = false,
  fileGeneration = 0,
  fileRead = null
const { confirming, confirm } = useScopedConfirmation(
  () => (store.principal ? `${store.principal}:${fileGeneration}` : null),
  () => !disposed,
)
const currentWeek = computed(() =>
  store.schedule
    ? Math.floor((dayNumber(chinaDate(clock.value)) - dayNumber(store.schedule.firstMonday)) / 7) +
      1
    : null,
)
const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const displayed = computed(() => weekCourses(store.schedule, Number(selectedWeek.value)))
const nextCourse = computed(() => nextImportedCourse(store.schedule, clock.value))
const conflicts = computed(() => courseConflicts(displayed.value))
const difference = computed(() =>
  diffCourses(store.schedule?.courses || [], preview.value?.courses || []),
)
const metadataChange = computed(
  () =>
    store.schedule &&
    (form.semester.trim() !== store.schedule.semester ||
      form.firstMonday !== store.schedule.firstMonday ||
      Number(form.remindDays) !== store.schedule.remindDays),
)
const checkMessage = computed(() => {
  if (!store.schedule) return ''
  const schedule = store.schedule,
    checked = new Date(schedule.checkedAt),
    age = Number.isFinite(checked.getTime())
      ? Math.max(0, dayNumber(chinaDate(clock.value)) - dayNumber(chinaDate(checked)))
      : null
  if (currentWeek.value < 1 || currentWeek.value > 30)
    return '日期不在这份表格的学期范围内，请核对学期和第1周日期'
  if (!weekCourses(schedule, currentWeek.value).length)
    return `第${currentWeek.value}周没有导入的课程，不代表这周停课，请核对教务`
  if (schedule.remindDays && (age === null || age >= schedule.remindDays))
    return `已${age ?? '多'}天未核对，请查看教务或老师通知；本站未检测实时调课`
  return '按你导入的表格展示，临时调课仍需核对教务或老师通知'
})
const dateLabel = (value) =>
  new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
function invalidatePreview() {
  preview.value = null
  confirmed.value = false
  notice.value = ''
}
watch([raw, () => form.semester, () => form.firstMonday, () => form.remindDays], () => {
  if (editing.value) invalidatePreview()
})
watch(
  () => store.principal,
  () => {
    fileGeneration++
    fileRead?.abort()
    fileRead = null
    editing.value = false
    raw.value = ''
    preview.value = null
    busy.value = false
    reading.value = false
    error.value = ''
    versionConflict.value = false
    notice.value = ''
    confirmed.value = false
    Object.assign(form, { semester: defaultSemester(), firstMonday: '', remindDays: 7 })
    draftBaseline.value = captureDraftFields(form, draftFields)
  },
  { flush: 'sync' },
)
watch(
  () => store.schedule,
  () => {
    selectedWeek.value = Math.min(30, Math.max(1, currentWeek.value || 1))
  },
  { immediate: true },
)
async function startImport(fromAction = true) {
  const owner = store.principal,
    generation = fileGeneration
  editing.value = true
  error.value = ''
  versionConflict.value = false
  notice.value = ''
  preview.value = null
  confirmed.value = false
  raw.value = ''
  Object.assign(form, {
    semester: store.schedule?.semester || defaultSemester(),
    firstMonday: store.schedule?.firstMonday || '',
    remindDays: store.schedule?.remindDays ?? 7,
  })
  draftBaseline.value = captureDraftFields(form, draftFields)
  if (fromAction === false) return
  await nextTick()
  if (disposed || generation !== fileGeneration || owner !== store.principal) return
  importHeading.value?.focus({ preventScroll: true })
  importHeading.value?.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}
async function cancel() {
  if (unavailable.value) return
  if (
    dirty.value &&
    !(await confirm('未保存的表格、学期、日期和提醒设置会被放弃，已保存的课表不会改变', {
      title: '放弃这次导入？',
      confirmText: '放弃未保存内容',
      cancelText: '继续编辑',
    }))
  )
    return
  fileGeneration++
  editing.value = false
  raw.value = ''
  preview.value = null
  confirmed.value = false
  error.value = ''
}
function inspect() {
  error.value = ''
  preview.value = null
  confirmed.value = false
  try {
    validateCourseMetadata({ ...form, remindDays: Number(form.remindDays) })
    preview.value = { ...parseCourseTable(raw.value), revision: store.schedule?.revision || 0 }
  } catch (failure) {
    error.value = failure.message
  }
}
async function chooseFile(event) {
  const file = takeCourseFile(event.target)
  if (!file || disposed || unavailable.value || !store.principal) return
  const generation = ++fileGeneration,
    owner = store.principal
  fileRead?.abort()
  const controller = new AbortController()
  fileRead = controller
  invalidatePreview()
  error.value = ''
  reading.value = true
  try {
    const text = await readCourseFile(file, { signal: controller.signal })
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    raw.value = text
  } catch (failure) {
    if (
      !disposed &&
      generation === fileGeneration &&
      owner === store.principal &&
      failure.name !== 'AbortError'
    )
      error.value = `${failure.message}。当前填写和已保存课表没有改变，可重选文件或继续粘贴`
  } finally {
    if (fileRead === controller) fileRead = null
    if (!disposed && generation === fileGeneration && owner === store.principal) {
      reading.value = false
      if (error.value) {
        await nextTick()
        if (!disposed && generation === fileGeneration && owner === store.principal)
          fileError.value?.focus({ preventScroll: false })
      }
    }
  }
}
async function save() {
  if (unavailable.value || !preview.value || !confirmed.value || !store.loaded || store.error)
    return
  const owner = store.principal,
    proposal = preview.value,
    generation = fileGeneration
  busy.value = true
  error.value = ''
  versionConflict.value = false
  notice.value = ''
  try {
    validateCourseMetadata({ ...form, remindDays: Number(form.remindDays) })
    const response = await saveCourseSchedule({
      revision: proposal.revision,
      semester: form.semester.trim(),
      firstMonday: form.firstMonday,
      remindDays: Number(form.remindDays),
      courses: proposal.courses,
    })
    if (disposed || generation !== fileGeneration || !store.adopt(response.data.schedule, owner))
      return
    editing.value = false
    raw.value = ''
    preview.value = null
    confirmed.value = false
    notice.value = '课程表格已保存，仅本人可见；截图版保持不变'
    await nextTick()
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    heading.value?.focus({ preventScroll: true })
    heading.value?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  } catch (failure) {
    if (!disposed && generation === fileGeneration && owner === store.principal) {
      versionConflict.value = failure.response?.status === 409
      error.value =
        failure.response?.data?.message || failure.message || '保存未确认，请保留原文件并重试'
    }
  } finally {
    if (!disposed && generation === fileGeneration && owner === store.principal) busy.value = false
  }
}
async function reloadForComparison() {
  if (unavailable.value) return
  const owner = store.principal,
    generation = fileGeneration
  busy.value = true
  try {
    await store.load(true)
    if (disposed || generation !== fileGeneration || owner !== store.principal) return
    if (store.error) return
    invalidatePreview()
    error.value = ''
    versionConflict.value = false
    notice.value = editing.value
      ? '已读取最新保存内容，你的填写仍保留；请重新检查差异并确认，不会自动覆盖'
      : '已读取最新保存内容，请核对后再操作'
  } finally {
    if (!disposed && generation === fileGeneration && owner === store.principal) busy.value = false
  }
}
async function mutate(action) {
  if (unavailable.value || !store.schedule) return
  const owner = store.principal,
    revision = store.schedule.revision,
    generation = fileGeneration
  if (
    !(await confirm(
      action === 'delete'
        ? '删除本站保存的课程表格后，需要重新导入。截图版和教务数据不会改变'
        : '只有你已经对照教务或老师通知核对后，才记录本次核对时间；本站不会自动核对',
      {
        title: action === 'delete' ? '删除本站课程表格？' : '确认课程表格没有变化？',
        confirmText: action === 'delete' ? '删除本站表格' : '我已核对，记录时间',
      },
    )) ||
    revision !== store.schedule?.revision
  )
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (action === 'delete') {
      await deleteCourseSchedule(revision)
      if (!disposed && generation === fileGeneration && store.adopt(null, owner))
        notice.value = '本站课程表格已删除，截图版保持不变'
    } else {
      const response = await confirmCourseSchedule(revision)
      if (!disposed && generation === fileGeneration && store.adopt(response.data.schedule, owner))
        notice.value = '已记录核对时间，不代表实时教务同步'
    }
  } catch (failure) {
    if (!disposed && generation === fileGeneration && owner === store.principal) {
      versionConflict.value = failure.response?.status === 409
      error.value = failure.response?.data?.message || '操作未确认，请重新读取核对'
    }
  } finally {
    if (!disposed && generation === fileGeneration && owner === store.principal) busy.value = false
  }
}
function download(value, filename, type) {
  const url = URL.createObjectURL(new Blob([value], { type })),
    link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onMounted(async () => {
  const owner = store.principal,
    generation = fileGeneration
  await store.load()
  if (
    !disposed &&
    generation === fileGeneration &&
    owner === store.principal &&
    !store.schedule &&
    store.loaded &&
    !store.error
  )
    startImport(false)
})
onBeforeUnmount(() => {
  disposed = true
  fileGeneration++
  fileRead?.abort()
  fileRead = null
})
</script>
<template>
  <section class="course-panel" aria-label="私人课程表格" :aria-busy="unavailable || store.loading">
    <p class="course-boundary">
      按明确的周次和时间展示，不识别截图、不读取教务密码、不发送给AI。表格与截图分别保存，不会自动相互更新
    </p>
    <p v-if="store.loading" role="status">正在读取课程表格…</p>
    <div v-if="store.error" class="course-alert" role="alert">
      <p>{{ store.error }}</p>
      <button
        class="work-button"
        :disabled="store.loading || unavailable"
        @click="store.load(true)"
      >
        重新读取并核对差异
      </button>
    </div>
    <p v-if="notice" class="course-notice" role="status">{{ notice }}</p>
    <section v-if="store.schedule" class="course-saved" aria-label="已保存课程表格">
      <header class="course-head">
        <div>
          <h2 ref="heading" tabindex="-1">{{ store.schedule.semester }}</h2>
          <p>
            {{ store.schedule.courses.length }}条课程安排 · 核对于
            {{ dateLabel(store.schedule.checkedAt) }}
          </p>
        </div>
        <button
          v-if="!editing"
          class="work-button"
          :disabled="unavailable || !store.loaded"
          @click="startImport"
        >
          导入新表并比较
        </button>
      </header>
      <p class="course-check">
        {{ checkMessage }}
        <a
          href="https://zdjw.tsguas.edu.cn/app-web/#/tabs/home"
          target="_blank"
          rel="noopener noreferrer"
          >打开教务核对 ↗</a
        >
      </p>
      <p v-if="nextCourse" class="course-next">
        <strong>{{ nextCourse.current ? '导入表格中正在上的课' : '导入表格里的下一节' }}</strong
        ><br />{{ nextCourse.date }} · {{ nextCourse.startTime }}—{{ nextCourse.endTime }} ·
        {{ nextCourse.name }} · {{ nextCourse.room || '教室未填写' }}
      </p>
      <p v-else>已导入的课程没有后续安排，不代表之后没有课，请核对是否需要导入新学期</p>
      <label class="course-week"
        >查看周次<select v-model="selectedWeek">
          <option v-for="week in 30" :key="week" :value="week">
            第{{ week }}周{{ week === currentWeek ? '（按日期计算的本周）' : '' }}
          </option>
        </select></label
      >
      <p v-if="!displayed.length">这一周没有导入的课程；不要据此判断停课</p>
      <p v-if="conflicts.length" class="course-alert">
        本周有{{ conflicts.length }}组时间重叠，请回教务核对，不自动删掉其中任何一门
      </p>
      <div v-for="(day, i) in days" :key="day" class="course-day">
        <template v-if="displayed.some((c) => c.weekday === i + 1)"
          ><h3>{{ day }}</h3>
          <ul>
            <li
              v-for="course in displayed.filter((c) => c.weekday === i + 1)"
              :key="courseKey(course)"
            >
              <span>{{ course.startTime }}—{{ course.endTime }}</span
              ><strong>{{ course.name }}</strong
              ><span>{{ course.room || '教室未填写' }}</span>
            </li>
          </ul></template
        >
      </div>
      <div class="course-actions">
        <button class="work-button" :disabled="unavailable || editing" @click="mutate('checked')">
          我已核对，表格没变</button
        ><button
          class="work-button"
          @click="
            download(
              JSON.stringify(store.schedule, null, 2),
              '我的课程表格.json',
              'application/json',
            )
          "
        >
          下载私有表格数据</button
        ><button class="course-delete" :disabled="unavailable || editing" @click="mutate('delete')">
          删除本站表格
        </button>
      </div>
    </section>
    <div v-if="error" ref="fileError" class="course-alert" role="alert" tabindex="-1">
      <p>{{ error }}</p>
      <button
        v-if="versionConflict"
        class="work-button"
        :disabled="unavailable || store.loading"
        @click="reloadForComparison"
      >
        读取最新表格，保留当前填写
      </button>
    </div>
    <div v-if="!store.schedule && !editing && store.loaded && !store.error">
      <h2>还没有导入课程表格</h2>
      <button class="work-button primary" @click="startImport">导入CSV或粘贴表格</button>
    </div>
    <form v-if="editing" class="course-import" @submit.prevent="inspect">
      <h2 ref="importHeading" tabindex="-1">
        {{ store.schedule ? '预览差异，再替换表格' : '导入可按周查看的课程表格' }}
      </h2>
      <p>
        当前支持通用六列表格，不保证教务原始导出能直接识别。按照示例保留表头，填写准确时间和周次；教室可以留空。若只有截图，请使用截图版
      </p>
      <fieldset :disabled="unavailable">
        <div class="course-actions">
          <button
            type="button"
            class="work-button"
            @click="download(COURSE_TEMPLATE, '课程表格模板.csv', 'text/csv;charset=utf-8')"
          >
            下载六列CSV示例</button
          ><label class="course-file"
            >选择CSV / TSV文件<input
              type="file"
              accept=".csv,.tsv,.txt"
              aria-describedby="course-file-help"
              @change="chooseFile"
          /></label>
        </div>
        <p id="course-file-help">读取成功后替换下方文字；失败保留当前填写。选择文件不会保存课表</p>
        <p v-if="reading" role="status">正在本机读取文件…</p>
        <div class="course-fields">
          <label>学期<input v-model="form.semester" maxlength="100" required /></label
          ><label
            >第1周周一日期<input v-model="form.firstMonday" type="date" required /><small
              >按校历确认，不能把今天默认当成第1周</small
            ></label
          ><label
            >核对提醒<select v-model="form.remindDays">
              <option :value="3">每3天</option>
              <option :value="7">每7天</option>
              <option :value="14">每14天</option>
              <option :value="0">关闭定期提醒</option>
            </select></label
          >
        </div>
        <label class="course-text"
          >粘贴课程表格（含表头）<textarea
            v-model="raw"
            maxlength="50000"
            rows="7"
            placeholder="课程名称,星期,开始时间,结束时间,周次,教室&#10;课程示例,1,08:00,09:40,1-16单,教室示例"
          /><small
            >星期填1至7；时间填08:00；周次可填1-16、1-16单、1-16双或1;3;5。最多120条，不导入姓名、学号或成绩</small
          ></label
        >
        <div class="course-actions">
          <button
            class="work-button primary"
            type="submit"
            :disabled="!raw.trim() || !store.loaded || !!store.error"
          >
            检查并预览差异</button
          ><button class="work-button" type="button" @click="cancel">取消，保留已保存内容</button>
        </div>
        <section v-if="preview" class="course-preview" aria-label="待保存课程及差异">
          <h3>待保存{{ preview.courses.length }}条课程安排</h3>
          <p>
            合并{{ preview.duplicates }}条完全重复行 · 与本站已保存内容比较：新增{{
              difference.added.length
            }}条、移除{{ difference.removed.length }}条、未变{{ difference.unchanged }}条
          </p>
          <p v-if="metadataChange" class="course-alert">
            学期、第1周日期或提醒设置发生变化；同一课程也可能因此对应不同日期，请逐项核对
          </p>
          <p v-if="preview.conflicts.length" class="course-alert">
            有{{ preview.conflicts.length }}组时间重叠。系统保留它们，不替你判断哪门课正确
          </p>
          <details v-if="preview.conflicts.length">
            <summary>查看时间重叠的课程</summary>
            <ul>
              <li v-for="(pair, i) in preview.conflicts.slice(0, 20)" :key="i">
                {{ preview.courses[pair.a].name }} / {{ preview.courses[pair.b].name }} ·
                {{ days[preview.courses[pair.a].weekday - 1] }} · 第{{ pair.weeks.join('、') }}周
              </li>
            </ul>
            <p v-if="preview.conflicts.length > 20">仅列出前20组，请核对全部课程安排</p>
          </details>
          <details v-if="difference.removed.length">
            <summary>将移除的{{ difference.removed.length }}条安排</summary>
            <ul>
              <li v-for="course in difference.removed" :key="courseKey(course)">
                {{ course.name }} · {{ days[course.weekday - 1] }} · {{ course.startTime }}—{{
                  course.endTime
                }}
                · 第{{ course.weeks.join('、') }}周 · {{ course.room || '教室未填' }}
              </li>
            </ul>
          </details>
          <details open>
            <summary>核对全部{{ preview.courses.length }}条待保存安排</summary>
            <ul>
              <li v-for="course in preview.courses" :key="courseKey(course)">
                {{ course.name }} · {{ days[course.weekday - 1] }} · {{ course.startTime }}—{{
                  course.endTime
                }}
                · 第{{ course.weeks.join('、') }}周 · {{ course.room || '教室未填' }}
              </li>
            </ul>
          </details>
          <label class="course-confirm"
            ><input
              v-model="confirmed"
              type="checkbox"
            />我已核对日期、周次、全部课程及移除项；重叠课程也已确认</label
          >
          <button
            class="work-button primary"
            type="button"
            :disabled="!confirmed || !store.loaded || !!store.error"
            @click="save"
          >
            {{ busy ? '正在保存…' : store.schedule ? '确认替换课程表格' : '确认保存课程表格' }}
          </button>
        </section>
      </fieldset>
    </form>
    <p class="course-boundary">
      没有导入的周次或课程不会补猜；下一节仅在页面打开时展示，不提供后台推送。没有实时教务同步，调课后请重新导入
    </p>
  </section>
</template>
<style scoped>
.course-panel {
  color: var(--ct-ink);
  font-size: 16px;
  line-height: 1.7;
  min-width: 0;
}
.course-panel p,
.course-panel li,
.course-panel strong {
  overflow-wrap: anywhere;
}
.course-panel h2 {
  font-size: 22px;
  line-height: 1.4;
  margin: 0 0 10px;
  scroll-margin-top: 16px;
  overflow-wrap: anywhere;
}
.course-panel h3 {
  font-size: 18px;
  line-height: 1.5;
  margin: 0 0 12px;
}
.course-panel a {
  color: var(--ct-blue);
  text-underline-offset: 4px;
}
.course-panel button,
.course-panel a,
.course-panel select,
.course-panel input,
.course-panel textarea,
.course-panel summary {
  accent-color: var(--ct-blue);
}
.course-panel :focus-visible {
  outline: 2px solid var(--ct-blue);
  outline-offset: 3px;
}
.course-boundary,
.course-head p,
.course-fields small,
.course-text small {
  color: #526377;
}
.course-boundary {
  margin: 16px 0 24px;
}
.course-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.course-head button {
  flex: none;
}
.course-head > div {
  min-width: 0;
  max-width: 100%;
}
.course-head p {
  margin: 0;
}
.course-check {
  padding: 16px 20px;
  background: #edf2ec;
  color: #34513d;
  border-radius: var(--ct-radius-control);
}
.course-check a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  margin-inline-start: 12px;
}
.course-next {
  padding-block: 10px 22px;
  border-bottom: 1px solid var(--ct-line);
}
.course-week {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin: 24px 0;
  font-weight: 600;
}
.course-week select {
  max-width: 100%;
}
.course-day:empty {
  display: none;
}
.course-day {
  margin-block: 28px;
}
.course-day ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.course-day li {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr) minmax(100px, 0.5fr);
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--ct-line);
  font-variant-numeric: tabular-nums;
}
.course-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-block: 20px;
}
.course-delete {
  border: none;
  color: #526377;
  background: transparent;
  text-decoration: underline;
  text-underline-offset: 4px;
  min-height: 44px;
  padding: 10px;
  font: inherit;
  cursor: pointer;
}
.course-alert,
.course-notice {
  padding: 16px 20px;
  border-radius: var(--ct-radius-control);
  background: #f4efe3;
  color: #625133;
}
.course-notice {
  background: #edf2ec;
  color: #34513d;
}
.course-import {
  margin-top: 32px;
  padding: 24px;
  border-radius: var(--ct-radius-panel);
  background: var(--ct-white);
  border: 1px solid var(--ct-line);
}
.course-import > p {
  max-width: 65ch;
  color: #526377;
}
.course-import fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.course-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-block: 24px;
}
.course-fields label,
.course-text,
.course-file {
  display: grid;
  gap: 8px;
  min-width: 0;
  font-weight: 600;
}
.course-fields small,
.course-text small {
  font-weight: 400;
  font-size: 14px;
}
.course-panel input:not([type='checkbox']),
.course-panel select,
.course-panel textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 10px 12px;
  font: inherit;
  color: var(--ct-ink);
  background: var(--ct-paper);
  border: 1px solid var(--ct-line);
  border-radius: 14px;
}
.course-panel textarea {
  resize: vertical;
}
.course-panel textarea::placeholder {
  color: #526377;
}
.course-preview {
  border-top: 1px solid var(--ct-line);
  padding-top: 24px;
  margin-top: 24px;
}
.course-preview details {
  margin-block: 18px;
}
.course-preview summary {
  min-height: 44px;
  cursor: pointer;
  padding-block: 10px;
  font-weight: 600;
}
.course-preview ul {
  padding-inline-start: 20px;
}
.course-preview li {
  margin-block: 10px;
}
.course-confirm {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
  padding-block: 14px;
}
.course-confirm input {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 4px;
}
@media (max-width: 760px) {
  .course-head {
    flex-direction: column;
    gap: 16px;
  }
  .course-fields {
    grid-template-columns: 1fr;
  }
  .course-import {
    padding: 18px;
  }
  .course-day li {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .course-check a {
    margin-inline-start: 0;
  }
}
</style>
