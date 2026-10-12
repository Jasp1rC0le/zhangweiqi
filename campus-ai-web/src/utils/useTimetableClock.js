import { onBeforeUnmount, onMounted, ref } from 'vue'
export function useTimetableClock() {
  const now = ref(new Date())
  let timer
  const update = () => {
    now.value = new Date()
  }
  onMounted(() => {
    timer = setInterval(update, 60000)
    document.addEventListener('visibilitychange', update)
  })
  onBeforeUnmount(() => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', update)
  })
  return now
}
