<script setup>
import CampMark from '../src/components/CampMark.vue'
</script>

<template>
  <main class="review-exit" aria-labelledby="review-exit-title">
    <section>
      <CampMark class="exit-mark" />
      <h1 id="review-exit-title">已退出模拟验收</h1>
      <p>模拟身份已清除，正式账号的登录状态没有改变。</p>
      <nav aria-label="退出后的操作">
        <a class="primary" href="/login">打开正式网站</a>
        <a href="/design-review.html?page=workspace&amp;assistant=1&amp;teachingFlow=1&amp;materialIntake=1">重新开始模拟</a>
      </nav>
    </section>
  </main>
</template>

<style scoped>
.review-exit{min-height:100svh;display:grid;place-items:center;box-sizing:border-box;padding:24px;background:#f7f9fc;color:#29323c;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}
.review-exit section{width:min(100%,520px)}.exit-mark{width:44px;height:44px;color:#0b62db;margin-bottom:22px}
h1{font-size:clamp(26px,5vw,34px);line-height:1.3;letter-spacing:-.025em;margin:0 0 16px;font-weight:600}
p{font-size:16px;line-height:1.75;color:#5d6876;margin:0 0 28px}
nav{display:flex;gap:12px;flex-wrap:wrap}a{min-height:44px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;padding:12px 18px;border-radius:12px;color:#084db0;background:#eaf2ff;font-size:16px;line-height:1.4;text-decoration:none}.primary{color:#fff;background:#0b62db}a:hover{filter:brightness(.96)}a:focus-visible{outline:2px solid #0b62db;outline-offset:4px}
</style>
