import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { createClassReminders } from '@/utils/classReminders'
import { queryOwnTimetable } from '@/api/unifiedTimetable'

export const useClassReminderStore = defineStore('classReminders', () => {
  const state = reactive({ enabled: false, minutes: 10, result: null, loading: false, error: '', banner: null, checkedAt: 0, storageUnavailable: false })
  let controller
  function attach(owner, preferenceOwner) {
    controller?.dispose()
    let storage
    try { storage = window.localStorage } catch { /* Live reminders remain available for this page. */ }
    controller = createClassReminders({ state, owner, preferenceOwner, read: queryOwnTimetable, storage,
      visible: () => document.visibilityState === 'visible',
      claim: (name, work) => window.navigator.locks?.request ? window.navigator.locks.request(name, work) : work() })
    controller.syncOwner()
    if (state.enabled) void controller.refresh()
  }
  return { state, attach, syncOwner() { controller?.syncOwner(); if (state.enabled) void controller.refresh() },
    configure: (enabled, minutes) => controller?.configure(enabled, minutes),
    refresh: () => controller?.refresh(),
    pulse() { if (state.enabled) return controller?.needsRefresh() ? controller.refresh() : controller?.tick() },
    suspend() { controller?.suspend() }, dismiss() { controller?.dismiss() },
    storageChanged(key) { if (controller?.storageChanged(key) && state.enabled) void controller.refresh() },
    detach() { controller?.dispose(); controller = null; state.enabled = false; state.banner = null } }
})
