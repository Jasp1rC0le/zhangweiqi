<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  state: {type:Object, required:true},
  pending: {type:Array, default:() => []},
  busy: Boolean,
  notice: {type:String, default:''},
})
defineEmits(['toggle', 'restore', 'discard'])
const selected = ref(0)
watch(() => props.pending, () => { selected.value = 0 })
const labels = {standard:'问答', kimi:'论文', glm:'代码'}
</script>

<template>
  <div class="draft-recovery">
    <div v-if="pending.length" class="draft-recovery-pending">
      <p>有 {{ pending.length }} 份未发送草稿，恢复后不会自动发送</p>
      <div class="draft-recovery-actions">
        <select v-model="selected" aria-label="选择要恢复的草稿" :disabled="busy">
          <option v-for="(entry, index) in pending" :key="`${entry.model}:${entry.conversationId}`" :value="index">
            {{ labels[entry.model] }} · {{ entry.conversationId ? `原对话 #${entry.conversationId}` : '新对话' }} · {{ entry.text.length }} 字符
          </option>
        </select>
        <button type="button" :disabled="busy" @click="$emit('restore', pending[selected])">恢复草稿</button>
        <button type="button" :disabled="busy" @click="$emit('discard')">不恢复并清除</button>
      </div>
    </div>
    <div class="draft-recovery-settings">
      <label>
        <input type="checkbox" :checked="state.enabled" :disabled="busy || Boolean(pending.length)"
          aria-describedby="draft-recovery-hint" @change="$emit('toggle', $event.target.checked)" />
        暂存草稿 30 分钟
      </label>
      <details>
        <summary>保存范围</summary>
        <p>默认关闭；开启后，仅在本标签页的浏览器会话存储中暂存未发送的聊天文字，不上传服务器，不保存附件或登录凭据。草稿按账号和学校隔离，重新登录同一账号后才可恢复</p>
        <p>这是非加密的本地副本，不能防止他人使用已登录的设备。关闭开关、主动退出或检测到其他标签页换号会清除副本；最后暂存超过 30 分钟后不再恢复，并在下次检查时清理。浏览器恢复标签页可能保留会话存储，因此不要依赖关标签页来清理</p>
        <p>只保留最近暂存的聊天输入，不包括项目、校园墙表单，也不是聊天记录备份</p>
      </details>
      <span id="draft-recovery-hint">仅本标签页 · 非加密 · 公共设备勿开</span>
    </div>
    <p v-if="state.error" class="draft-recovery-error" role="alert">{{ state.error }}</p>
    <p v-else-if="notice" class="draft-recovery-notice" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
.draft-recovery { width:min(790px,100%); margin:10px auto 0; color:#515d51; font-size:14px; line-height:1.6; }
.draft-recovery p { margin:0; overflow-wrap:anywhere; }
.draft-recovery-settings { display:flex; flex-wrap:wrap; align-items:center; gap:2px 16px; }
.draft-recovery-settings label { display:inline-flex; align-items:center; gap:8px; min-height:44px; cursor:pointer; }
.draft-recovery-settings input { width:17px; height:17px; accent-color:#3547e1; }
.draft-recovery-settings span { font-size:13px; }
.draft-recovery-settings details { display:contents; }
.draft-recovery-settings summary { min-height:44px; display:flex; align-items:center; color:#3547e1; cursor:pointer; text-decoration:underline; text-underline-offset:4px; }
.draft-recovery-settings details p { flex-basis:100%; padding:4px 0; }
.draft-recovery-pending { padding:12px 16px; border:1px solid #d8ddd4; border-radius:20px; background:#f0f2eb; }
.draft-recovery-actions { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-top:8px; }
.draft-recovery-actions select { min-width:0; max-width:100%; flex:1 1 210px; color:#273044; border:1px solid #cbd2c5; background:#fffefa; border-radius:12px; padding:8px 12px; font:inherit; min-height:44px; }
.draft-recovery-actions button { min-height:44px; border:1px solid #cbd2c5; border-radius:999px; padding:8px 14px; color:#3547e1; background:#fffefa; font:inherit; cursor:pointer; }
.draft-recovery-actions button:hover:not(:disabled) { background:#e7ebff; }
.draft-recovery-actions button:disabled,.draft-recovery-actions select:disabled { opacity:.55; cursor:default; }
:is(input,summary,select,button):focus-visible { outline:2px solid #3547e1; outline-offset:3px; }
.draft-recovery-error { color:#933c2c; }
.draft-recovery-notice { color:#515d51; }
@media (max-width:760px) { .draft-recovery-actions select { font-size:16px; }.draft-recovery-settings { gap:0 12px; }.draft-recovery-settings span { flex-basis:100%; }.draft-recovery { margin-top:6px; } }
</style>
