<script setup>
import { useId } from 'vue'
defineProps({state:{type:Object,required:true}, pending:Boolean, busy:Boolean, enabledAllowed:Boolean,
  scope:{type:String,required:true}, notice:{type:String,default:''},
  storageDescription:{type:String,default:'保留表单文字和必要的版本、提交编号。项目仅保留最近编辑的一份，校园墙保留一份主题和一份回复'}})
defineEmits(['toggle','restore','discard'])
const helpId = useId()
</script>

<template>
  <section v-if="pending || enabledAllowed || state.enabled || state.error || notice" class="form-recovery" :aria-label="`${scope}草稿保护`">
    <div v-if="pending" class="form-recovery-pending">
      <p>发现{{scope}}草稿，恢复后不会自动提交。</p>
      <p>先恢复或清除，处理前不会暂存新输入。</p>
      <div class="form-recovery-actions">
        <button type="button" :disabled="busy" @click="$emit('restore')">恢复草稿</button>
        <slot />
        <button type="button" :disabled="busy" @click="$emit('discard')">不恢复并清除</button>
      </div>
      <slot name="pending-detail" />
    </div>
    <div class="form-recovery-settings">
      <label><input type="checkbox" :checked="state.enabled" :disabled="busy || pending || (!state.enabled && !enabledAllowed)"
        :aria-describedby="helpId" @change="$emit('toggle',$event.target.checked)" />本机暂存 30 分钟</label>
      <details><summary>暂存说明</summary>
        <p>默认关闭；开启后仅在本标签页的浏览器会话存储中{{storageDescription}}。不保存原附件或登录凭据，不上传服务器、不发送给 AI；不是长期备份</p>
        <p>这是非加密副本，不能防止他人使用已登录设备。仅服务器确认的同一账号、同一学校可恢复；主动退出、跨标签换号、关闭开关会清除副本。最后暂存满 30 分钟后不再恢复，下次检查时清理。浏览器可能恢复关闭的标签页，公共设备请勿开启</p>
      </details>
      <span :id="helpId">仅本标签页 · 未加密</span>
    </div>
    <p v-if="state.error" class="form-recovery-error" role="alert">{{state.error}}</p>
    <p v-else-if="notice" role="status">{{notice}}</p>
  </section>
</template>

<style scoped>
.form-recovery{font-size:14px;line-height:1.7;color:#515d51;margin:12px 0 20px;overflow-wrap:anywhere}
.form-recovery p{margin:4px 0}.form-recovery-settings{display:flex;flex-wrap:wrap;gap:0 16px;align-items:center}
.form-recovery-settings label{display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer}
.form-recovery-settings input{width:17px;height:17px;accent-color:#3547e1;flex:none}
.form-recovery-settings details{display:contents}.form-recovery-settings details p{flex-basis:100%}
.form-recovery-settings summary{min-height:44px;display:flex;align-items:center;cursor:pointer;text-decoration:underline;text-underline-offset:4px;color:#3547e1}
.form-recovery-settings>span{font-size:13px}.form-recovery-pending{background:#f0f2eb;border:1px solid #d8ddd4;border-radius:20px;padding:12px 16px}
.form-recovery-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.form-recovery-actions :deep(button){min-height:44px;padding:8px 14px;border:1px solid #cbd2c5;border-radius:999px;color:#3547e1;background:#fffefa;font:inherit;cursor:pointer}
.form-recovery-actions :deep(button:disabled){opacity:.55;cursor:default}
:is(input,summary):focus-visible,.form-recovery-actions :deep(button:focus-visible){outline:2px solid #3547e1;outline-offset:3px}
.form-recovery-error{color:#933c2c}
@media(max-width:760px){.form-recovery-settings>span{flex-basis:100%}}
</style>
