<script setup>
import {computed} from 'vue'
import {TEACHING_WORKFLOWS,teachingWorkflowDestination} from '@/utils/teachingWorkflows'
const props=defineProps({intent:{type:Object,required:true},user:{type:Object,required:true}})
const workflow=computed(()=>TEACHING_WORKFLOWS[props.intent.workflow])
const title=computed(()=>props.intent.pendingPrivateExport||props.intent.pendingScheduleExport?'核对课表导出条件':props.intent.scheduleExport?'课表文件导出':props.intent.workflow==='TIMETABLE'&&props.intent.cancelled?'已取消课表导出':workflow.value?.title)
const destination=computed(()=>teachingWorkflowDestination(props.intent))
const adminRequired=computed(()=>workflow.value?.admin&&props.user.role!=='ADMIN')
</script>
<template>
  <section v-if="workflow" class="chat-workflow" :aria-label="title">
    <h3>{{ title }}</h3>
    <p v-if="intent.clarification" class="workflow-question">{{ intent.clarification }}</p>
    <template v-else>
      <p>{{ intent.scheduleExport?'按本人统一课表、个人导入或当前授权教学范围，导出Excel、PDF、CSV、ICS或JSON日期快照。不包含学生名单和考勤。':workflow.description }}</p>
      <p v-if="intent.from&&intent.to" class="workflow-dates">{{ intent.from }} 至 {{ intent.to }}<small>{{ intent.dateNote }}。具体对象仍在业务页核对。</small></p>
      <p v-if="intent.notice" class="workflow-warning">{{ intent.notice }}</p>
      <p v-if="adminRequired" class="workflow-warning">这项操作需要正常学校管理员账号。当前会话不是管理员，没有读取管理数据或提交修改。</p>
      <RouterLink v-if="destination&&!adminRequired" class="workflow-link" :to="destination">{{ intent.scheduleExport?'打开课表文件导出':intent.personalExport ? '打开本人课表导出' : workflow.action }}</RouterLink>
      <RouterLink v-else-if="adminRequired&&intent.workflow!=='PRIVILEGE'" class="workflow-link secondary" to="/account#teaching-identity">查看本人的教学身份</RouterLink>
      <small class="workflow-boundary">这条请求在本地识别，未发给模型；打开入口不会自动保存、绑定或授予权限。</small>
    </template>
  </section>
</template>
<style scoped>
.chat-workflow{max-width:65ch;color:var(--assistant-ink,#29323c);font-size:16px;line-height:1.8}.chat-workflow h3{margin:0 0 12px;font-size:18px;font-weight:600}.chat-workflow p{margin:10px 0;overflow-wrap:anywhere}.workflow-dates{font-variant-numeric:tabular-nums;font-weight:500}.workflow-dates small{display:block;color:var(--assistant-muted,#5d6876);font-size:14px;font-weight:400}.workflow-warning{color:var(--assistant-warning,#9a5400)}.workflow-question{font-size:16px}.workflow-link{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:44px;max-width:100%;margin-top:8px;padding:10px 16px;border-radius:12px;background:var(--assistant-accent,#0b62db);color:white;text-decoration:none;font-size:16px;font-weight:500;transition:background-color 180ms ease}.workflow-link:hover{background:var(--assistant-accent-hover,#084db0)}.workflow-link.secondary{background:var(--assistant-soft,#eaf2ff);color:var(--assistant-accent,#0b62db)}.workflow-link.secondary:hover{background:var(--assistant-hover,#e8edf2)}.workflow-link:focus-visible{outline:2px solid var(--assistant-accent,#0b62db);outline-offset:3px}.workflow-boundary{display:block;margin-top:14px;color:var(--assistant-muted,#5d6876);font-size:14px}::selection{background:var(--assistant-soft,#eaf2ff)}@media(max-width:600px){.workflow-link{width:100%}}@media(prefers-reduced-motion:reduce){.workflow-link{transition:none}}
</style>
<style scoped>
/* The shell's general anchor color must not repaint a filled workflow action. */
.chat-workflow a.workflow-link:not(.secondary){color:#fff}
.chat-workflow a.workflow-link.secondary{color:var(--assistant-accent,#0b62db)}
</style>
