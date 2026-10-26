import { addDays, dayNumber, mondayOf } from './timetable.js'

export function validPickerDate(value) {
  try { dayNumber(value); return Number(value.slice(0, 4)) > 0 } catch { return false }
}
// Match HTML date-input values: partial editing remains local, never a partial date in host forms.
export function pickerInputValue(value) { return validPickerDate(value) ? value : '' }
export function pickerDateAllowed(value, { min = '', max = '', mondayOnly = false } = {}) {
  return validPickerDate(value) && (!validPickerDate(min) || value >= min) &&
    (!validPickerDate(max) || value <= max) && (!mondayOnly || mondayOf(value) === value)
}
export function pickerMonthDays(year, month) {
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
  if (!validPickerDate(first)) return []
  const start = mondayOf(first)
  return Array.from({ length: 42 }, (_, i) => {
    const value = addDays(start, i)
    return { value, day: Number(value.slice(8)), outside: value.slice(0, 7) !== first.slice(0, 7) }
  })
}
export function shiftPickerMonth(value, delta) {
  if (!validPickerDate(value) || !Number.isInteger(delta)) return value
  const index = Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1 + delta
  const year = Math.floor(index / 12), month = index % 12 + 1
  if (year < 1 || year > 9999 || month < 1) return value
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
  for (let day = Number(value.slice(8)); day > 0; day--) {
    const result = `${prefix}-${String(day).padStart(2, '0')}`
    if (validPickerDate(result)) return result
  }
  return value
}
export function pickerKeyDate(value, key, shift = false) {
  if (!validPickerDate(value)) return value
  const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (key in offsets) return addDays(value, offsets[key])
  if (key === 'Home') return mondayOf(value)
  if (key === 'End') return addDays(mondayOf(value), 6)
  if (key === 'PageUp' || key === 'PageDown') return shiftPickerMonth(value, (key === 'PageUp' ? -1 : 1) * (shift ? 12 : 1))
  return value
}
