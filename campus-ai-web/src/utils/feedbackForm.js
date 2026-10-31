export function feedbackPayload(form, fallbackName = '') {
  const clean = key => String(form[key] || '').trim()
  const message = clean('message')
  return {
    name: clean('name') || String(fallbackName).trim(),
    contact: clean('contact'),
    subject: clean('subject') || message.split(/\r?\n/)[0].slice(0, 120),
    message,
  }
}
