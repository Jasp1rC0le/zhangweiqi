<script setup>
import { ref } from 'vue'
import { schoolTimetableBookmark } from '@/utils/schoolTimetableExport'
const message = ref('')
async function copy() {
  try {
    await navigator.clipboard.writeText(schoolTimetableBookmark)
    message.value = '导出工具代码已复制。请粘贴到新建书签的网址栏，不是教务密码框。'
  } catch {
    message.value = '浏览器未允许复制，请用电脑将“导出中德课表”拖到书签栏。'
  }
}
</script>
<template>
  <details class="school-guide">
    <summary>怎么获得整学期课表？</summary>
    <p>
      <strong>首选数据文件，不建议截图。</strong
      >文件能保留全部周次和教室；单周截图不包含其他周，也容易漏掉单双周。
    </p>
    <ol>
      <li>电脑上把下面的“导出中德课表”拖入浏览器书签栏。</li>
      <li>
        <a
          href="https://zdjw.tsguas.edu.cn/app-web/#/tabs/home"
          target="_blank"
          rel="noopener noreferrer"
          >打开学校教务</a
        >，正常登录一次，进入“课表”并选择要导出的学期。
      </li>
      <li>点击刚才的书签，等待逐周读取完成；把下载的 JSON 上传到这里，自动生成课表。</li>
    </ol>
    <div class="guide-actions">
      <a
        :href="schoolTimetableBookmark"
        class="work-button"
        draggable="true"
        @click.prevent="message = '请把这个按钮拖到书签栏，然后在教务课表页点击该书签。'"
        >导出中德课表</a
      ><button type="button" class="work-button" @click="copy">复制书签代码</button>
    </div>
    <p v-if="message" role="status">{{ message }}</p>
    <p class="guide-boundary">
      试用工具：已按学校当前公开页面适配，尚待真实登录联调。仅调用教务页面自己的课表查询，不复制密码、登录令牌，不修改选课，不向本站上传原始响应。学校改版或浏览器不支持时会停止，不生成缺周文件。手机暂建议上传电脑导出的文件。
    </p>
  </details>
</template>
<style scoped>
.school-guide {
  margin: 16px 0 24px;
  color: #526377;
  font-size: 15px;
  line-height: 1.7;
}
summary {
  cursor: pointer;
  font-weight: 600;
  min-height: 44px;
  display: list-item;
  align-content: center;
  color: var(--ct-ink);
}
ol {
  padding-left: 24px;
}
li + li {
  margin-top: 8px;
}
p {
  max-width: 70ch;
  overflow-wrap: anywhere;
}
a {
  color: var(--ct-blue);
  text-underline-offset: 4px;
}
.guide-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.guide-boundary {
  font-size: 14px;
}
:focus-visible {
  outline: 2px solid var(--ct-blue);
  outline-offset: 3px;
}
</style>
