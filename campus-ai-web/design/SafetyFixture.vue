<script setup>
import { renderMarkdown } from '../src/utils/safeMarkdown'
const sample = '# 渲染安全验收\n\n正常的 **加粗** 与 `代码`\n\n[官方链接](https://www.tsguas.edu.cn/)\n\n[危险链接](javascript:alert(1))\n\n![不应加载](https://example.invalid/pixel)\n\n<img src="https://example.invalid/pixel" onerror="alert(1)"><iframe src="https://example.invalid"></iframe><form><input autofocus></form><div style="background:url(https://example.invalid/pixel)">清理样式后的文本</div>'
</script>
<template><main><h1>本地安全回归</h1><p>不连接后端、不提交资料；危险标签应被移除</p><article id="sanitized-output" v-html="renderMarkdown(sample)"></article></main></template>
