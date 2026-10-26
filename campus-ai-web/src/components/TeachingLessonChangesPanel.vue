<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  readLessonChangeAccess,
  readLessonChangePage,
  readLessonChangeTarget,
  previewLessonChange,
  saveLessonChange,
  readLessonChangeReceipt,
  readTeachingConfigPage,
} from '@/api/teaching'
import { createLessonChangeResource, LESSON_CONFLICTS } from '@/utils/teachingLessonChanges'
import { planLessonChangeFollowup } from '@/utils/lessonChangeChat'
import { resolveFormalTarget } from '@/utils/formalCourseDraft'
import { chinaDate, addDays } from '@/utils/timetable'
import { teachingDate, teachingClock } from '@/utils/teaching'
import { useUnsavedChanges } from '@/utils/useUnsavedChanges'
import { useScopedConfirmation } from '@/utils/useScopedConfirmation'
import TeachingScopePicker from './TeachingScopePicker.vue'
import '@/styles/teaching-confirmation.css'
const props = defineProps({
  owner: { type: String, required: true },
  actorId: { type: Number, required: true },
  active: { type: Boolean, default: true },
  disabled: Boolean,
  inline: Boolean,
  instructions: { type: String, default: '' },
  userRole: { type: String, default: 'ADMIN' },
  schoolId: { type: Number, default: 0 },
})
const emit = defineEmits(['state', 'saved', 'closed'])
const root = ref(),
  opened = ref(false),
  heading = ref(),
  previewHeading = ref(),
  savedHeading = ref()
const changingTeacher = ref(false)
const resolving = ref(false), followup = ref(''), followupHeading = ref(), confirmationButton = ref()
let followupEpoch = 0, followupController, queuedInstruction = props.instructions
const state = reactive({
  access: null,
  page: null,
  target: null,
  preview: null,
  receipt: null,
  phase: 'list',
  busy: false,
  error: '',
  notice: '',
  canRetry: false,
})
const query = reactive({
  from: chinaDate(),
  to: addDays(chinaDate(), 6),
  page: 0,
  size: 25,
  search: '',
})
const form = reactive({
  action: 'RESCHEDULE',
  date: '',
  startTime: '',
  endTime: '',
  teacherId: '',
  room: '',
  reason: '',
})
let disposed = false,
  requestId = crypto.randomUUID()
const owner = () => (!disposed && props.active ? props.owner : '')
const resource = createLessonChangeResource({
  owner,
  actorId: () => props.actorId,
  state,
  readAccess: readLessonChangeAccess,
  readPage: readLessonChangePage,
  readTarget: readLessonChangeTarget,
  preview: previewLessonChange,
  save: saveLessonChange,
  readReceipt: readLessonChangeReceipt,
})
const { confirm, confirming } = useScopedConfirmation(
  () => `${owner()}:${state.target?.lessonId || ''}:${state.preview?.fingerprint || ''}`,
  () => !!owner(),
)
const busy = computed(() => state.busy || resolving.value || confirming.value || props.disabled)
const dirty = computed(() => !!state.target && state.phase !== 'saved')
useUnsavedChanges(
  () => !!owner() && dirty.value,
  () => busy.value,
)
watch([dirty, busy, () => state.phase], () => emit('state', { dirty: dirty.value, busy: busy.value, phase: state.phase }), {
  immediate: true,
})
watch(form, () => resource.invalidate(), { deep: true, flush: 'sync' })
function wipeForm() {
  Object.assign(form, {
    action: 'RESCHEDULE',
    date: '',
    startTime: '',
    endTime: '',
    teacherId: '',
    room: '',
    reason: '',
  })
  changingTeacher.value = false
  requestId = crypto.randomUUID()
}
async function focus(element) {
  const principal = owner()
  await nextTick()
  if (principal && principal === owner() && element) {
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
}
async function list(page = 0) {
  if (busy.value) return
  if (
    dirty.value &&
    !(await confirm('当前调停课草稿尚未保存。返回课程清单会清空本次输入；不会提交修改。', {
      title: '返回课程清单',
      confirmText: '丢弃草稿并返回',
      className: 'ct-teaching-change-confirm',
    }))
  )
    return
  if (await resource.list({ ...query, page })) {
    query.page = page
    wipeForm()
    await focus(heading.value)
  }
}
async function activate() {
  if (!owner() || busy.value || !opened.value) return
  if (!state.access && !(await resource.access())) return
  if (state.access.enabled && !state.page && !state.target) await list(0)
}
async function toggle(event) {
  opened.value = event.target.open
  if (opened.value) await activate()
}
async function select(id) {
  if (busy.value) return
  if (await resource.select(id)) {
    const t = state.target
    wipeForm()
    Object.assign(form, {
      date: t.date,
      startTime: t.startTime,
      endTime: t.endTime,
      teacherId: t.teacherId == null ? '' : String(t.teacherId),
      room: t.room,
    })
    if (queuedInstruction && props.inline) {
      const instruction = queuedInstruction
      queuedInstruction = ''
      await handleFollowup(instruction, props.owner)
    } else await focus(heading.value)
  }
}
async function reread() {
  if (busy.value || !state.target) return
  const old = { ...form }
  if (await resource.select(state.target.lessonId)) {
    Object.assign(form, old)
    requestId = crypto.randomUUID()
    await focus(heading.value)
  }
}
async function prepare() {
  if (busy.value) return
  if (await resource.prepare(form, requestId)) await focus(previewHeading.value)
}
async function edit() {
  if (busy.value) return
  resource.invalidate()
  await nextTick()
  await focus(heading.value)
}
async function save() {
  if (busy.value || !state.preview || state.preview.conflicts.length) return
  const p = state.preview,
    t = p.original,
    n = p.proposed
  const message = `原课程：${t.name}\n${t.groupName} · ${t.date} ${t.startTime}—${t.endTime}\n原教师：${t.teacherLabel}；${t.room}\n\n${n ? `改为：${n.date} ${n.startTime}—${n.endTime}\n${n.teacherLabel}；${n.room}` : '取消这一节，不改其他周次。'}\n沿用已核有效名单 ${t.members} 人；旧考勤和归属保留。\n\n原因：${p.reason}`
  if (
    await confirm(message, {
      title: n ? '确认单次调课或代课' : '确认取消本次课',
      confirmText: n ? '确认保存替代安排' : '确认取消这一节',
      className: 'ct-teaching-change-confirm',
    })
  ) {
    if (await resource.execute()) {
      emit('saved', state.receipt)
      await focus(savedHeading.value)
    }
  }
}
async function reconcile() {
  if (busy.value) return
  if (await resource.reconcile()) {
    emit('saved', state.receipt)
    await focus(savedHeading.value)
  }
}
async function retry() {
  if (busy.value || !state.canRetry) return
  if (
    await confirm('仅重试已确认的同一请求编号与原内容。不会修改目标或新建第二次调课。', {
      title: '核对原请求',
      confirmText: '重试同一请求',
      className: 'ct-teaching-change-confirm',
    })
  )
    if (await resource.retry()) {
      emit('saved', state.receipt)
      await focus(savedHeading.value)
    }
}
async function handleFollowup(text, requestScope) {
  const principal = owner(), before = JSON.stringify(form), original = state.target
  const plan = planLessonChangeFollowup(text, { active: !!principal, scope: principal, requestScope, busy: busy.value, phase: state.phase, loaded: state.access?.enabled === true, userRole: props.userRole, schoolId: props.schoolId, target: original, form, today: chinaDate() })
  if (plan.type === 'CLOSE') { emit('closed', state.phase === 'uncertain' ? '已收起操作，原保存请求仍需核对；没有重复提交。' : '调停课草稿已取消，没有提交修改。'); return { accepted: true, closed: true, message: '本次操作已收起。' } }
  followup.value = plan.message
  if (plan.type === 'CLARIFY') return { accepted: false, preserveInput: true, message: plan.message }
  if (plan.type === 'QUERY') {
    queuedInstruction = text
    Object.assign(query, plan.query, { page: 0 })
    if (!(await resource.list({ ...query }))) return { accepted: false, preserveInput: true, message: state.error || '授权清单暂时无法读取；未保存。' }
    await focus(heading.value)
    return { accepted: true, message: plan.message }
  }
  const current = () => !disposed && owner() === principal && props.owner === requestScope && state.target === original && before === JSON.stringify(form)
  if (plan.type === 'PATCH') {
    resolving.value = true
    followupController?.abort(); followupController = new AbortController()
    const epoch = ++followupEpoch, patch = { ...plan.patch }
    try {
      if (plan.targets.teacherQuery) patch.teacherId = (await resolveFormalTarget('TEACHER', plan.targets.teacherQuery, readTeachingConfigPage, followupController.signal)).value
      if (!current() || epoch !== followupEpoch) return { accepted: false, preserveInput: true, message: '目标、草稿或账号已变化，旧补充没有被采用。' }
      resource.invalidate(); Object.assign(form, patch)
      if (plan.targets.teacherQuery) changingTeacher.value = true
      followup.value = '补充已填入这一节；旧预览已失效，没有保存。'
    } catch (error) {
      if (owner() === principal) followup.value = error.response?.data?.message || error.message || '任课教师尚未核实；所有补充均未改变。'
      return { accepted: false, preserveInput: true, message: followup.value }
    } finally { if (owner() === principal) resolving.value = false }
    if (owner() !== principal) return { accepted: false, preserveInput: true, message: '账号已变化，未继续处理。' }
    if (form.reason.trim() && (form.action === 'CANCEL' || form.date && form.startTime && form.endTime && form.teacherId && form.room.trim())) {
      await prepare()
      if (owner() !== principal) return { accepted: false, message: '账号已变化，没有展示旧预览。' }
      followup.value = state.preview ? '后台已核对目标和冲突并生成预览。请阅读原/新安排，再点击确认按钮；尚未保存。' : state.error || '字段已保留，仍需重新核对预览。'
    }
  }
  if (plan.type === 'PREVIEW') {
    await prepare()
    if (owner() !== principal) return { accepted: false, message: '账号已变化，没有展示旧预览。' }
    if (!state.preview) return { accepted: false, preserveInput: true, message: state.error || '先补齐变更原因和明确安排；未保存。' }
  }
  if (plan.type === 'CONFIRM_BUTTON') await focus(confirmationButton.value)
  else if (!state.preview) await focus(followupHeading.value)
  return { accepted: true, message: followup.value }
}
watch(
  () => [props.owner, props.active],
  () => {
    resource.reset()
    followupEpoch++; followupController?.abort(); resolving.value = false; followup.value = ''; queuedInstruction = ''
    opened.value = false
    wipeForm()
    Object.assign(query, {
      from: chinaDate(),
      to: addDays(chinaDate(), 6),
      page: 0,
      size: 25,
      search: '',
    })
  },
  { flush: 'sync' },
)
onBeforeUnmount(() => {
  disposed = true
  followupEpoch++; followupController?.abort()
  resource.dispose()
})
onMounted(async () => {
  if (!props.inline) return
  opened.value = true
  await activate()
  if (queuedInstruction && owner() && state.access?.enabled) await handleFollowup(queuedInstruction, props.owner)
})
defineExpose({
  handleFollowup,
  open: async () => {
    opened.value = true
    await activate()
  },
})
</script>
<template>
  <component
    :is="inline ? 'section' : 'details'"
    ref="root"
    class="lesson-changes"
    :open="opened"
    :data-workflow-ready="state.access ? 'ready' : state.error ? 'error' : 'waiting'"
    @toggle="toggle"
  >
    <summary v-if="!inline">调课、代课或取消一节课</summary>
    <div v-if="opened">
      <p class="hint">只改明确选中的这一节。过去考勤、其他周次和原名单归属保留。</p>
      <p v-if="inline || followup" ref="followupHeading" tabindex="-1" role="status" class="hint">{{ followup || '先选准确节次；可继续在聊天补日期、钟点/节次、教室、教师账号和原因。' }}</p>
      <p v-if="state.busy" role="status">正在核对本校课程与原请求…</p>
      <p v-if="state.error" role="alert" class="failure">{{ state.error }}</p>
      <button v-if="!state.access" type="button" :disabled="busy" @click="activate">
        重新读取调停课能力
      </button>
      <p v-else-if="!state.access.enabled" role="status">
        受控调停课尚未启用，需管理员先核对增量迁移与身份、名单、学籍配置；没有修改任何课程。
      </p>
      <template v-else>
        <section
          v-if="state.receipt"
          ref="savedHeading"
          tabindex="-1"
          class="result"
          aria-label="调停课保存结果"
        >
          <h3>{{ state.receipt.action === 'CANCEL' ? '这一节已取消' : '替代安排已保存' }}</h3>
          <p>{{ state.receipt.original.name }} · {{ state.receipt.original.groupName }}</p>
          <p v-if="state.receipt.proposed">
            {{ state.receipt.proposed.date }} {{ state.receipt.proposed.startTime }}—{{
              state.receipt.proposed.endTime
            }}<br />{{ state.receipt.proposed.teacherLabel }} · {{ state.receipt.proposed.room }}
          </p>
          <p role="status">{{ state.notice }}</p>
          <details>
            <summary>查看本次原因与回执</summary>
            <p>{{ state.receipt.reason }}</p>
            <code>{{ state.receipt.requestId }}</code>
          </details>
          <button type="button" :disabled="busy" @click="list(0)">返回课程清单</button>
        </section>
        <section v-else-if="state.phase === 'uncertain'" aria-label="调停课结果核对">
          <h3>先核对原请求</h3>
          <p>原课程和确认内容已冻结。没有自动重发，也不能在结果未知时换一个目标。</p>
          <div class="actions">
            <button type="button" :disabled="busy" @click="reconcile">核对原请求回执</button
            ><button v-if="state.canRetry" type="button" :disabled="busy" @click="retry">
              重试同一请求
            </button>
          </div>
        </section>
        <section
          v-else-if="state.preview"
          ref="previewHeading"
          tabindex="-1"
          class="preview"
          aria-label="单次调停课预览"
        >
          <h3>{{ state.preview.original.name }}</h3>
          <p>
            {{ state.preview.original.groupName }} · 已核有效名单
            {{ state.preview.original.members }} 人
          </p>
          <dl>
            <div>
              <dt>原安排</dt>
              <dd>
                {{ state.preview.original.date }} {{ state.preview.original.startTime }}—{{
                  state.preview.original.endTime
                }}<br />{{ state.preview.original.teacherLabel }} ·
                {{ state.preview.original.room }}
              </dd>
            </div>
            <div>
              <dt>{{ state.preview.proposed ? '替代安排' : '本次变更' }}</dt>
              <dd v-if="state.preview.proposed">
                {{ state.preview.proposed.date }} {{ state.preview.proposed.startTime }}—{{
                  state.preview.proposed.endTime
                }}<br />{{ state.preview.proposed.teacherLabel }} ·
                {{ state.preview.proposed.room }}
              </dd>
              <dd v-else>只取消这一节，不补造其他安排</dd>
            </div>
          </dl>
          <p v-for="c in state.preview.conflicts" :key="c.kind" class="failure">
            {{ LESSON_CONFLICTS[c.kind] }}：{{ c.arrangements }}项。存在冲突，不能保存。
          </p>
          <details>
            <summary>核对原因与变更边界</summary>
            <p>{{ state.preview.reason }}</p>
            <p v-for="w in state.preview.warnings" :key="w" class="hint">{{ w }}</p>
          </details>
          <div class="actions">
            <button
              ref="confirmationButton"
              type="button"
              class="primary"
              :disabled="busy || !!state.preview.conflicts.length"
              @click="save"
            >
              {{ state.preview.proposed ? '确认调课或代课' : '确认取消这一节' }}</button
            ><button type="button" :disabled="busy" @click="edit">返回继续编辑</button>
          </div>
        </section>
        <template v-else-if="state.target">
          <h3 ref="heading" tabindex="-1">{{ state.target.name }}</h3>
          <p>
            {{ state.target.groupName }} · {{ state.target.semester }}<br />原安排：{{
              state.target.date
            }}
            {{ state.target.startTime }}—{{ state.target.endTime }}<br />{{
              state.target.teacherLabel
            }}
            · {{ state.target.room }}
          </p>
          <p v-if="!state.target.members" class="hint">
            本次课没有有效成员，不借调课加入任何人；可以明确取消本次课。
          </p>
          <form @submit.prevent="prepare">
            <fieldset class="wide choices" :disabled="busy">
              <legend>这次怎么调整</legend>
              <label class="choice"
                ><input v-model="form.action" type="radio" value="RESCHEDULE" />调课或代课</label
              ><label class="choice"
                ><input v-model="form.action" type="radio" value="CANCEL" />取消本次课</label
              >
            </fieldset>
            <template v-if="form.action === 'RESCHEDULE'"
              ><label class="wide"
                >调整后日期<input
                  v-model="form.date"
                  type="date"
                  required
                  :disabled="busy" /></label
              ><label
                >开始钟点<input
                  v-model="form.startTime"
                  type="time"
                  required
                  :disabled="busy" /></label
              ><label
                >结束钟点<input v-model="form.endTime" type="time" required :disabled="busy"
              /></label>
              <details
                class="wide"
                :open="changingTeacher"
                @toggle="changingTeacher = $event.target.open"
              >
                <summary>更换任课教师（代课时使用）</summary>
                <TeachingScopePicker
                  v-if="changingTeacher"
                  v-model="form.teacherId"
                  :owner="owner()"
                  kind="TEACHER"
                  label="调整后任课教师"
                  :disabled="busy"
                />
                <p v-else class="hint">
                  沿用原任课账号：{{ state.target.teacherLabel }}。未通过审核的教师不能接课。
                </p>
              </details>
              <label class="wide"
                >调整后教室<input
                  v-model="form.room"
                  maxlength="100"
                  required
                  :disabled="busy" /></label
            ></template>
            <label class="wide"
              >变更原因<textarea
                v-model="form.reason"
                rows="2"
                maxlength="300"
                required
                :disabled="busy"
                placeholder="说明本次调课、代课或取消的依据"
              />
            </label>
            <button
              class="primary wide"
              :disabled="busy || (form.action === 'RESCHEDULE' && !state.target.members)"
            >
              核对变更并预览
            </button>
            <details class="wide">
              <summary>重新读取或返回清单</summary>
              <div class="actions">
                <button type="button" :disabled="busy" @click="reread">重新读取原课</button
                ><button type="button" :disabled="busy" @click="list(0)">返回清单</button>
              </div>
            </details>
          </form>
        </template>
        <template v-else>
          <h3 ref="heading" tabindex="-1">先选具体的一节课</h3>
          <p class="hint">
            仅列尚未进入课前5分钟的安排。已点名者不可直接改；没有按课程同名自动选择。
          </p>
          <form @submit.prevent="list(0)">
            <label
              >开始日期<input v-model="query.from" type="date" required :disabled="busy" /></label
            ><label
              >结束日期<input
                v-model="query.to"
                type="date"
                required
                :min="query.from"
                :max="addDays(query.from || chinaDate(), 30)"
                :disabled="busy" /></label
            ><label class="wide"
              >查找课程<input
                v-model="query.search"
                maxlength="100"
                :disabled="busy"
                placeholder="课程、学期、教师或教室" /></label
            ><button class="primary wide" :disabled="busy">查找可调整课程</button>
          </form>
          <p v-if="state.page" role="status">
            共 {{ state.page.total }} 项 · {{ state.page.from }} 至 {{ state.page.to }} ·
            完整筛选范围
          </p>
          <ul v-if="state.page?.items.length" class="lesson-list">
            <li v-for="row in state.page.items" :key="row.lessonId">
              <button
                type="button"
                :disabled="busy || !!row.blockedReason"
                @click="select(row.lessonId)"
              >
                <strong>{{ row.course }}</strong
                ><span
                  >{{ teachingDate(row.startsAt) }} {{ teachingClock(row.startsAt) }}—{{
                    teachingClock(row.endsAt)
                  }}</span
                ><span>{{ row.className }} · {{ row.teacher }} · {{ row.room }}</span
                ><span v-if="row.blockedReason" class="failure">{{ row.blockedReason }}</span
                ><span v-else class="next">核对这一节</span>
              </button>
            </li>
          </ul>
          <p v-else-if="state.page && !state.busy">
            这段日期没有符合条件的安排。可以改日期查找；不会补造课程。
          </p>
          <nav v-if="state.page?.totalPages > 1" class="pagination" aria-label="可调整课程分页">
            <button
              type="button"
              :disabled="busy || state.page.page === 0"
              @click="list(state.page.page - 1)"
            >
              上一页</button
            ><span>{{ state.page.page + 1 }}/{{ state.page.totalPages }}</span
            ><button
              type="button"
              :disabled="busy || state.page.page + 1 >= state.page.totalPages"
              @click="list(state.page.page + 1)"
            >
              下一页
            </button>
          </nav>
        </template>
      </template>
    </div>
  </component>
</template>
<style scoped>
.lesson-changes {
  font: inherit;
  font-size: 16px;
  line-height: 1.7;
  color: var(--assistant-ink, #29323c);
  min-width: 0;
  scroll-margin-top: 95px;
}
summary {
  min-height: 44px;
  align-content: center;
  cursor: pointer;
}
p {
  margin: 12px 0;
  overflow-wrap: anywhere;
}
h3 {
  font-size: 20px;
  font-weight: 600;
  margin: 20px 0 12px;
  scroll-margin-top: 95px;
}
.hint {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
}
.failure {
  color: var(--assistant-danger, #bf303d);
}
form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0;
}
.wide {
  grid-column: 1/-1;
}
label {
  display: grid;
  gap: 8px;
  min-width: 0;
  font-size: 15px;
}
input,
select,
textarea,
button {
  font: inherit;
  font-size: 16px;
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 12px;
  color: inherit;
  background: var(--assistant-surface, #fff);
  caret-color: var(--assistant-accent, #0b62db);
}
textarea {
  resize: vertical;
}
button {
  cursor: pointer;
  transition: background-color 180ms ease-out;
}
button:hover:not(:disabled) {
  background: var(--assistant-hover, #e8edf2);
}
button.primary {
  background: var(--assistant-accent, #0b62db);
  color: #fff;
  border-color: transparent;
}
button.primary:hover:not(:disabled) {
  background: var(--assistant-accent-hover, #084db0);
}
:disabled {
  opacity: 0.6;
  cursor: default;
}
:focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
}
::selection {
  background: var(--assistant-soft, #eaf2ff);
}
.actions,
.pagination {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.choices {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.choices legend {
  font-size: 15px;
  margin-bottom: 8px;
}
.choice {
  display: flex;
  gap: 9px;
  align-items: center;
  min-height: 44px;
}
.choice input {
  padding: 0;
  width: 22px;
  height: 22px;
  min-height: 22px;
  flex: none;
}
.lesson-list {
  list-style: none;
  margin: 16px 0;
  padding: 0;
}
.lesson-list li + li {
  border-top: 1px solid var(--assistant-line, #e2e7ec);
}
.lesson-list button {
  display: grid;
  gap: 6px;
  text-align: left;
  width: 100%;
  border: 0;
  border-radius: 0;
  padding: 16px 0;
  background: transparent;
}
.lesson-list span {
  overflow-wrap: anywhere;
}
.next {
  color: var(--assistant-accent, #0b62db);
}
.preview,
.result {
  margin: 20px 0;
  scroll-margin-top: 95px;
}
.preview dl {
  margin: 16px 0;
}
.preview dl > div {
  padding: 12px 0;
  border-top: 1px solid var(--assistant-line, #e2e7ec);
}
dt {
  font-size: 14px;
  color: var(--assistant-muted, #5d6876);
}
dd {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}
.preview .actions,
.result > button {
  margin-top: 20px;
}
code {
  overflow-wrap: anywhere;
}
.pagination span {
  font-variant-numeric: tabular-nums;
}
@media (max-width: 600px) {
  .actions > button {
    flex: 1 1 100%;
  }
  .choices {
    gap: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }
}
</style>
