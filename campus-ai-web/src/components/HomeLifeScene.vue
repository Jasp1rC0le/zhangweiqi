<script setup>
import NavigationIcon from '@/components/NavigationIcon.vue'
</script>

<template>
  <div class="life-scene" role="img" aria-label="课表、校园墙与食堂评分的功能视觉示意">
    <span class="scene-track track-one" aria-hidden="true"></span>
    <span class="scene-track track-two" aria-hidden="true"></span>
    <div class="scene-app app-schedule"><span class="app-square"><NavigationIcon name="timetable" /></span><span>每一节课</span></div>
    <div class="scene-app app-wall"><span class="app-square"><NavigationIcon name="wall" /></span><span>每一次遇见</span></div>
    <div class="scene-app app-food"><span class="app-square"><NavigationIcon name="canteen" /></span><span>每一顿好饭</span></div>
    <p class="scene-caption">把校园日常，放在一起。</p>
  </div>
</template>

<style scoped>
.life-scene { position: relative; min-height: 540px; overflow: hidden; color: #68452e; background: #f3dfc4; }
.scene-track { position: absolute; inset: 11% auto auto -16%; width: 96%; aspect-ratio: 1; border: 1px solid #bfa17e; border-radius: 50%; opacity: .5; }
.track-two { inset: 22% -19% auto auto; width: 82%; border-color: #fff8e8; }
.scene-app { position: absolute; display: grid; justify-items: center; gap: 16px; font-size: 14px; font-weight: 500; }
.app-square { display: grid; place-items: center; width: clamp(110px, 12vw, 170px); aspect-ratio: 1; border-radius: 29%; box-shadow: 0 26px 40px -16px #5d3c2f38; }
.app-square .navigation-icon { width: 47%; height: 47%; }
.app-schedule { top: 12%; left: 13%; rotate: -11deg; }
.app-schedule .app-square { color: #b5304a; background: #ffe8e9; }
.app-wall { top: 17%; right: 13%; rotate: 12deg; }
.app-wall .app-square { color: #7543b7; background: #eee4ff; }
.app-food { top: 48%; left: 37%; rotate: -6deg; }
.app-food .app-square { color: #8c4d12; background: #fff4d7; }
.scene-caption { position: absolute; bottom: 32px; inset-inline: 24px; margin: 0; text-align: center; font-size: 15px; }
@media (max-width: 1100px) { .app-square { width: 120px; } .app-schedule { left: 9%; } .app-wall { right: 9%; } }
@media (max-width: 760px) { .life-scene { min-height: 420px; } .app-square { width: 112px; } .scene-app { gap: 12px; font-size: 12px; } .app-schedule { top: 10%; left: 11%; } .app-wall { top: 15%; right: 11%; } .app-food { top: 46%; left: 36%; } .scene-caption { bottom: 22px; font-size: 14px; } }
</style>
