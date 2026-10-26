<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import http from '@/api/http'
import { listPrivateMaterials, readPrivateMaterialText } from '@/api/privateMaterials'
import { parseAcademicRecords, academicSummary, ACADEMIC_TEMPLATE } from '@/utils/academicRecords'
import { captureAuditFocusIntent } from '@/utils/teachingAdministrativeAudit'
const props = defineProps({
  scope: String,
  owner: String,
  kind: String,
  active: Boolean,
  foreground: Boolean,
})
const busy = ref(false),
  resultElement = ref(),
  error = ref(''),
  identity = ref(null),
  files = ref(null),
  page = ref(0),
  records = ref([]),
  source = ref(null),
  semester = ref(''),
  selected = ref(''),
  filter = ref(''),
  showFiles = ref(false)
let sequence = 0,
  focusIntent,
  controller,
  disposed = false
const storageKey = () =>
  `${import.meta.env.DEV && window.location.pathname === '/design-review.html' ? 'campthink.demo' : 'campthink'}.academic-source.v1.${props.owner}`
const current = () => props.active && !disposed && props.owner && props.scope
const filtered = computed(() =>
  records.value.filter(
    (r) =>
      (!semester.value || r.semester === semester.value) &&
      (!filter.value || `${r.name} ${r.code}`.includes(filter.value.trim())),
  ),
)
const summary = computed(() => academicSummary(filtered.value)),
  semesters = computed(() => [...new Set(records.value.map((r) => r.semester))])
async function run(task) {
  if (busy.value || !current()) return
  controller?.abort()
  controller = new AbortController()
  const epoch = ++sequence,
    owner = props.scope,
    op = {
      signal: controller.signal,
      valid: () =>
        current() && props.scope === owner && sequence === epoch && !controller.signal.aborted,
    }
  busy.value = true
  error.value = ''
  try {
    await task(op)
  } catch (e) {
    if (op.valid())
      error.value = e.response?.data?.message || e.message || '读取未完成；没有改用模型猜测。'
  } finally {
    if (op.valid()) busy.value = false
  }
}
async function list() {
  showFiles.value = true
  await run(async (op) => {
    const result = await listPrivateMaterials(page.value, op.signal)
    if (op.valid()) files.value = result
  })
}
async function readFile(id, op) {
  focusIntent?.dispose()
  const focus = (focusIntent = captureAuditFocusIntent(document))
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('已选资料编号无效，请重新选择本人原件。')
  const result = await readPrivateMaterialText(id, op.signal),
    parsed = parseAcademicRecords(result.text)
  if (!op.valid()) return
  records.value = parsed
  source.value = id
  showFiles.value = false
  semester.value = ''
  filter.value = ''
  try {
    localStorage.setItem(storageKey(), id)
  } catch {
    /* Query still works; source selection will not survive reload. */
  }
  await nextTick()
  if (op.valid() && props.foreground && focus.current()) {
    resultElement.value?.focus({ preventScroll: true })
    resultElement.value?.scrollIntoView({ block: 'start', behavior: 'auto' })
  }
  focus.dispose()
}
async function choose() {
  await run((op) => readFile(selected.value, op))
}
function template() {
  const url = URL.createObjectURL(
      new Blob(['\uFEFF' + ACADEMIC_TEMPLATE], { type: 'text/csv;charset=utf-8' }),
    ),
    a = document.createElement('a')
  a.href = url
  a.download = '本人成绩导入模板.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function nextPage(value) {
  page.value = value
  void list()
}
watch(
  () => props.scope,
  () => {
    sequence++
    controller?.abort()
    busy.value = false
    identity.value = files.value = source.value = null
    records.value = []
    selected.value = filter.value = semester.value = ''
    error.value = ''
  },
  { flush: 'sync' },
)
onMounted(async () => {
  if (['DENIED', 'READ_ONLY'].includes(props.kind)) return
  if (props.kind === 'NUMBER')
    await run(async (op) => {
      const response = await http.get('/api/account/student-identity', { signal: op.signal })
      if (op.valid()) identity.value = response.data
    })
  else {
    let id
    try {
      id = localStorage.getItem(storageKey())
    } catch {
      /* source must be selected again */
    }
    if (id) await run((op) => readFile(id, op))
    else await list()
  }
})
onBeforeUnmount(() => {
  focusIntent?.dispose()
  disposed = true
  sequence++
  controller?.abort()
})
</script>
<template>
  <section class="own-academic" aria-label="本人的学业资料" :aria-busy="busy">
    <p v-if="kind === 'DENIED'">
      此工具只查询本人的绑定学号和本人选定的成绩资料，不能按姓名查询其他同学。
    </p>
    <p v-else-if="kind === 'READ_ONLY'">
      学业工具只查询和试算，不修改教务成绩。本人文件有误时，可上传并私有保存新原件，再选择新的成绩来源；官方成绩更正须走学校流程。
    </p>
    <template v-else
      ><p v-if="busy" role="status">正在读取本人资料，不调用模型…</p>
      <p v-if="error" class="failure" role="alert">{{ error }}</p>
      <template v-if="kind === 'NUMBER'"
        ><p v-if="identity?.bound">
          本人绑定学号：<strong>{{ identity.studentNumber }}</strong
          ><br />行政班：{{ identity.className }}
        </p>
        <p v-else-if="identity">{{ identity.message }}</p></template
      >
      <template v-else
        ><p>
          只按本人明确选择的成绩文件查询。绩点按文件提供的值与“计入GPA”标记加权，不猜换算或重修规则，也不冒充教务认证。
        </p>
        <template v-if="source"
          ><div class="filters">
            <label
              >学期<select v-model="semester" aria-label="学期">
                <option value="">全部已提供学期</option>
                <option v-for="term in semesters" :key="term">{{ term }}</option>
              </select></label
            ><label>查找课程<input v-model="filter" type="search" maxlength="100" /></label>
          </div>
          <p ref="resultElement" class="academic-result" tabindex="-1">
            当前{{ summary.records }}项记录，参与计算学分{{ summary.credits }}；{{
              summary.gpa === null
                ? `不能完整计算绩点（缺${summary.missing}项绩点或学分为0）`
                : `按所选记录试算绩点 ${summary.gpa}`
            }}。
          </p>
          <div class="grade-scroll">
            <table>
              <caption>
                本人选定文件的原始成绩
              </caption>
              <thead>
                <tr>
                  <th>课程</th>
                  <th>成绩</th>
                  <th>学分</th>
                  <th>绩点</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in filtered" :key="row.semester + row.code">
                  <th scope="row">
                    {{ row.name }}<small>{{ row.semester }} · {{ row.code }}</small>
                  </th>
                  <td>{{ row.grade }}</td>
                  <td>{{ row.credits }}</td>
                  <td>{{ row.points ?? '未提供' }}{{ !row.included ? '（不计入）' : '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul class="grade-records" aria-label="本人选定文件的原始成绩">
            <li v-for="row in filtered" :key="row.semester + row.code">
              <strong>{{ row.name }}</strong>
              <small>{{ row.semester }} · {{ row.code }}</small>
              <dl>
                <div>
                  <dt>成绩</dt>
                  <dd>{{ row.grade }}</dd>
                </div>
                <div>
                  <dt>学分</dt>
                  <dd>{{ row.credits }}</dd>
                </div>
                <div>
                  <dt>绩点</dt>
                  <dd>{{ row.points ?? '未提供' }}</dd>
                </div>
              </dl>
              <p v-if="!row.included" class="grade-exclusion">此项不计入GPA</p>
            </li>
          </ul></template
        >
        <button type="button" :disabled="busy || !active" @click="list">
          选择本人原件作为成绩来源
        </button>
        <div v-if="showFiles">
          <p>
            首次使用请下载模板，填入本人已核对成绩，在“上传资料”里选择并“保留原件”，再从此处选取。不得把成绩提交公共资料或发送模型。
          </p>
          <button type="button" @click="template">下载本人成绩CSV模板</button
          ><label
            >选择准确文件<select v-model="selected" :disabled="busy" aria-label="选择准确文件">
              <option value="">选择本人已保存的文件</option>
              <option v-for="item in files?.items || []" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select></label
          ><button type="button" :disabled="busy || !selected" @click="choose">
            核读此文件，不发送模型
          </button>
          <nav v-if="files?.total > 25">
            <button type="button" :disabled="busy || page === 0" @click="nextPage(page - 1)">
              上一页</button
            ><span>{{ page + 1 }} / {{ Math.ceil(files.total / 25) }}</span
            ><button
              type="button"
              :disabled="busy || (page + 1) * 25 >= files.total"
              @click="nextPage(page + 1)"
            >
              下一页
            </button>
          </nav>
        </div>
      </template>
    </template>
  </section>
</template>
<style scoped>
.own-academic {
  max-width: 70ch;
  color: var(--assistant-ink, #29323c);
  font-size: 16px;
  line-height: 1.75;
}
.own-academic p {
  margin: 14px 0;
}
.own-academic :is(button, input, select) {
  font: inherit;
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  min-height: 46px;
  border: 1px solid var(--assistant-line, #e2e7ec);
  border-radius: 12px;
  padding: 10px 12px;
  color: inherit;
  background: var(--assistant-surface, #fff);
}
.own-academic button {
  cursor: pointer;
  margin: 8px 0;
}
.own-academic button:hover {
  background: var(--assistant-soft, #eaf2ff);
}
.own-academic label {
  display: grid;
  gap: 8px;
  margin: 14px 0;
}
.filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.academic-result {
  scroll-margin-top: 92px;
}
.grade-records {
  display: none;
}
.grade-scroll {
  overflow: auto;
  max-height: 400px;
}
.grade-scroll table {
  border-collapse: collapse;
  width: 100%;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.grade-scroll :is(th, td) {
  padding: 10px 8px;
  border-bottom: 1px solid var(--assistant-line, #e2e7ec);
  font-weight: 400;
}
.grade-scroll thead th {
  font-weight: 600;
}
.grade-scroll small {
  display: block;
  font-size: 13px;
  color: var(--assistant-muted, #5d6876);
}
.failure {
  color: var(--assistant-danger, #bf303d);
}
.own-academic :disabled {
  opacity: 0.6;
}
.own-academic :focus-visible {
  outline: 2px solid var(--assistant-accent, #0b62db);
  outline-offset: 3px;
}
@media (max-width: 600px) {
  .filters {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .grade-scroll {
    display: none;
  }
  .grade-records {
    display: block;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grade-records li {
    padding: 16px 0;
    border-bottom: 1px solid var(--assistant-line, #e2e7ec);
  }
  .grade-records :is(strong, small) {
    display: block;
    overflow-wrap: anywhere;
  }
  .grade-records small {
    font-size: 13px;
    color: var(--assistant-muted, #5d6876);
  }
  .grade-records dl {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 12px 0 0;
    font-variant-numeric: tabular-nums;
  }
  .grade-records dt {
    color: var(--assistant-muted, #5d6876);
  }
  .grade-records dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .grade-records .grade-exclusion {
    margin: 8px 0 0;
    color: var(--assistant-muted, #5d6876);
  }
}
</style>
