<template>
  <div class="canteen-preview">
    <div class="meal-heading"><span>CAMPUS TABLE</span><small>把下一顿，选得更合心意</small></div>
    <div class="meal-illustration" aria-hidden="true">
      <svg viewBox="0 0 480 350" fill="none">
        <defs>
          <linearGradient id="tray-surface" x1="80" y1="30" x2="400" y2="320" gradientUnits="userSpaceOnUse"><stop stop-color="#fffef7"/><stop offset="1" stop-color="#e4ddc9"/></linearGradient>
          <linearGradient id="rice-surface" x1="100" y1="80" x2="280" y2="280" gradientUnits="userSpaceOnUse"><stop stop-color="#fffefa"/><stop offset="1" stop-color="#f1e8cf"/></linearGradient>
          <linearGradient id="tomato-surface" x1="290" y1="65" x2="390" y2="180" gradientUnits="userSpaceOnUse"><stop stop-color="#e99367"/><stop offset="1" stop-color="#bc603d"/></linearGradient>
        </defs>
        <g class="meal-tray">
          <rect x="51" y="28" width="348" height="292" rx="49" fill="url(#tray-surface)" stroke="#fffef9" stroke-width="3"/>
          <rect x="67" y="44" width="316" height="260" rx="37" stroke="#c9bea6" stroke-opacity=".65"/>
          <rect x="82" y="59" width="176" height="228" rx="30" fill="#d6ceb7"/>
          <rect x="272" y="59" width="96" height="110" rx="26" fill="#d7c8ad"/>
          <rect x="272" y="183" width="96" height="104" rx="26" fill="#d7c8ad"/>
          <path d="M103 114C99 75 141 66 175 78C205 62 251 97 241 129C259 159 245 219 219 237C187 268 130 257 107 228C86 204 86 142 103 114Z" fill="url(#rice-surface)"/>
          <g stroke="#ddd3b8" stroke-width="4" stroke-linecap="round" opacity=".65"><path d="m119 116 7 5m23-30 2 8m41-4 7 4m-91 55 7 3m15 19 8-3m-29 32 6 4m18 20 8-1m53 8 7-4m22-27 6 1m14-55-6 4m-71-20 6 4"/></g>
          <path d="M137 141C138 113 173 109 190 124C217 114 237 140 226 160C244 184 222 211 199 203C178 229 145 213 148 193C121 192 118 156 137 141Z" fill="#fffef4" stroke="#e1d6b8"/>
          <circle cx="179" cy="163" r="27" fill="#eeb64f"/><path d="M163 154c4-9 14-13 21-9" stroke="#ffe7a3" stroke-width="6" stroke-linecap="round"/>
          <g fill="url(#tomato-surface)"><path d="M286 88c21-29 58-15 62 4l-31 24Z"/><path d="m294 128 37-21 23 27c-13 27-48 26-60-6Z"/></g>
          <g stroke="#ffd19c" stroke-width="3" stroke-linecap="round"><path d="m315 86 5 11m17-7-7 8m-21 33 13-9m15 9-8-8"/></g>
          <g fill="#759369"><ellipse cx="302" cy="215" rx="14" ry="22" transform="rotate(-35 302 215)"/><ellipse cx="336" cy="218" rx="18" ry="23" transform="rotate(35 336 218)"/><ellipse cx="308" cy="251" rx="18" ry="22" transform="rotate(-48 308 251)"/><ellipse cx="341" cy="251" rx="14" ry="21" transform="rotate(36 341 251)"/></g>
          <path d="m291 203 23 25m30-25-15 29m-35 8 24 16m28-19-14 24" stroke="#c0cea1" stroke-width="3" stroke-linecap="round"/>
        </g>
        <g stroke-linecap="round"><path d="m432 52-8 249" stroke="#745841" stroke-width="7"/><path d="m450 54-10 250" stroke="#97704f" stroke-width="7"/><path d="m432 55-1 44m19-42-2 44" stroke="#c9ab7c" stroke-width="3"/></g>
      </svg>
    </div>
    <div class="meal-glass">
      <span class="meal-label">校园食堂 / 选餐指南</span>
      <strong>今天，吃点什么</strong>
      <p>看看商家，再听听同学怎么说</p>
      <div class="meal-features"><span>商家资料</span><span>学生评分</span><span>用餐短评</span></div>
    </div>
    <small class="meal-caption">餐食插画 · 不代表实际商家或菜品</small>
  </div>
</template>

<style scoped>
.canteen-preview { position:relative; isolation:isolate; width:100%; min-height:560px; padding:32px; display:flex; flex-direction:column; justify-content:space-between; overflow:hidden; border-radius:36px; background:radial-gradient(ellipse at 90% 15%,#f7dbab 0,transparent 57%),radial-gradient(ellipse at 0 90%,#afbea7 0,transparent 65%),#e8e6d5; box-shadow:inset 0 0 0 1px #fff8,0 18px 60px #5f694411; color:#35483d; }
.meal-heading { display:flex; flex-direction:column; gap:10px; position:relative; z-index:1; }.meal-heading > span { font-size:11px; letter-spacing:.18em; font-weight:650; }.meal-heading small { font-size:14px; color:#63715d; }
.meal-illustration { margin:-8px -22px -34px; transform:rotate(-9deg); }.meal-illustration svg { width:100%; max-height:330px; overflow:visible; }.meal-tray { filter:drop-shadow(0 16px 12px #59664729); }
.meal-glass { z-index:1; padding:24px; border:1px solid #ffffffe0; border-radius:26px; background:linear-gradient(130deg,#ffffffb8,#ffffff64); backdrop-filter:blur(20px) saturate(1.2); -webkit-backdrop-filter:blur(20px) saturate(1.2); box-shadow:inset 0 1px 0 #fff,0 8px 25px #46553b0a; }
.meal-label { font-size:12px; color:#687660; }.meal-glass strong { display:block; margin:12px 0 8px; font-size:clamp(28px,3.2vw,42px); letter-spacing:-.055em; font-weight:550; }.meal-glass p { margin:0; font-size:14px; line-height:1.7; color:#687361; }.meal-features { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }.meal-features span { padding:7px 11px; border-radius:999px; background:#ffffff70; box-shadow:inset 0 0 0 1px #ffffff8c; font-size:12px; }.meal-caption { margin-top:18px; font-size:11px; color:#687560; text-align:center; }
@media(max-width:760px) { .canteen-preview { min-height:510px; padding:24px; border-radius:30px; }.meal-illustration { margin:0 -22px -16px; }.meal-glass { padding:20px; border-radius:23px; }.meal-glass strong { font-size:30px; }.meal-features { gap:5px; }.meal-features span { padding:6px 9px; font-size:11px; } }
@supports not (backdrop-filter:blur(1px)) { .meal-glass { background:#f6f6ecef; } }
</style>
