import { computed, reactive, toRefs, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { readCourseSchedule } from '@/api/courseSchedule'
import { createPrivateCourseSchedule } from '@/utils/privateCourseSchedule'
export const useCourseScheduleStore = defineStore('courseSchedule', () => {
  const auth = useAuthStore(),
    state = reactive({ schedule: null, loaded: false, loading: false, error: '' })
  const principal = computed(() => (auth.user ? `${auth.user.id}:${auth.user.schoolId}` : ''))
  const resource = createPrivateCourseSchedule({
    owner: () => principal.value,
    state,
    read: readCourseSchedule,
  })
  watch(principal, resource.reset, { flush: 'sync' })
  return { ...toRefs(state), principal, ...resource }
})
