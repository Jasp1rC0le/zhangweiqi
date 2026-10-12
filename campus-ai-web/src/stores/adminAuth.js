import { computed } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { isAdministrator } from '@/utils/adminAccess'

export const useAdminAuthStore = defineStore('adminAuth', () => {
  const auth = useAuthStore()
  const user = computed(() => isAdministrator(auth.user) ? auth.user : null)
  const isLoggedIn = computed(() => auth.isLoggedIn && Boolean(user.value))
  async function loadCurrentUser() {
    await auth.loadCurrentUser()
    if (!isAdministrator(auth.user)) throw new Error('该账户没有管理员权限')
    return user.value
  }
  return { user, isLoggedIn, loadCurrentUser, logout: auth.logout }
})
