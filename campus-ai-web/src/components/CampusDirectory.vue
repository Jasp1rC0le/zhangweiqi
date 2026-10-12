<script setup>
import { campusDirectory } from '@/utils/campusDirectory'
const groups = [...new Set(campusDirectory.entries.map(item => item.group))]
</script>
<template>
  <section class="campus-directory" aria-labelledby="directory-title">
    <h3 id="directory-title">官网速查，不用等 AI</h3>
    <p>资料分批整理，核验日期和来源以各条说明为准，不是校方授权服务；链接前往学校网站，适用对方隐私规则</p>
    <details v-for="group in groups" :key="group" :open="group === '常用办事'">
      <summary>{{ group }}</summary>
      <ul><li v-for="item in campusDirectory.entries.filter(entry => entry.group === group)" :key="item.title">
        <a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}<span class="sr-only">（在新标签页打开学校官网）</span></a>
        <p>{{ item.detail }}</p>
      </li></ul>
    </details>
  </section>
</template>
<style scoped>
.campus-directory { border-top: 1px solid #dce1d5; margin-top: 20px; padding-top: 22px; text-align: left; color: #354334; }
h3 { font-size: 20px; margin: 0 0 10px; }
p { margin: 6px 0 18px; font-size: 14px; line-height: 1.8; color: #5e6a5b; }
details { border-bottom: 1px solid #e1e5dd; }
summary { padding: 15px 4px; cursor: pointer; font-weight: 600; }
ul { list-style: none; padding: 0; margin: 0; }
li { padding: 10px 4px; }
a { color: #3345c2; text-underline-offset: 5px; font-size: 16px; font-weight: 550; }
a:focus-visible, summary:focus-visible { outline: 2px solid #3348de; outline-offset: 3px; border-radius: 4px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 600px) { p { font-size: 16px; } }
</style>
