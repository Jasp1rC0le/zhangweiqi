<script setup>
import DateField from '@/components/DateField.vue'
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  readPersonalTerms,
  readPersonalHistory,
  readPersonalRevision,
  savePersonalEdits,
  readPersonalEditReceipt,
} from '@/api/personalScheduleEditing'
import { validatedCourseSnapshot } from '@/utils/privateCourseSchedule'
import { courseKey, courseTimeLabel } from '@/utils/courseSchedule'
import { planPersonalOperation, planPersonalRestore } from '@/utils/personalScheduleOperations'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import { captureAuditFocusIntent } from '@/utils/teachingAdministrativeAudit'
import { personalCourseMatches, personalCourseSelection, requiredPersonalTerm } from '@/utils/personalCourseSelection'
import { captureDraftFields, hasDraftFieldChanges } from '@/utils/formDraft'

const props = defineProps({ scope: String, disabled: Boolean })
const emit = defineEmits(['changed', 'state'])
const root = ref(),
  previewHeading = ref(), termSelector = ref(), errorTarget = ref(), courseList = ref()
defineExpose({ openPanel })
const open = ref(false),
  busy = ref(false),
  error = ref(''),
  notice = ref(''),
  terms = ref([]),
  enabled = ref(false),
  sourceId = ref(''),
  keys = ref([]),
  preview = ref(null),
  pending = ref(null),
  history = ref(null),
  historyPage = ref(0),
  showHistory = ref(false),
  query = ref(''),
  missingTeachersOnly = ref(false),
  sourceIntent = ref(null),
  page = ref(0)
const defaultForm = Object.freeze({
  operation: 'DATE',
  fromDate: '',
  toDate: '',
  room: '',
  teacher: '',
  startTime: '',
  endTime: '',
  weekday: '',
  weeks: '',
  destination: 'new',
  semester: '',
  firstMonday: '',
  targetWeeks: '',
  reason: '',
})
const form = reactive({ ...defaultForm })
const fieldBaseline = captureDraftFields(defaultForm, Object.keys(defaultForm).filter(key => !['operation', 'destination'].includes(key)))
const fieldsDirty = computed(() => hasDraftFieldChanges(form, fieldBaseline))
function resetForm() { Object.assign(form, defaultForm) }
let generation = 0,
  focusIntent,
  controller,
  disposed = false
const source = computed(() => terms.value.find((t) => t.firstMonday === sourceId.value)),
  matches = computed(() => personalCourseMatches(source.value?.courses, query.value, missingTeachersOnly.value)),
  missingTeachers = computed(() => source.value?.courses.filter(course => !course.teacher?.trim()).length || 0),
  selection = computed(() => personalCourseSelection(matches.value, keys.value)),
  rows = computed(() => matches.value.slice(page.value * 25, (page.value + 1) * 25)),
  locked = computed(() => busy.value || props.disabled || !!pending.value || !!preview.value)
const { confirm, confirming } = useScopedConfirmation(
  () => `${props.scope}:${preview.value?.requestId || ''}`,
  () => open.value && !disposed,
)
const dirty = computed(() => fieldsDirty.value || keys.value.length > 0 || !!preview.value || !!pending.value)
useUnsavedChanges(
  () => open.value && dirty.value,
  () => busy.value || confirming.value,
)
watch(
  [busy, confirming, dirty],
  () => emit('state', { busy: busy.value || confirming.value, dirty: dirty.value }),
  { immediate: true },
)
function invalidate() {
  if (!pending.value && !busy.value) preview.value = null
}
watch(form, invalidate, { deep: true })
watch([sourceId, query, missingTeachersOnly], () => {
  page.value = 0
})
watch([sourceId, query, missingTeachersOnly, page], () => {
  if (!disposed && courseList.value) courseList.value.scrollTop = 0
}, { flush: 'post' })
watch(sourceId, () => {
  keys.value = []
  preview.value = null
})
watch(
  () => props.scope,
  () => {
    generation++
    controller?.abort()
    open.value = false
    busy.value = false
    error.value = ''
    notice.value = ''
    terms.value = []
    keys.value = []
    preview.value = pending.value = history.value = null
    query.value = ''
    missingTeachersOnly.value = false
    sourceIntent.value = null
    sourceId.value = ''
    resetForm()
  },
  { flush: 'sync' },
)
async function run(work) {
  if (busy.value || props.disabled || !props.scope || disposed) return
  controller?.abort()
  controller = new AbortController()
  const epoch = ++generation,
    owner = props.scope,
    op = {
      signal: controller.signal,
      current: () =>
        !disposed && generation === epoch && props.scope === owner && !controller.signal.aborted,
    }
  busy.value = true
  error.value = ''
  try {
    return await work(op)
  } catch (e) {
    if (op.current())
      error.value = e.response?.data?.message || e.message || '未完成，请保留草稿重试。'
  } finally {
    if (op.current()) busy.value = false
  }
}
async function load(op) {
  const value = await readPersonalTerms(op.signal)
  if (!op.current()) return
  if (!Array.isArray(value.terms) || value.terms.length > 24)
    throw new Error('学期列表异常，没有使用不完整来源。')
  terms.value = value.terms.map(validatedCourseSnapshot)
  enabled.value = value.historyEnabled === true
  if (!terms.value.some((t) => t.firstMonday === sourceId.value))
    sourceId.value = sourceIntent.value ? '' : terms.value[0]?.firstMonday || ''
}
async function openPanel(options = {}) {
  if (!props.scope || props.disabled || busy.value || disposed || dirty.value) return
  const owner = props.scope
  focusIntent?.dispose()
  const intent = (focusIntent = captureAuditFocusIntent(document))
  try {
    if (options.firstMonday != null) {
      notice.value = ''
      resetForm()
      sourceIntent.value = { owner, firstMonday: options.firstMonday, missingTeachersOnly: options.missingTeachersOnly === true, operation: options.operation }
      sourceId.value = ''
      open.value = true
      await run(async op => {
        await load(op)
        if (!op.current()) return
        const requested = sourceIntent.value
        if (!requested || requested.owner !== props.scope) return
        sourceId.value = requiredPersonalTerm(terms.value, requested.firstMonday)
        query.value = ''
        missingTeachersOnly.value = requested.missingTeachersOnly
        if (requested.operation === 'BATCH') form.operation = 'BATCH'
        sourceIntent.value = null
      })
    } else {
      if (!open.value) await toggle()
      if (options.operation === 'BATCH') form.operation = 'BATCH'
    }
    await nextTick()
    if (owner === props.scope && open.value && !disposed && intent.current()) {
      root.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
      ;(error.value ? errorTarget : termSelector).value?.focus({ preventScroll: true })
    }
  } finally { intent.dispose() }
}
async function retrySourceIntent() {
  const intent = sourceIntent.value
  if (intent?.owner === props.scope) await openPanel(intent)
}
function manualSource() { sourceIntent.value = null; error.value = '' }
function resetFilters() { query.value = ''; missingTeachersOnly.value = false }
function clearHiddenSelection() { keys.value = selection.value.inside }
async function toggle() {
  if (open.value) {
    if (
      dirty.value &&
      !(await confirm('收起将放弃未提交字段。待确认的已发送请求仍须先核对。', {
        title: '收起个人课表操作？',
        confirmText: '收起',
        cancelText: '继续编辑',
      }))
    )
      return
    if (pending.value) {
      open.value = false
      return
    }
    keys.value = []
    preview.value = null
    sourceIntent.value = null
    resetForm()
    open.value = false
    return
  }
  open.value = true
  await run(load)
}
async function prepare() {
  if (selection.value.hidden.length) return
  await run(async (op) => {
    focusIntent?.dispose()
    const intent = (focusIntent = captureAuditFocusIntent(document))
    try {
      const before = JSON.stringify(terms.value)
      await load(op)
      if (!op.current()) return
      if (before !== JSON.stringify(terms.value))
        throw new Error('学期版本已变化，请重新核对选择。')
      if (!enabled.value) throw new Error('服务器尚未启用个人课表历史和可靠回执。')
      const destination = terms.value.find((t) => t.firstMonday === form.destination) || null
      const plan = planPersonalOperation(source.value, keys.value, { ...form }, destination)
      preview.value = { ...plan, requestId: crypto.randomUUID(), until: Date.now() + 300000 }
      await nextTick()
      if (op.current() && intent.current()) {
        previewHeading.value?.focus({ preventScroll: true })
        previewHeading.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
    } finally {
      intent.dispose()
    }
  })
}
async function refreshHistory() {
  showHistory.value = true
  await run(async (op) => {
    const result = await readPersonalHistory(historyPage.value, op.signal)
    if (op.current()) history.value = result
  })
}
function historyAt(page) {
  historyPage.value = page
  void refreshHistory()
}
async function restore(row) {
  await run(async (op) => {
    focusIntent?.dispose()
    const intent = (focusIntent = captureAuditFocusIntent(document))
    try {
      const old = validatedCourseSnapshot(await readPersonalRevision(row.revision, op.signal))
      await load(op)
      if (!op.current()) return
      const current = terms.value.find((t) => t.firstMonday === old.firstMonday)
      preview.value = {
        payload: planPersonalRestore(old, current),
        lines: [
          `恢复${old.semester}的历史版本${old.revision}内容，共${old.courses.length}项。`,
          '会生成新版本；不会删除现有历史，也不会回拨版本编号。',
        ],
        requestId: crypto.randomUUID(),
        until: Date.now() + 300000,
      }
      await nextTick()
      if (op.current() && intent.current()) {
        previewHeading.value?.focus({ preventScroll: true })
        previewHeading.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
      }
    } finally {
      intent.dispose()
    }
  })
}
async function commit() {
  const plan = preview.value,
    owner = props.scope
  if (!plan || (locked.value && busy.value)) return
  if (
    !(await confirm(plan.lines.join('\n'), {
      title: '确认修改本人课表？',
      confirmText: '确认保存新版本',
      cancelText: '返回核对',
    }))
  )
    return
  if (props.scope !== owner || preview.value !== plan) return
  await run(async (op) => {
    if (Date.now() > plan.until) throw new Error('预览已过5分钟，请返回重新生成。')
    pending.value = plan
    preview.value = null
    try {
      const receipt = await savePersonalEdits(plan.requestId, plan.payload, op.signal)
      if (!op.current()) return
      if (
        receipt?.kind !== 'PERSONAL_SCHEDULE' ||
        receipt.requestId !== plan.requestId ||
        !receipt.result?.schedule
      )
        throw new Error('保存回执异常，请核对原请求，不要重发。')
      await load(op)
      if (!op.current()) return
      pending.value = null
      keys.value = []
      resetForm()
      notice.value = '新版本已保存并重新读取。原版本保留；正式教学和考勤未修改。'
      emit('changed')
    } catch (e) {
      if (op.current() && [400, 401, 403, 409, 422].includes(e.response?.status)) {
        pending.value = null
        preview.value = plan
      }
      throw e
    }
  })
}
async function reconcile() {
  await run(async (op) => {
    const plan = pending.value
    if (!plan) return
    const receipt = await readPersonalEditReceipt(plan.requestId, op.signal)
    if (!op.current()) return
    if (receipt?.requestId !== plan.requestId || receipt.kind !== 'PERSONAL_SCHEDULE')
      throw new Error('回执目标不一致，没有重新保存。')
    await load(op)
    if (!op.current()) return
    pending.value = null
    keys.value = []
    resetForm()
    notice.value = '已找到原保存回执并读取最新学期；没有重复提交。'
    emit('changed')
  })
}
onBeforeUnmount(() => {
  focusIntent?.dispose()
  disposed = true
  generation++
  controller?.abort()
})
</script>
<template>
  <section ref="root" class="personal-operations" aria-label="个人课表修改与历史">
    <button
      class="work-button"
      type="button"
      :disabled="disabled || busy"
      :aria-expanded="open"
      @click="toggle"
    >
      {{ open ? '收起个人课表操作' : '单日改课、批量操作与历史恢复' }}
    </button>
    <div v-if="open">
      <p>仅修改本人保存的副本。先选学期和具体安排，再预览；原版本保留，不改正式教学。</p>
      <p v-if="busy" role="status">正在核对本人课表…</p>
      <p v-if="error" ref="errorTarget" class="failure" role="alert" tabindex="-1">{{ error }} <button v-if="sourceIntent" type="button" :disabled="locked" @click="retrySourceIntent">重试当前学期核对</button></p>
      <p v-if="notice" role="status">{{ notice }}</p>
      <p v-if="fieldsDirty && !preview && !pending" class="course-filter-hint" role="status">未保存字段仍保留，清除选择不会放弃字段。开始另一项任务前，请先收起并确认放弃，或完成当前修改。</p>
      <p v-if="!enabled && !busy && !error">当前服务器尚未启用这组操作，请先完成版本与历史存储更新。</p>
      <div v-if="pending">
        <p>结果尚待核对，已锁定原请求，不会按新内容重复保存。</p>
        <button type="button" :disabled="busy" @click="reconcile">核对原保存回执</button>
      </div>
      <template v-else-if="preview"
        ><h3 ref="previewHeading" tabindex="-1">确认修改范围</h3>
        <ul>
          <li v-for="line in preview.lines" :key="line">{{ line }}</li>
        </ul>
        <div class="actions">
          <button class="primary" type="button" :disabled="busy || confirming" @click="commit">
            确认保存新版本</button
          ><button type="button" :disabled="busy" @click="preview = null">返回修改</button>
        </div></template
      >
      <template v-else-if="enabled">
        <label
          >选择保存学期<select ref="termSelector" v-model="sourceId" :disabled="locked" @change="manualSource">
            <option v-if="!sourceId" value="" disabled>请核对并选择保存学期</option>
            <option v-for="term in terms" :key="term.firstMonday" :value="term.firstMonday">
              {{ term.semester }} · {{ term.firstMonday }}起 · {{ term.courses.length }}项
            </option>
          </select></label
        >
        <p v-if="!terms.length">尚无个人课表，请先从上方导入。</p>
        <template v-if="source">
          <label
            >查找课程<input v-model="query" type="search" maxlength="100" placeholder="课程名、任课教师或教室" :disabled="locked"
          /></label>
          <div class="course-filter-actions"><label class="missing-teacher-filter"><input v-model="missingTeachersOnly" type="checkbox" :disabled="locked" /><span>只看未填任课教师</span></label><button type="button" :disabled="locked || (!query && !missingTeachersOnly)" @click="resetFilters">重置筛选</button></div>
          <p class="course-filter-count" role="status">本学期共{{ source.courses.length }}项 · 未填教师{{ missingTeachers }}项 · 当前筛选{{ matches.length }}项</p>
          <p class="course-filter-hint">按已保存姓名筛选，不验证教师账号绑定；不会自动勾选或替你填写姓名。</p>
          <div class="course-selection-scope"><span>已选{{ keys.length }}项</span><button v-if="keys.length" type="button" :disabled="locked" @click="keys = []">清除所有选择</button></div>
          <p v-if="selection.hidden.length" class="selection-warning" role="status">其中{{ selection.hidden.length }}项不在当前筛选中，预览前请清除它们或重置筛选核对。<button type="button" :disabled="locked" @click="clearHiddenSelection">清除筛选外选择</button></p>
          <p v-if="!matches.length" class="course-filter-empty">{{ missingTeachersOnly && !missingTeachers && !query ? '该学期任课教师姓名已填齐。可取消筛选查看或修正已有姓名。' : '当前筛选没有匹配课程。可重置筛选，已保存的课程没有删除。' }}</p>
          <ul ref="courseList" class="course-list">
            <li v-for="course in rows" :key="courseKey(course)">
              <label
                ><input
                  v-model="keys"
                  type="checkbox"
                  :value="courseKey(course)"
                  :disabled="locked"
                /><span
                  ><strong>{{ course.name }}</strong
                  ><br />周{{ '一二三四五六日'[course.weekday - 1] }}
                  {{ courseTimeLabel(course) }} · {{ course.room || '未填教室' }} · {{ course.teacher || '任课教师未录入' }}<br /><small
                    >第{{ course.weeks.join('、') }}周</small
                  ></span
                ></label
              >
            </li>
          </ul>
          <nav v-if="matches.length > 25" aria-label="个人操作课程分页">
            <button type="button" :disabled="locked || page === 0" @click="page--">上一页</button
            ><span
              >{{ page + 1 }} / {{ Math.ceil(matches.length / 25) }}页 · 已选{{
                keys.length
              }}项</span
            ><button
              type="button"
              :disabled="locked || (page + 1) * 25 >= matches.length"
              @click="page++"
            >
              下一页
            </button>
          </nav>
          <form @submit.prevent="prepare">
            <fieldset :disabled="locked">
              <label
                >如何处理已选{{ keys.length }}项<select v-model="form.operation" :disabled="locked">
                  <option value="DATE">仅修改某一天</option>
                  <option value="BATCH">批量修改共同字段</option>
                  <option value="DELETE">删除所选安排，保留历史</option>
                  <option value="MOVE_TERM">移动到另一个学期</option>
                  <option value="COPY_TERM">复制到另一个学期</option>
                </select></label
              >
              <div v-if="form.operation === 'DATE'" class="fields">
                <label>原上课日期<DateField v-model="form.fromDate" required  :disabled="locked" /></label
                ><label>新上课日期<DateField v-model="form.toDate" required  :disabled="locked" /></label>
              </div>
              <div v-if="['DATE', 'BATCH'].includes(form.operation)" class="fields">
                <label>新任课教师，留空不改<input v-model="form.teacher" maxlength="100" placeholder="只记录姓名，不建立授课账号绑定" /></label>
                <label>新教室，留空不改<input v-model="form.room" maxlength="100" /></label
                ><label v-if="form.operation === 'BATCH'"
                  >仅修改周次，留空为全部原周次<input
                    v-model="form.weeks"
                    maxlength="160"
                    placeholder="例如2;4或2-6" /></label
                ><label v-if="form.operation === 'BATCH'"
                  >新星期<select v-model="form.weekday">
                    <option value="">保持原星期</option>
                    <option v-for="n in 7" :key="n" :value="n">
                      周{{ '一二三四五六日'[n - 1] }}
                    </option>
                  </select></label
                ><label>新开始钟点，留空不改<input v-model="form.startTime" type="time" /></label
                ><label>新结束钟点<input v-model="form.endTime" type="time" /></label>
              </div>
              <p v-if="form.operation === 'BATCH' && keys.length > 1 && form.teacher.trim()" class="selection-warning">将同一教师姓名用于所选{{ keys.length }}项安排。请先确认这些安排确属同一任课教师，再核对预览。</p>
              <div v-if="form.operation.endsWith('_TERM')" class="fields">
                <label
                  >目标学期<select v-model="form.destination">
                    <option value="new">新增明确学期</option>
                    <option
                      v-for="term in terms.filter((t) => t.firstMonday !== sourceId)"
                      :key="term.firstMonday"
                      :value="term.firstMonday"
                    >
                      {{ term.semester }} · {{ term.firstMonday }}
                    </option>
                  </select></label
                ><template v-if="form.destination === 'new'"
                  ><label
                    >新学期名称<input v-model="form.semester" required maxlength="100" /></label
                  ><label
                    >新学期第1周周一<DateField
                      v-model="form.firstMonday"
                      required  monday-only :disabled="locked" /></label></template
                ><label
                  >目标学期上课周次<input
                    v-model="form.targetWeeks"
                    required
                    maxlength="160"
                    placeholder="例如1-16"
                /></label>
              </div>
              <label
                >修改原因<textarea v-model="form.reason" required maxlength="500" rows="2" /></label
              ><button class="primary" :disabled="locked || !keys.length || !!selection.hidden.length">
                预览修改，不立即保存
              </button>
            </fieldset>
          </form>
        </template>
        <button type="button" :disabled="locked" @click="historyAt(0)">查看历史版本</button>
        <section v-if="showHistory && history" aria-label="个人课表历史">
          <h3>保存历史 · {{ history.total }}条</h3>
          <p>旧系统没有记录的修改无法补造；首次出现的旧副本会标记为基线。</p>
          <ul class="history-list">
            <li v-for="row in history.items" :key="row.revision">
              <div>
                <strong>{{ row.semester }} · 版本{{ row.revision }}</strong>
                <p>{{ row.reason }}</p>
              </div>
              <button type="button" :disabled="locked" @click="restore(row)">预览恢复</button>
            </li>
          </ul>
          <nav v-if="history.total > 25">
            <button
              type="button"
              :disabled="locked || historyPage === 0"
              @click="historyAt(historyPage - 1)"
            >
              上一页</button
            ><span>{{ historyPage + 1 }} / {{ Math.ceil(history.total / 25) }}</span
            ><button
              type="button"
              :disabled="locked || (historyPage + 1) * 25 >= history.total"
              @click="historyAt(historyPage + 1)"
            >
              下一页
            </button>
          </nav>
        </section>
      </template>
    </div>
  </section>
</template>
<style scoped>
.personal-operations {
  margin-block: 20px;
  color: var(--assistant-ink, #29323c);
  font-size: 16px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
.personal-operations > div {
  margin-top: 18px;
  max-width: 70ch;
}
.personal-operations h3 {
  scroll-margin-top: 100px;
  font-size: 18px;
  margin: 24px 0 12px;
}
.personal-operations fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.personal-operations label {
  display: grid;
  gap: 7px;
  margin: 12px 0;
  min-width: 0;
}
.personal-operations :is(input, select, textarea, button) {
  font: inherit;
  font-size: 16px;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  min-height: 46px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 12px;
  padding: 10px 12px;
  background: var(--assistant-surface, #fff);
  color: inherit;
}
.personal-operations button {
  cursor: pointer;
}
.personal-operations button:hover {
  background: var(--assistant-soft, #eaf2ff);
}
.personal-operations button.primary {
  background: var(--assistant-accent, #0b62db);
  color: white;
  border: 0;
}
.personal-operations :disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.personal-operations :focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
}
.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.actions,
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 16px 0;
}
.course-list,
.history-list {
  list-style: none;
  padding: 0;
  max-height: 390px;
  overflow: auto;
}
.course-list li,
.history-list li {
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
}
.course-list label {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 2px;
  margin: 0;
  min-height: 64px;
}
.course-list input {
  width: 22px;
  min-height: 22px;
  flex: none;
  accent-color: var(--assistant-accent, #0b62db);
}
.history-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
}
.history-list p {
  margin: 4px 0;
}
.failure {
  color: var(--assistant-danger, #bf303d);
}
.course-filter-actions,.course-selection-scope{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;margin-block:12px}.personal-operations label.missing-teacher-filter{display:flex;align-items:center;gap:10px;min-height:46px;margin:0;cursor:pointer}.missing-teacher-filter input{width:22px;min-height:22px;flex:none;accent-color:var(--assistant-accent,#0b62db)}.course-filter-count,.course-filter-hint{font-size:14px;color:var(--assistant-muted,#5d6876);margin:6px 0}.course-selection-scope{font-variant-numeric:tabular-nums}.selection-warning{color:var(--assistant-warning,#9a5400)}.selection-warning button{margin-inline-start:8px}.course-filter-empty{margin-block:18px}.course-filter-actions :disabled,.selection-warning :disabled{cursor:not-allowed}
small {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
}
form > button {
  margin: 8px 0 20px;
}
@media (max-width: 600px) {
  .fields {
    grid-template-columns: 1fr;
  }
  .actions > button {
    flex: 1;
  }
  .history-list li {
    align-items: flex-start;
  }
  .history-list button {
    flex: none;
    max-width: 7em;
  }
}
</style>
