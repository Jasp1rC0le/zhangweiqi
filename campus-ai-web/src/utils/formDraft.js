// Compare against the editor's starting fields, not a later server refresh.
export function captureDraftFields(form, fields) {
  return Object.freeze(Object.fromEntries(fields.map((key) => [key, String(form[key] ?? '')])))
}

export function hasDraftFieldChanges(form, baseline) {
  return Object.keys(baseline).some((key) => String(form[key] ?? '') !== baseline[key])
}
