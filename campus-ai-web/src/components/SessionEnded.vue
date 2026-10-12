<template>
  <main class="session-ended" aria-labelledby="session-ended-title">
    <section role="status">
      <h1 id="session-ended-title">登录状态已变更</h1>
      <p>当前页面已停止访问账号数据，请重新登录后继续</p>
      <a href="/login?reauth=1">重新登录</a>
    </section>
  </main>
</template>
<style scoped>
.session-ended { min-height:100svh; display:grid; place-items:center; padding:24px; background:#f8f7f3; color:#273044; }
section { width:min(100%,520px); }
h1 { font-size:clamp(26px,5vw,36px); letter-spacing:-.03em; }
p { color:#515d51; font-size:16px; line-height:1.8; }
a { display:inline-block; margin-top:20px; padding:14px 24px; border-radius:24px; color:#fff; background:#3547e1; text-decoration:none; }
a:focus-visible { outline:3px solid #3547e1; outline-offset:4px; }
</style>
