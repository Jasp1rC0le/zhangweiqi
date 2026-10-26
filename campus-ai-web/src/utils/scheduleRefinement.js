import { validScheduleQuery, requestScheduleQuery } from './scheduleIntent.js'
import { validScheduleScope } from './schedulePerspective.js'

const fields = new Set(['version', 'courseChoices', 'availableCount', 'choicesComplete'])
export function validScheduleRefinement(value, answer) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.has(key)) ||
    value.version !== 1 ||
    !Number.isInteger(value.availableCount) ||
    value.availableCount < 1 ||
    value.availableCount > 10000 ||
    typeof value.choicesComplete !== 'boolean' ||
    !Array.isArray(value.courseChoices) ||
    value.courseChoices.length > 200 ||
    value.courseChoices.length > value.availableCount ||
    new Set(value.courseChoices).size !== value.courseChoices.length ||
    !value.courseChoices.every(
      (name) => typeof name === 'string' && name.trim() && name.length <= 100,
    ) ||
    answer.count !== 0 ||
    answer.focus != null ||
    !answer.course ||
    answer.display?.state !== 'UNRESOLVED' ||
    !Array.isArray(answer.display.entries) ||
    answer.display.entries.length ||
    !Array.isArray(answer.display.freeDates) ||
    answer.display.freeDates.length
  )
    return false
  return value.choicesComplete
    ? value.courseChoices.length > 0
    : value.courseChoices.length === 0 && value.availableCount > 200
}

export function refineScheduleQuery(message, name, scope) {
  const previous = message?.scheduleQuery,
    result = message?.scheduleResult
  if (
    !scope ||
    previous?.scope !== scope ||
    !message.localSchedule ||
    !validScheduleQuery(previous) ||
    !result ||
    !validScheduleScope(result.queryScope,previous,result) ||
    !validScheduleRefinement(result.refinement, result) ||
    !['from', 'to', 'period', 'selection', 'detail'].every(
      (key) => previous[key] === result[key],
    ) ||
    (previous.course || '') !== (result.course || '') ||
    (previous.anchor || '') !== (result.anchor || '') ||
    typeof name !== 'string' ||
    name.length > 100 ||
    (name !== '' && !result.refinement.courseChoices.includes(name))
  )
    throw new Error('候选课程或查询归属已变化，请重新查询；没有改用其他账号或自动更改课表。')
  return { ...requestScheduleQuery(previous), course: name }
}
