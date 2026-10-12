import { computed, reactive, toRefs, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { readTimetable, readTimetableImage } from '@/api/timetable'
import { createPrivateTimetable } from '@/utils/privateTimetable'
export const useTimetableStore = defineStore('timetable', () => {
  const auth = useAuthStore(),
    state = reactive({ timetable: null, imageUrl: '', loading: false, loaded: false, error: '' })
  const principal = computed(() => (auth.user ? `${auth.user.id}:${auth.user.schoolId}` : ''))
  const resource = createPrivateTimetable({
    owner: () => principal.value,
    state,
    read: readTimetable,
    readImage: readTimetableImage,
    createUrl: (blob) => URL.createObjectURL(blob),
    revokeUrl: (url) => URL.revokeObjectURL(url),
  })
  watch(principal, resource.reset, { flush: 'sync' })
  return { ...toRefs(state), principal, ...resource }
})
