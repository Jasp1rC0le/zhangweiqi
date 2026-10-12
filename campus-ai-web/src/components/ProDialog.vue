<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import CampMark from './CampMark.vue'
const props = defineProps({ modelValue: Boolean, inline: Boolean })
const emit = defineEmits(['update:modelValue', 'present-change'])
const panel = ref()
const closeButton = ref()
const reduceMotion = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
let previousFocus
let previousOverflow
let locked = false
const close = () => emit('update:modelValue', false)
function keyboard(event) {
  if(props.inline) return
  if (event.key === 'Escape') { event.stopPropagation(); close() }
  if (event.key !== 'Tab') return
  const buttons = [...(panel.value?.querySelectorAll('button:not(:disabled), a[href]') || [])]
  const first = buttons[0]
  const last = buttons.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
watch(() => props.modelValue, async (open) => {
  if(props.inline) return
  if (open) {
    reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!locked) {
      previousFocus = document.activeElement
      previousOverflow = document.body.style.overflow
    }
    locked = true
    emit('present-change', true)
    document.body.style.overflow = 'hidden'
    await nextTick()
    closeButton.value?.focus({ preventScroll: true })
  }
}, { immediate: true })
async function finishClose() {
  if (props.modelValue || !locked) return
  document.body.style.overflow = previousOverflow || ''
  locked = false
  emit('present-change', false)
  await nextTick()
  if (previousFocus?.isConnected && previousFocus.getClientRects().length && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true })
  else document.querySelector('.mobile-menu-button')?.focus({ preventScroll: true })
}
onBeforeUnmount(() => { if (locked) document.body.style.overflow = previousOverflow || '' })
</script>

<template>
  <Teleport to="body" :disabled="inline">
    <Transition name="pro-reveal" appear :duration="{ enter: reduceMotion ? 0 : 1900, leave: reduceMotion ? 0 : 300 }" @after-leave="finishClose">
      <div v-if="modelValue" class="pro-curtain" :class="{'pro-inline':inline}" @mousedown.self="!inline && close()" @keydown="keyboard">
        <section ref="panel" class="pro-suite" :role="inline?'region':'dialog'" :aria-modal="inline?undefined:true" aria-labelledby="pro-heading" aria-describedby="pro-summary">
          <button ref="closeButton" class="pro-close" type="button" aria-label="关闭 Pro 介绍" @click="close"><span></span><span></span></button>
          <div class="pro-atelier">
            <div class="pro-signature"><CampMark /><span>Campthink.</span></div>
            <div class="pro-object" aria-hidden="true">
              <div class="pro-plaque"><CampMark /><span>PRO</span><small>ROOM TO GO FURTHER</small></div>
            </div>
            <p class="pro-art-caption">让潜力，<br />有更远的去处</p>
            <span class="pro-edition">THE NEXT CHAPTER</span>
          </div>
          <div class="pro-content">
            <p class="pro-kicker">CAMPTHINK <span>PRO</span></p>
            <h2 id="pro-heading">为下一步，<br />多想一步</h2>
            <p id="pro-summary" class="pro-intro">让重要的任务，少一点返工。<br />从课程项目，到作品与实习准备。</p>
            <div class="pro-benefits" aria-label="规划中的 Pro 能力">
              <div><span class="pro-gem" aria-hidden="true">◇</span><p><strong>少一点返工</strong><small>规划接入专业工具复算与提交前深度检查</small></p></div>
              <div><span class="pro-gem" aria-hidden="true">◇</span><p><strong>不必反复交代</strong><small>围绕持续项目、材料版本与已确认要求展开分析</small></p></div>
              <div><span class="pro-gem" aria-hidden="true">◇</span><p><strong>把成果带向下一步</strong><small>从修改、答辩到作品集与实习准备</small></p></div>
            </div>
            <div class="pro-launch"><span>筹备中</span><p>深度能力尚未开放购买。基础项目整理与缺项检查免费。</p></div>
            <button class="pro-return" type="button" @click="close">继续探索 Campthink <span aria-hidden="true">↗</span></button>
            <small class="pro-terms">正式上线前公示价格、额度与退款规则。会员同样无广告。</small>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pro-curtain.pro-inline { position:relative;inset:auto;z-index:0;min-height:calc(100dvh - 90px);background:transparent;backdrop-filter:none;padding:32px; }
.pro-inline .pro-suite { max-height:none; width:min(1040px,100%);box-shadow:0 16px 50px #2833440c; }
@media(max-width:760px){.pro-curtain.pro-inline{padding:16px}}
.pro-curtain { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 28px; overflow-y: auto; background: #18202275; backdrop-filter: blur(12px); }
.pro-suite { position: relative; display: grid; grid-template-columns: .82fr 1fr; width: min(820px, 100%); max-height: calc(100dvh - 56px); overflow-y: auto; color: #302d27; background: #fbf9f4; border: 1px solid #e8dfce; border-radius: 22px; box-shadow: 0 40px 140px #0b141a50, 0 1px 0 #fff inset; }
.pro-close { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; display: grid; place-items: center; z-index: 2; color: #60594e; background: #eae4d77d; border: 1px solid #ded5c5; border-radius: 50%; cursor: pointer; }
.pro-close span { position: absolute; width: 13px; height: 1.5px; background: currentColor; transform: rotate(45deg); }
.pro-close span + span { transform: rotate(-45deg); }
.pro-close:hover { background: #e2d9c6; }
.pro-suite button:focus-visible { outline: 2px solid #987942; outline-offset: 4px; }
.pro-atelier { position: relative; display: flex; flex-direction: column; padding: 34px 30px 28px; overflow: hidden; color: #e5d5b5; background: radial-gradient(ellipse at 80% 40%, #53615a66, transparent 70%), #24322f; }
.pro-signature { display: flex; align-items: center; gap: 9px; color: #e7dfd0; font-size: 18px; letter-spacing: -.04em; font-weight: 550; }
.pro-signature .camp-mark { width: 24px; height: 24px; --mark-color: #ddc494; }
.pro-object { display: grid; place-items: center; flex: 1; min-height: 280px; perspective: 900px; }
.pro-plaque { position: relative; display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end; width: 205px; height: 262px; padding: 24px; overflow: hidden; border-radius: 10px; color: #3e3522; background: linear-gradient(125deg, #b69863, #e7d7b3 31%, #c5ac7c 65%, #a58855); border: 1px solid #ecdbb2; transform: rotate(-9deg) rotateY(-14deg); box-shadow: -2px 1px 0 #8d7345, -5px 5px 0 #ab9265, 16px 28px 35px #0005, inset 0 0 0 7px #e7d4ac40; }
.pro-plaque::before { content: ''; position: absolute; inset: -25%; z-index: 2; background: linear-gradient(110deg, transparent 30%, #fff8df08 39%, #fff8df88 49%, #fff8df12 58%, transparent 67%); transform: translateX(115%); pointer-events: none; }
.pro-plaque::after { content: ''; position: absolute; inset: 13px; border: 1px solid #66502e35; border-radius: 4px; pointer-events: none; }
.pro-plaque .camp-mark { width: 53px; height: 53px; margin-bottom: auto; --mark-color: #544326; }
.pro-plaque > span { font-size: 32px; letter-spacing: .14em; font-weight: 600; }
.pro-plaque > small { margin-top: 7px; font-size: 7px; letter-spacing: .13em; }
.pro-art-caption { margin: 20px 0; font-size: 26px; font-weight: 400; line-height: 1.55; letter-spacing: .03em; }
.pro-edition { font-size: 8px; letter-spacing: .21em; color: #bcbcae; }
.pro-content { padding: 48px 38px 30px; }
.pro-kicker { margin: 0 0 25px; font-size: 10px; letter-spacing: .18em; color: #80663e; }
.pro-kicker span { margin-left: 7px; padding-left: 10px; border-left: 1px solid #c6b591; }
.pro-content h2 { margin: 0; color: #302d27; font-size: clamp(30px, 3vw, 40px); font-weight: 550; line-height: 1.32; letter-spacing: -.045em; }
.pro-intro { margin: 17px 0 23px; color: #726b5f; font-size: 13px; line-height: 1.9; }
.pro-benefits { border-top: 1px solid #e4ded1; }
.pro-benefits > div { display: flex; gap: 14px; align-items: center; padding: 16px 0; border-bottom: 1px solid #e4ded1; }
.pro-gem { font-size: 25px; color: #93713d; }
.pro-benefits p { margin: 0; display: grid; gap: 5px; }
.pro-benefits strong { font-size: 13px; color: #363229; font-weight: 600; }
.pro-benefits small { color: #746d61; font-size: 11px; line-height: 1.6; }
.pro-launch { display: flex; gap: 9px; align-items: center; margin: 24px 0 14px; }
.pro-launch > span { flex: none; font-size: 10px; color: #796238; border: 1px solid #dbceb2; border-radius: 4px; padding: 3px 6px; }
.pro-launch p { margin: 0; font-size: 11px; color: #70695b; }
.pro-return { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 46px; padding: 0 15px; border: 1px solid #293e35; border-radius: 7px; color: #f4eddf; background: #293e35; font-size: 12px; cursor: pointer; transition: background 180ms; }
.pro-return:hover { background: #3b5146; }
.pro-return span { font-size: 18px; }
.pro-terms { display: block; margin-top: 13px; color: #797165; font-size: 9px; line-height: 1.7; }
.pro-reveal-enter-active { transition: opacity 550ms ease; }
.pro-reveal-leave-active { transition: opacity 300ms ease; }
.pro-reveal-enter-active .pro-suite { transition: opacity 600ms, transform 850ms cubic-bezier(.22,1,.36,1); }
.pro-reveal-leave-active .pro-suite { transition: opacity 250ms, transform 300ms ease; }
.pro-reveal-enter-from, .pro-reveal-leave-to { opacity: 0; }
.pro-reveal-enter-from .pro-suite, .pro-reveal-leave-to .pro-suite { opacity: 0; transform: translateY(22px) scale(.975); }
.pro-reveal-enter-active .pro-plaque { animation: plaque-arrive 1400ms 180ms cubic-bezier(.16,1,.3,1) both; }
.pro-reveal-enter-active .pro-plaque::before { animation: plaque-sheen 1400ms 430ms cubic-bezier(.22,1,.36,1) both; }
.pro-reveal-enter-active .pro-signature,
.pro-reveal-enter-active .pro-art-caption,
.pro-reveal-enter-active .pro-edition,
.pro-reveal-enter-active .pro-content > *,
.pro-reveal-enter-active .pro-benefits > div { animation: pro-detail 750ms var(--reveal-delay, 250ms) cubic-bezier(.22,1,.36,1) both; }
.pro-art-caption { --reveal-delay: 600ms; }
.pro-edition { --reveal-delay: 800ms; }
.pro-content h2 { --reveal-delay: 400ms; }
.pro-intro { --reveal-delay: 520ms; }
.pro-benefits { --reveal-delay: 620ms; }
.pro-benefits > div:nth-child(1) { --reveal-delay: 650ms; }
.pro-benefits > div:nth-child(2) { --reveal-delay: 780ms; }
.pro-benefits > div:nth-child(3) { --reveal-delay: 910ms; }
.pro-launch, .pro-return, .pro-terms { --reveal-delay: 980ms; }
@keyframes plaque-arrive { 0% { opacity: 0; transform: translateY(48px) rotate(-21deg) rotateY(-38deg) scale(.89); } 40% { opacity: 1; } 100% { opacity: 1; transform: rotate(-9deg) rotateY(-14deg); } }
@keyframes plaque-sheen { from { transform: translateX(-115%); opacity: 0; } 25% { opacity: 1; } to { transform: translateX(115%); opacity: 0; } }
@keyframes pro-detail { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 640px) {
  .pro-curtain { padding: 12px; }
  .pro-suite { grid-template-columns: 1fr; max-height: calc(100dvh - 24px); border-radius: 17px; }
  .pro-atelier { min-height: 170px; padding: 23px; }
  .pro-signature { font-size: 16px; }
  .pro-object { position: absolute; right: 30px; top: 22px; min-height: 0; }
  .pro-plaque { width: 100px; height: 134px; padding: 14px; }
  .pro-plaque .camp-mark { width: 27px; height: 27px; }
  .pro-plaque > span { font-size: 19px; }
  .pro-plaque > small { display: none; }
  .pro-art-caption { font-size: 20px; margin: 22px 0 0; }
  .pro-edition { display: none; }
  .pro-close { color: #efe5d0; background: #293e35; border-color: #758073; top: 10px; right: 10px; }
  .pro-content { padding: 25px 23px; }
  .pro-kicker { margin-bottom: 16px; }
  .pro-content h2 { font-size: 29px; }
  .pro-benefits > div { padding: 12px 0; }
  .pro-launch { flex-wrap: wrap; margin-top: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .pro-reveal-enter-active, .pro-reveal-leave-active, .pro-reveal-enter-active .pro-suite, .pro-reveal-leave-active .pro-suite { transition: none; }
  .pro-reveal-enter-active .pro-plaque, .pro-reveal-enter-active .pro-plaque::before, .pro-reveal-enter-active .pro-signature, .pro-reveal-enter-active .pro-art-caption, .pro-reveal-enter-active .pro-edition, .pro-reveal-enter-active .pro-content > *, .pro-reveal-enter-active .pro-benefits > div { animation: none; }
}
</style>
